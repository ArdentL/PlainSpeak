"""Prepare project-local skills and reviewable MCP snippets; never edit global config."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]


def skill_name(source: Path) -> str:
    """Read the required scalar name from the supported SKILL frontmatter subset."""
    lines = (source / "SKILL.md").read_text(encoding="utf-8-sig").splitlines()
    if not lines or lines[0] != "---":
        raise ValueError(f"Missing skill frontmatter: {source.name}")
    try:
        end = lines.index("---", 1)
    except ValueError as exc:
        raise ValueError(f"Unclosed skill frontmatter: {source.name}") from exc
    names = [line[len("name:"):].strip() for line in lines[1:end] if line.startswith("name:")]
    if len(names) != 1:
        raise ValueError(f"Expected exactly one skill name: {source.name}")
    name = names[0]
    if len(name) >= 2 and name[0] == name[-1] and name[0] in "\"'":
        name = name[1:-1]
    if not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name):
        raise ValueError(f"Unsafe or unsupported canonical skill name: {source.name}")
    return name


def prepare(client: str, output: Path, interpreter: Path, extra_skills: list[str], dry_run: bool) -> list[str]:
    if not interpreter.is_absolute() or not interpreter.is_file():
        raise ValueError("--python must name an existing absolute Python executable")
    output = output.resolve()
    sources = [ROOT / "skills" / name for name in ("plain-writing", "roundtrip-readability")]
    for name in extra_skills:
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]*", name):
            raise ValueError(f"Invalid extra skill name: {name}")
        sources.append(ROOT / "third_party" / name)
    if len({source.name for source in sources}) != len(sources):
        raise ValueError("Duplicate skill selection")
    for source in sources:
        if not (source / "SKILL.md").is_file():
            raise ValueError(f"Missing skill bundle: {source.name}")
        if any(path.is_symlink() for path in [source, *source.rglob("*")]):
            raise ValueError(f"Skill bundle contains symlinks: {source.name}")
    names = [skill_name(source) for source in sources]
    if len(set(names)) != len(names):
        raise ValueError("Duplicate canonical skill names")
    server = {"command": str(interpreter), "args": ["-m", "plainspeak.mcp_server"]}
    files: dict[str, str] = {}
    if client == "codex":
        # JSON strings are also valid TOML basic strings for these Windows paths.
        files["plainspeak.codex.snippet.toml"] = (
            "[mcp_servers.plainspeak]\ncommand = " + json.dumps(str(interpreter), ensure_ascii=False)
            + '\nargs = ["-m", "plainspeak.mcp_server"]\ntool_timeout_sec = 300\n'
        )
        skill_dir = output / ".agents" / "skills"
    elif client == "claude":
        files["plainspeak.claude.snippet.json"] = json.dumps(
            {"mcpServers": {"plainspeak": {"type": "stdio", **server}}}, indent=2
        ) + "\n"
        skill_dir = output / ".claude" / "skills"
    else:
        entry = {"transport": "stdio", **server, "enabled": True, "toolCallTimeoutMs": 300000}
        files["plainspeak.harness.settings-entry.json"] = json.dumps(entry, indent=2) + "\n"
        # JSON string quoting is valid in YAML; only per-server Cordis fields belong here.
        lines = ["- id: mcp-plainspeak", "  name: '@deepseek-ai/dsh-mcp-client'", "  config:",
                 "    serverName: plainspeak", "    transport: stdio",
                 "    command: " + json.dumps(str(interpreter), ensure_ascii=False),
                 '    args: ["-m", "plainspeak.mcp_server"]', "    toolCallTimeoutMs: 300000"]
        files["plainspeak.harness.cordis.snippet.yml"] = "\n".join(lines) + "\n"
        skill_dir = output / ".dsh" / "skills"
    files["plainspeak.instructions.md"] = (
        "# Optional daily-use instruction / 可选日常指令\n\n"
        "Always use plain-writing for human-facing prose. When I request a readability pass, use "
        "roundtrip-readability and call the PlainSpeak rewrite_text tool on the draft, "
        "keeping the requested output language. Report failed or retained chunks. "
        "Keep facts and technical literals intact; do not treat translation as fact checking. "
        "Do not apply round trips to code or every short reply automatically.\n\n"
        "面向人的文字默认使用 plain-writing。用户要求回译润色时，使用 roundtrip-readability 并调用 "
        "PlainSpeak 的 rewrite_text，保持要求的输出语言，说明失败或保留原文的段落。"
        "保留事实及技术字面量；回译不等于事实核查。不要自动处理代码或每条短回复。\n"
    )
    files["plainspeak.optional-long-prose.md"] = (
        "# Optional long-prose automation / 可选长文自动回译\n\n"
        "Only adopt this instruction if you want automatic round trips for longer drafts. "
        "After drafting more than 600 characters of human-facing prose, call rewrite_text "
        "using the requested output language. Use its returned text; if report.retained_chunks "
        "is nonzero, retain those original chunks and summarize report.chunks[i].warnings. "
        "If the tool fails, keep the original draft and state the failure briefly. "
        "Do not process code, quoted source material, or short replies. This is an agent "
        "instruction, not a client-wide output interceptor.\n\n"
        "仅在希望长文自动回译时采用：面向人的正文超过 600 字符后调用 rewrite_text，"
        "保持要求的输出语言。采用返回的 text；report.retained_chunks 大于零时保留对应原文，"
        "简述 report.chunks[i].warnings。工具失败则保留草稿并简述原因。"
        "代码、原文引用和短答不处理。这是给 Agent 的指令，不是客户端全局拦截器。\n"
    )
    destinations = [output / name for name in files] + [skill_dir / name for name in names]
    for path in destinations:
        if path.exists() or path.is_symlink():
            raise ValueError(f"Refusing to overwrite existing destination: {path}")
        # Reject symlinked ancestors inside an existing target project.
        if any(parent.is_symlink() for parent in [path.parent, *path.parents]):
            raise ValueError(f"Refusing symlinked destination: {path}")
    if not dry_run:
        output.mkdir(parents=True, exist_ok=True)
        for name, content in files.items():
            with (output / name).open("x", encoding="utf-8", newline="\n") as handle:
                handle.write(content)
        skill_dir.mkdir(parents=True, exist_ok=True)
        for source, name in zip(sources, names):
            shutil.copytree(source, skill_dir / name)
    return [str(path.relative_to(output)) for path in destinations]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--client", choices=("codex", "claude", "harness"), required=True)
    parser.add_argument("--output", type=Path, required=True, help="Prepared bundle or chosen project directory")
    parser.add_argument("--python", type=Path, required=True, help="Absolute interpreter with PlainSpeak[mcp] installed")
    parser.add_argument("--extra-skill", action="append", default=[], help="Explicit bundled third_party/<name> selection")
    parser.add_argument("--dry-run", action="store_true", help="Validate and list destinations without writing")
    args = parser.parse_args()
    try:
        paths = prepare(args.client, args.output, args.python, args.extra_skill, args.dry_run)
    except (ValueError, OSError) as exc:
        print(f"client_setup: {exc}", file=sys.stderr)
        return 2
    print(("Would prepare" if args.dry_run else "Prepared") + ":\n" + "\n".join(paths))
    print("Review and merge the MCP snippet yourself. No client configuration was activated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
