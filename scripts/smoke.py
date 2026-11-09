"""Explicit live-model smoke using only the synthetic examples below."""

import argparse
import json
import platform
from pathlib import Path

from plainspeak.backend import Backend, Settings
from plainspeak.core import rewrite

CASES = [
    ('zh-CN', '研究讨论', '这个想法用共享失败记录减少重复尝试。先固定任务和模型预算，再比较是否共享记录。'),
    ('en', 'project question', 'The first version supports local translation. Keep the original next to the result when explaining code.'),
    ('ja', 'daily conversation', '今日は疲れています。長い説明ではなく、明日やることを一つだけ決めたいです。'),
    ('fr', 'paper explanation', 'La méthode partage les erreurs entre les agents pour éviter les tentatives répétées.'),
    ('es', 'project writing', 'El complemento mejora la redacción inicial y ofrece una traducción de ida y vuelta opcional.'),
    ('zh-Hant', 'traditional script', '這個工具保留原文，讓讀者比較改寫前後的表達。請保留必要的技術說明。'),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New JSON file, never overwritten.')
    args = parser.parse_args()
    if args.output.exists():
        parser.error('Output already exists; choose a new report path.')
    settings = Settings.from_env()
    backend = Backend(settings)
    doctor = backend.doctor()
    if not doctor['model_found']:
        parser.error('Configured model is not available.')
    results = []
    for language, scenario, source in CASES:
        result = rewrite(source, backend, language=language)
        results.append({'language': language, 'scenario': scenario, 'source': source,
                        'output': result.text, 'report': result.report()})
        print(f'{language}: {result.seconds:.2f}s; retained={result.report()["retained_chunks"]}', flush=True)
    payload = {'model': settings.model, 'provider': settings.provider,
               'python': platform.python_version(), 'synthetic_only': True,
               'interpretation': 'Execution smoke only, not a multilingual quality benchmark.',
               'results': results}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open('x', encoding='utf-8') as file:
        json.dump(payload, file, ensure_ascii=False, indent=2)
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
