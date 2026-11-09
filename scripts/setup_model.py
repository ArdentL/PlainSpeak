"""Import a user-selected local GGUF into Ollama; never download weights."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('gguf', type=Path)
    parser.add_argument('--name', default='plainspeak-hy')
    parser.add_argument('--ollama', default='ollama', help='Ollama executable name or path.')
    parser.add_argument('--host', help='Optional Ollama host; defaults to its existing OLLAMA_HOST setting.')
    parser.add_argument('--sha256', help='Optional expected weight SHA-256; mismatch stops import.')
    args = parser.parse_args()
    if not args.gguf.is_file() or args.gguf.suffix.lower() != '.gguf':
        parser.error('Provide an existing local .gguf file.')
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_.:/-]*', args.name):
        parser.error('Use an Ollama model name without shell/whitespace characters.')
    if args.sha256:
        if not re.fullmatch(r'[a-fA-F0-9]{64}', args.sha256):
            parser.error('--sha256 must contain exactly 64 hex characters.')
        digest = hashlib.sha256()
        with args.gguf.open('rb') as file:
            for block in iter(lambda: file.read(1024 * 1024), b''):
                digest.update(block)
        if digest.hexdigest() != args.sha256.lower():
            parser.error('Weight hash mismatch; nothing was imported.')
    env = dict(os.environ)
    if args.host:
        env['OLLAMA_HOST'] = args.host
    # This is a Modelfile value, never a shell command. JSON quotes support spaces.
    path = args.gguf.resolve().as_posix()
    if '\n' in path or '\r' in path:
        parser.error('Newlines are not supported in a model path.')
    with tempfile.TemporaryDirectory(prefix='plainspeak-model-') as directory:
        modelfile = Path(directory) / 'Modelfile'
        modelfile.write_text('FROM ' + json.dumps(path, ensure_ascii=False) + '\n', encoding='utf-8')
        result = subprocess.run([args.ollama, 'create', args.name, '-f', str(modelfile)], env=env, check=False)
    return result.returncode


if __name__ == '__main__':
    raise SystemExit(main())
