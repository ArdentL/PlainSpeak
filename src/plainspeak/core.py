"""Translation-only round trips with literal guards and source fallback."""

import re
import time
from collections import Counter
from dataclasses import asdict, dataclass, field
from typing import Callable, Protocol

from .languages import Language, resolve_route
from .markdown import segment_markdown, math_literals


class Translator(Protocol):
    def translate(self, text: str, target: Language, *, context: str = '') -> str: ...


class RewriteCancelled(RuntimeError):
    """The caller cancelled between provider calls; no partial result is used."""


@dataclass
class ChunkResult:
    status: str
    source_chars: int
    output_chars: int
    warnings: list[str] = field(default_factory=list)
    seconds: float = 0.0


@dataclass
class RewriteResult:
    text: str
    language: str
    pivot: str
    chunks: list[ChunkResult]
    seconds: float

    def report(self) -> dict:
        return {'language': self.language, 'pivot': self.pivot, 'seconds': self.seconds,
                'chunks': [asdict(chunk) for chunk in self.chunks],
                'retained_chunks': sum(c.status == 'retained' for c in self.chunks),
                'notice': 'Literal guards do not verify semantic equivalence.'}


def _inline(text: str) -> Counter:
    return Counter(m.group() for m in re.finditer(r'(`+)(?:(?!\1).)*?\1', text))


def _urls(text: str) -> Counter:
    return Counter(re.findall(r'https?://[^\s<>`"\u3000-\u303f\uff00-\uffef]+', text))


def _math(text: str) -> Counter:
    return Counter(text[start:end] for start, end in math_literals(text))


def _guards(source: str, output: str, protect_terms: tuple[str, ...]) -> list[str]:
    warnings = []
    for name, extract in [('inline_code_changed', _inline), ('urls_changed', _urls),
                          ('math_changed', _math)]:
        if extract(source) != extract(output):
            warnings.append(name)
    if any(source.count(term) != output.count(term) for term in protect_terms):
        warnings.append('protected_term_changed')
    if not output.strip():
        warnings.append('empty_translation')
    if re.search(r'^ {0,3}(?:`{3,}|~{3,})', output, re.M):
        warnings.append('unexpected_code_fence')
    return warnings


def rewrite(text: str, backend: Translator, *, language: str, pivot: str | None = None,
            chunk_size: int = 750, protect_terms: tuple[str, ...] = (),
            cancelled: Callable[[], bool] | None = None, context: str = '') -> RewriteResult:
    def check_cancelled() -> None:
        if cancelled is not None and cancelled():
            raise RewriteCancelled('Translation was cancelled.')

    check_cancelled()
    if not isinstance(context, str) or len(context) > 2400:
        raise ValueError('Background must be a string of at most 2,400 characters.')
    original, intermediate = resolve_route(language, pivot)
    if len(text) > 200_000:
        raise ValueError('Input exceeds 200,000 characters; split the document first.')
    output, results = [], []
    started = time.perf_counter()
    for segment in segment_markdown(text, chunk_size):
        check_cancelled()
        source = segment.text
        if segment.protected or not any(c.isalpha() for c in source):
            output.append(source)
            results.append(ChunkResult('protected', len(source), len(source)))
            continue
        prefix = re.match(r'^\s*', source).group()
        suffix = re.search(r'\s*$', source).group()
        core = source[len(prefix):len(source) - len(suffix) if suffix else len(source)]
        chunk_start = time.perf_counter()
        try:
            check_cancelled()
            context_args = {'context': context} if context.strip() else {}
            english = backend.translate(core, intermediate, **context_args)
            check_cancelled()
            if not english.strip():
                raise ValueError('Empty first translation')
            back = backend.translate(english, original, **context_args).strip()
            check_cancelled()
            warnings = _guards(core, back, protect_terms)
        except RewriteCancelled:
            raise
        except Exception:
            # Return diagnostics without echoing provider URLs, credentials or source text.
            warnings, back = ['translation_failed'], core
        accepted = not warnings
        chosen = prefix + back + suffix if accepted else source
        output.append(chosen)
        results.append(ChunkResult('rewritten' if accepted else 'retained', len(source), len(chosen),
                                   warnings, time.perf_counter() - chunk_start))
    check_cancelled()
    return RewriteResult(''.join(output), original.code, intermediate.code, results, time.perf_counter() - started)
