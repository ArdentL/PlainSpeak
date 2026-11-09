"""CLI operations never modify the input or client configuration."""

import argparse
import json
import os
import sys
from dataclasses import replace
from pathlib import Path

from . import __version__
from .backend import create_backend, Settings
from .core import rewrite
from .languages import LANGUAGES, resolve_route
from .markdown import segment_markdown


def _settings(args: argparse.Namespace) -> Settings:
    settings = Settings.from_env()
    updates = {name: getattr(args, name) for name in ('provider', 'model', 'base_url') if getattr(args, name, None)}
    if 'provider' in updates and 'base_url' not in updates and settings.provider != updates['provider']:
        updates['base_url'] = 'http://127.0.0.1:11434' if updates['provider'] == 'ollama' else 'http://127.0.0.1:8080/v1'
    if 'provider' in updates and settings.provider != updates['provider'] and 'model' not in updates and 'PLAINSPEAK_MODEL' not in os.environ:
        updates['model'] = 'hy-mt2-1.8b-q4' if updates['provider'] == 'managed' else 'plainspeak-hy'
    if updates.get('provider', settings.provider) == 'managed' and getattr(args, 'model', None):
        raise ValueError('Select a managed model with plainspeak models use MODEL_ID.')
    if updates.get('provider', settings.provider) == 'managed' and getattr(args, 'base_url', None):
        raise ValueError('Managed mode chooses a private local port; use --provider openai for an external URL.')
    return replace(settings, **updates)


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog='plainspeak', description='Clear-writing skills and guarded local translation round trips.')
    parser.add_argument('--version', action='version', version=__version__)
    sub = parser.add_subparsers(dest='command', required=True)
    sub.add_parser('languages', help='List configured translation language labels.')
    sub.add_parser('mcp', help='Run the official SDK stdio MCP server; requires .[mcp].')
    setup = sub.add_parser('setup', help='Install a small local model and its portable runtime; no Ollama needed.')
    setup.add_argument('--model', help='Model catalog ID; defaults to the small Hy-MT2 1.8B Q4.')
    setup.add_argument('--source', type=Path, help='Import an existing official GGUF instead of downloading it.')
    models = sub.add_parser('models', help='Browse, install, and switch local models.')
    actions = models.add_subparsers(dest='model_action', required=True)
    actions.add_parser('list', help='List catalog entries with download sizes and installed state.')
    actions.add_parser('status', help='Show local installation status without starting a model.')
    install = actions.add_parser('install', help='Download and verify a catalog model.')
    install.add_argument('model_id')
    install.add_argument('--source', type=Path)
    use = actions.add_parser('use', help='Select an installed and verified model.')
    use.add_argument('model_id')
    doctor = sub.add_parser('doctor', help='Check model endpoint and model availability.')
    convert = sub.add_parser('rewrite', help='Round-trip a UTF-8 text/Markdown file; - reads stdin.')
    convert.add_argument('input')
    convert.add_argument('-o', '--output', help='New UTF-8 output file; defaults to stdout.')
    convert.add_argument('--language', required=True, help='Original/output language; e.g. zh-CN, en, ja.')
    convert.add_argument('--pivot', help='Intermediate language; defaults to en, or zh-CN for English.')
    convert.add_argument('--chunk-size', type=int, default=750)
    convert.add_argument('--protect-term', action='append', default=[], help='Retain original chunk if this exact term changes.')
    convert.add_argument('--report', help='Metadata-only JSON report; no source/intermediate text.')
    convert.add_argument('--dry-run', action='store_true', help='Show route and chunk counts without a model call or output writes.')
    convert.add_argument('--force', action='store_true', help='Replace an existing output, never the input.')
    convert.add_argument('--strict', action='store_true', help='Exit 3 if any prose chunk was retained due to a guard/failure.')
    for command in (doctor, convert):
        command.add_argument('--provider', choices=['managed', 'ollama', 'openai'])
        command.add_argument('--model')
        command.add_argument('--base-url')
    return parser


def _check_targets(args: argparse.Namespace) -> None:
    targets = [Path(p) for p in (args.output, args.report) if p]
    original = None if args.input == '-' else Path(args.input)
    for target in targets:
        if original and (target.resolve() == original.resolve() or (target.exists() and target.samefile(original))):
            raise ValueError('Output and report must not overwrite the input, even with --force.')
        if target.exists() and not args.force:
            raise ValueError('Output/report already exists; choose a new path or use --force.')
    if len(targets) == 2 and (targets[0].resolve() == targets[1].resolve() or
       (targets[0].exists() and targets[1].exists() and targets[0].samefile(targets[1]))):
        raise ValueError('Output and report must be different files.')


def _write(path: str, text: str, force: bool) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with target.open('w' if force else 'x', encoding='utf-8', newline='') as file:
        file.write(text)


def main(argv: list[str] | None = None) -> int:
    args = _parser().parse_args(argv)
    try:
        if args.command == 'languages':
            print(json.dumps([{'code': v.code, 'name': v.name} for v in LANGUAGES.values()], ensure_ascii=False, indent=2))
            return 0
        if args.command == 'mcp':
            from .mcp_server import main as serve
            serve()
            return 0
        if args.command in ('setup', 'models'):
            from . import managed
            if args.command == 'setup':
                managed.install_runtime()
                installed = managed.install_model(args.model, source=args.source)
                managed.select_model(installed['id'])
                report = managed.status()
            elif args.model_action == 'list':
                report = managed.list_models()
            elif args.model_action == 'status':
                report = managed.status()
            elif args.model_action == 'install':
                report = managed.install_model(args.model_id, source=args.source)
            else:
                report = managed.select_model(args.model_id)
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0
        settings = _settings(args)
        if args.command == 'doctor':
            if settings.provider == 'managed':
                from .managed import status
                report = status()
                print(json.dumps(report, ensure_ascii=False, indent=2))
                return 0 if report.get('ready', report.get('model_installed', False)) else 2
            report = create_backend(settings).doctor()
            print(json.dumps(report, ensure_ascii=False, indent=2))
            return 0 if report['model_found'] else 2
        _check_targets(args)
        original, pivot = resolve_route(args.language, args.pivot)
        if args.input == '-':
            text = sys.stdin.read()
        else:
            with Path(args.input).open('r', encoding='utf-8', newline='') as file:
                text = file.read()
        if args.dry_run:
            segments = segment_markdown(text, args.chunk_size)
            print(json.dumps({'language': original.code, 'pivot': pivot.code, 'input_chars': len(text),
                'segments': len(segments), 'protected_segments': sum(s.protected for s in segments),
                'provider': settings.provider, 'model': settings.model}, ensure_ascii=False, indent=2))
            return 0
        result = rewrite(text, create_backend(settings), language=original.code, pivot=pivot.code,
                         chunk_size=args.chunk_size, protect_terms=tuple(args.protect_term))
        if args.output:
            _write(args.output, result.text, args.force)
        else:
            sys.stdout.write(result.text)
        if args.report:
            _write(args.report, json.dumps(result.report(), ensure_ascii=False, indent=2) + '\n', args.force)
        retained = result.report()['retained_chunks']
        if retained:
            print(f'PlainSpeak: retained {retained} original prose chunk(s); see --report for diagnostics.', file=sys.stderr)
        return 3 if retained and args.strict else 0
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        print(f'PlainSpeak: {error}', file=sys.stderr)
        return 2
