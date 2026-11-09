"""Lossless, conservative Markdown segmentation without a parser dependency.

Root/container fences, indented code and oversized literal lines are protected.
Ambiguous indentation may preserve some ordinary list prose. Unclosed fences
preserve the remainder; multiline inline spans are also protected because the
translation guard operates on single-line backtick spans. This is deliberately
conservative rather than a complete CommonMark parser.
"""

import re
from bisect import bisect_right
from dataclasses import dataclass


_MATH = re.compile(
    r'(?<![\\$])\$\$(?!\$)[\s\S]+?(?<!\\)\$\$(?!\$)'
    r'|(?<![\\$])\$(?!\$)(?:\\.|[^$\\])+?(?<!\\)\$(?!\$)'
    r'|\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]'
)


def math_literals(text: str) -> list[tuple[int, int]]:
    """Delimited TeX spans kept whole by segmentation and literal validation."""
    return [(match.start(), match.end()) for match in _MATH.finditer(text)]


@dataclass(frozen=True)
class Segment:
    text: str
    protected: bool = False


def _merge(spans: list[tuple[int, int]]) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    for start, end in sorted(spans):
        if result and start <= result[-1][1]:
            result[-1] = (result[-1][0], max(end, result[-1][1]))
        else:
            result.append((start, end))
    return result


def _literals(text: str) -> list[tuple[int, int]]:
    spans = math_literals(text)
    # Exact-length backtick runs support embedded shorter runs and line breaks.
    runs = list(re.finditer(r"`+", text))
    i = 0
    while i < len(runs):
        opening = runs[i]
        j = i + 1
        while j < len(runs) and len(runs[j].group()) != len(opening.group()):
            j += 1
        if j < len(runs):
            spans.append((opening.start(), runs[j].end()))
            i = j + 1
        else:
            # Treat an unmatched delimiter's remaining line as indivisible.
            end = text.find("\n", opening.end())
            spans.append((opening.start(), len(text) if end < 0 else end))
            i += 1
    for pattern in (
        r"(?:[A-Za-z][A-Za-z0-9+.-]*://|www\.)[^\s<>`\u3000-\u303f\uff00-\uffef]+",
        r"[-+−]?\d+(?:[.,]\d+)*(?:[eE][-+]?\d+)?(?:%|‰)?",
    ):
        spans.extend((m.start(), m.end()) for m in re.finditer(pattern, text))
    return _merge(spans)


def _bounded(text: str, limit: int, spans: list[tuple[int, int]]) -> list[Segment]:
    result = []
    starts = [a for a, _ in spans]

    def safe(position: int) -> bool:
        index = bisect_right(starts, position) - 1
        return index < 0 or not spans[index][0] < position < spans[index][1]

    offset = 0
    while len(text) - offset > limit:
        maximum = offset + limit
        positions = [offset + m.end() for m in
                     re.finditer(r"\n|[。！？；.!?]\s*|\s+", text[offset:maximum])]
        viable = [p for p in positions if p >= offset + limit // 3 and safe(p)]
        if viable:
            cut = max(viable)
        elif safe(maximum):
            cut = maximum
        else:
            # The literal fits the bound but starts after this chunk's prefix.
            cut = spans[bisect_right(starts, maximum) - 1][0]
        if cut <= offset:
            raise ValueError("Unable to bound prose without splitting a literal.")
        result.append(Segment(text[offset:cut]))
        offset = cut
    if offset < len(text):
        result.append(Segment(text[offset:]))
    return result


def _prose(text: str, limit: int) -> list[Segment]:
    spans = _literals(text)
    retained = []
    for start, end in spans:
        if end - start > limit or "\n" in text[start:end] or "\r" in text[start:end]:
            line_start = text.rfind("\n", 0, start) + 1
            line_end = text.find("\n", end)
            retained.append((line_start, len(text) if line_end < 0 else line_end + 1))
    result = []
    cursor = 0
    for start, end in _merge(retained):
        if cursor < start:
            local = [(a - cursor, b - cursor) for a, b in spans if cursor <= a and b <= start]
            result.extend(_bounded(text[cursor:start], limit, local))
        result.append(Segment(text[start:end], True))
        cursor = end
    if cursor < len(text):
        local = [(a - cursor, b - cursor) for a, b in spans if a >= cursor]
        result.extend(_bounded(text[cursor:], limit, local))
    return result


def _unquote(line: str) -> tuple[str, int]:
    depth = 0
    while True:
        match = re.match(r"^ {0,3}>[ \t]?", line)
        if not match:
            return line, depth
        line = line[match.end():]
        depth += 1


def _fence_content(line: str) -> tuple[str, int]:
    line, depth = _unquote(line)
    # List markers may introduce a fence; continuation lines use indentation.
    while True:
        match = re.match(r"^[ \t]*(?:[-+*]|\d+[.)])[ \t]+", line)
        if not match:
            return line.lstrip(" \t"), depth
        line = line[match.end():]
        line, extra_depth = _unquote(line)
        depth += extra_depth


def segment_markdown(text: str, limit: int = 750) -> list[Segment]:
    if limit < 32 or limit > 4000:
        raise ValueError("Chunk size must be between 32 and 4000 characters.")
    lines = text.splitlines(keepends=True)
    result: list[Segment] = []
    prose: list[str] = []
    i = 0

    def flush() -> None:
        if prose:
            result.extend(_prose("".join(prose), limit))
            prose.clear()

    if lines and lines[0].strip() == "---":
        end = next((j for j in range(1, len(lines)) if lines[j].strip() in ("---", "...")), None)
        if end is not None:
            result.append(Segment("".join(lines[:end + 1]), True))
            i = end + 1
    while i < len(lines):
        content, depth = _fence_content(lines[i])
        opening = re.match(r"^(`{3,}|~{3,})", content)
        if opening:
            flush()
            marker = opening.group(1)
            block = [lines[i]]
            i += 1
            closing = re.compile(re.escape(marker[0]) + "{" + str(len(marker)) + r",}\s*$")
            while i < len(lines):
                line = lines[i]
                block.append(line)
                i += 1
                candidate, closing_depth = _fence_content(line)
                if closing_depth == depth and closing.fullmatch(candidate):
                    break
            result.append(Segment("".join(block), True))
            continue
        unquoted, _ = _unquote(lines[i])
        if unquoted.expandtabs(4).startswith("    "):
            flush()
            result.append(Segment(lines[i], True))
        else:
            prose.append(lines[i])
        i += 1
    flush()
    return result
