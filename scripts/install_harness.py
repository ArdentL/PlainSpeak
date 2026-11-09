"""Install a self-contained PlainSpeak app and an opt-in Harness plugin patch."""
from __future__ import annotations

import argparse
import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
OWNER = 'plainspeak-harness-installer-v1'
MANIFEST = 'install-harness-manifest.json'
TRANSACTION = '.install-harness-transaction.json'
BUNDLE = '@plainspeak/harness-ui'


def default_home() -> Path:
    if os.environ.get('PLAINSPEAK_HOME'):
        return Path(os.environ['PLAINSPEAK_HOME']).expanduser()
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local')) / 'PlainSpeak'
    if sys.platform == 'darwin':
        return Path.home() / 'Library/Application Support/PlainSpeak'
    return Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share')) / 'plainspeak'


def digest(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def reject_links(path: Path) -> None:
    for item in (path, *path.parents):
        if item.is_symlink() or (hasattr(item, 'is_junction') and item.is_junction()):
            raise ValueError(f'Refusing linked path: {item}')


def _atomic_write(path: Path, content: bytes) -> None:
    """A stopped writer leaves the previous complete file or the next one."""
    reject_links(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.plainspeak-', suffix='.part', dir=path.parent)
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


@contextmanager
def _installation_lock(home: Path):
    """OS locks are released even when an installer process is killed."""
    home.mkdir(parents=True, exist_ok=True)
    path = home / '.install-harness.lock'
    reject_links(path)
    with path.open('a+b') as stream:
        stream.seek(0, os.SEEK_END)
        if stream.tell() == 0:
            stream.write(b'\0')
            stream.flush()
        stream.seek(0)
        try:
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(stream.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as error:
            raise ValueError(f'Another PlainSpeak installation is in progress: {home}') from error
        try:
            yield
        finally:
            if os.name == 'nt':
                stream.seek(0)
                msvcrt.locking(stream.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(stream.fileno(), fcntl.LOCK_UN)


def _transaction_operations(plan: dict, home: Path, profile: Path,
                            client: str = 'web') -> list[tuple[Path, dict, bytes | None]]:
    if isinstance(plan, dict) and (plan.get('profile') != str(profile) or plan.get('client', 'web') != client):
        raise ValueError(f"Pending installation belongs to client={plan.get('client', 'web')}, "
                         f"plugin={plan.get('profile')}; retry with that same --client and --profile-dir")
    if (not isinstance(plan, dict) or plan.get('owner') != OWNER or plan.get('home') != str(home)
            or plan.get('profile') != str(profile) or not isinstance(plan.get('operations'), list)):
        raise ValueError('Unrecognized pending installer transaction')
    operations = []
    seen = set()
    for operation in plan['operations']:
        if (not isinstance(operation, dict)
                or not {'scope', 'name', 'old', 'new', 'content'}.issubset(operation)
                or not isinstance(operation['scope'], str) or not isinstance(operation['name'], str)
                or operation['content'] is not None and not isinstance(operation['content'], str)):
            raise ValueError('Malformed pending installer operation')
        scope, name = operation['scope'], operation['name']
        relative = Path(name)
        if (scope not in ('home', 'profile', 'shared') or not name or relative.is_absolute()
                or '..' in relative.parts or ':' in name or '\\' in name
                or name in (TRANSACTION, '.install-harness.lock')):
            raise ValueError('Unsafe path in installer transaction')
        if scope == 'home' and not (name.startswith(('app/plainspeak/', 'plugins/harness-ui/'))
                or name in ('plainspeak', 'plainspeak.cmd', 'harness.patch.yml', 'harness-launch.json', MANIFEST)):
            raise ValueError('Installer transaction is outside the application files')
        if scope == 'shared':
            if client != 'desktop' or name != 'package.json' or operation['content'] is None:
                raise ValueError('Shared installer scope only permits the selected desktop profile package.json')
            target = profile.parents[2] / 'package.json'
        else:
            target = (home if scope == 'home' else profile) / relative
        if target in seen:
            raise ValueError('Duplicate path in installer transaction')
        seen.add(target)
        content = operation['content']
        content = base64.b64decode(content, validate=True) if content is not None else None
        if operation['new'] != (digest(content) if content is not None else None):
            raise ValueError('Damaged pending installer payload')
        reject_links(target)
        if scope == 'shared' and not target.is_file():
            raise ValueError(f'Refusing missing or unsafe shared profile manifest: {target}')
        if target.exists() and (not target.is_file()
                or digest(target.read_bytes()) not in (operation['old'], operation['new'])):
            raise ValueError(f'Refusing existing unowned or locally modified file: {target}')
        operations.append((target, operation, content))
    return operations


def _apply_transaction(plan: dict, home: Path, profile: Path, client: str = 'web') -> None:
    # Check the entire interrupted plan before writing anything. Only the exact
    # previously owned bytes or staged replacement bytes are accepted on retry.
    for target, operation, content in _transaction_operations(plan, home, profile, client):
        reject_links(target)
        if content is None:
            target.unlink(missing_ok=True)
        elif not target.is_file() or digest(target.read_bytes()) != operation['new']:
            _atomic_write(target, content)
    launcher = home / 'plainspeak'
    launcher.chmod(launcher.stat().st_mode | 0o111)
    (home / TRANSACTION).unlink()


def _recover_transaction(home: Path, profile: Path, dry_run: bool, client: str = 'web') -> None:
    journal = home / TRANSACTION
    reject_links(journal)
    if not journal.exists():
        return
    if dry_run:
        _transaction_operations(json.loads(journal.read_text(encoding='utf-8')), home, profile, client)
        raise ValueError('An interrupted installation is pending; rerun without --dry-run to recover it')
    with _installation_lock(home):
        if journal.exists():
            _apply_transaction(json.loads(journal.read_text(encoding='utf-8')), home, profile, client)


def _commit_transaction(home: Path, profile: Path, files: dict[str, bytes],
                        plugin_files: dict[str, bytes], owned: dict[str, str], client: str = 'web',
                        shared_manifest: tuple[bytes, bytes] | None = None) -> None:
    operations = []
    payloads = [('home', name, content) for name, content in files.items()]
    payloads += [('profile', name, content) for name, content in plugin_files.items()]
    if shared_manifest is not None:
        payloads.append(('shared', 'package.json', shared_manifest[1]))
    payloads += [('home', name, None) for name in sorted(set(owned) - set(files))]
    manifest = {'owner': OWNER, 'files': {name: digest(content) for name, content in files.items()}}
    payloads.append(('home', MANIFEST, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')))
    profile_receipt = profile / '.plainspeak-install-manifest.json'
    profile_owned = (json.loads(profile_receipt.read_text(encoding='utf-8'))['files']
                     if profile_receipt.is_file() else {})
    for scope, name, content in payloads:
        if scope == 'shared':
            target = profile.parents[2] / 'package.json'
            old = digest(shared_manifest[0])
        else:
            target = (home if scope == 'home' else profile) / name
            old = (owned if scope == 'home' else profile_owned).get(name)
        if (scope, name) in (('home', MANIFEST), ('profile', '.plainspeak-install-manifest.json')):
            old = digest(target.read_bytes()) if target.is_file() else None
        operations.append({'scope': scope, 'name': name,
                           'old': old,
                           'new': digest(content) if content is not None else None,
                           'content': base64.b64encode(content).decode('ascii') if content is not None else None})
    plan = {'owner': OWNER, 'home': str(home), 'profile': str(profile), 'client': client, 'operations': operations}
    with _installation_lock(home):
        journal = home / TRANSACTION
        if journal.exists():
            raise ValueError('An interrupted installation is pending; retry to recover it')
        _transaction_operations(plan, home, profile, client)
        # Publish the complete recoverable plan before touching any live file.
        _atomic_write(journal, (json.dumps(plan, ensure_ascii=False) + '\n').encode('utf-8'))
        _apply_transaction(plan, home, profile, client)


def source_files(root: Path) -> dict[str, bytes]:
    files: dict[str, bytes] = {}
    selections = [(root / 'src/plainspeak', 'app/plainspeak'),
                  (root / 'adapters/harness-ui/src', 'plugins/harness-ui/src'),
                  (root / 'adapters/harness-ui/lib', 'plugins/harness-ui/lib')]
    for source, destination in selections:
        if not source.is_dir():
            raise ValueError(f'Missing release source: {source}')
        reject_links(source)
        for path in sorted(source.rglob('*')):
            if '__pycache__' in path.parts or path.suffix in ('.pyc', '.pyo'):
                continue
            reject_links(path)
            if path.is_file():
                files[f'{destination}/{path.relative_to(source).as_posix()}'] = path.read_bytes()
    for name in ('package.json', 'README.md'):
        path = root / 'adapters/harness-ui' / name
        if path.is_file():
            reject_links(path)
            files[f'plugins/harness-ui/{name}'] = path.read_bytes()
    for required in ('app/plainspeak/__main__.py', 'plugins/harness-ui/package.json',
                     'plugins/harness-ui/src/index.js', 'plugins/harness-ui/lib/client.js'):
        if required not in files:
            raise ValueError(f'Missing built release file: {required}')
    return files


def generated_files(home: Path, interpreter: Path, client: str = 'web') -> dict[str, bytes]:
    app = home / 'app'
    config = {'pythonCommand': str(interpreter), 'pythonArgs': [], 'projectRoot': str(app),
              'pythonCwd': str(app), 'dataHome': str(home), 'clearWriting': True,
              'translationEnabled': True, 'language': 'zh-CN'}
    # JSON scalars are valid YAML: no additional parser or template dependency.
    patch = ['# PlainSpeak only: use as an additional --patch overlay.', '- insert:',
             '    - id: plainspeak-ui', '      name: "@plainspeak/harness-ui"',
             '      config:']
    patch += [f'        {key}: {json.dumps(value, ensure_ascii=False)}' for key, value in config.items()]
    command = ['dsh', '--profile', 'web', '--patch', str(home / 'harness.patch.yml')]
    launch = {'command': command if client == 'web' else None,
              'note': ('Opt-in overlay; installer does not launch Harness.' if client == 'web'
                       else 'Close and restart DeepSeek Harness Desktop to load the installed bundle.')}
    # Shell wrapper never changes the caller's working directory or environment.
    shell = ('#!/bin/sh\n' + 'cd ' + shlex.quote(str(app)) + ' || exit 1\n' +
             'export PLAINSPEAK_HOME=' + shlex.quote(str(home)) + '\n' +
             'exec ' + shlex.quote(str(interpreter)) + ' -m plainspeak "$@"\n')
    def batch_path(path: Path) -> str:
        value = str(path)
        if any(char in value for char in ('\r', '\n', '"')):
            raise ValueError('Unsupported quote or newline in Windows install path')
        return value.replace('%', '%%')
    batch = ('@echo off\r\nsetlocal\r\nset "PLAINSPEAK_HOME=' + batch_path(home) + '"\r\n'
             'cd /d "' + batch_path(app) + '" || exit /b 1\r\n"' + batch_path(interpreter) +
             '" -m plainspeak %*\r\nexit /b %errorlevel%\r\n')
    patch_content = ('\n'.join(patch) + '\n').encode('utf-8')
    return {'harness.patch.yml': patch_content,
            'plugins/harness-ui/cordis.patch.yml': patch_content,
            'harness-launch.json': (json.dumps(launch, ensure_ascii=False, indent=2) + '\n').encode('utf-8'),
            'plainspeak': shell.encode('utf-8'), 'plainspeak.cmd': batch.encode('utf-8')}


def desktop_manifest_plan(profile_dir: Path) -> tuple[bytes, bytes]:
    """Merge only our bundle activation into an already initialized app profile."""
    path = profile_dir / 'package.json'
    reject_links(path)
    if not path.is_file():
        raise ValueError(f'Desktop profile is not initialized: {profile_dir}; start DeepSeek Harness once, then retry')
    before = path.read_bytes()
    manifest = json.loads(before.decode('utf-8'))
    if (not isinstance(manifest, dict) or not isinstance(manifest.get('dsh'), dict)
            or not isinstance(manifest['dsh'].get('profile'), dict)
            or not isinstance(manifest['dsh']['profile'].get('bundles'), list)
            or not all(isinstance(name, str) for name in manifest['dsh']['profile']['bundles'])):
        raise ValueError(f'Unrecognized initialized Desktop profile manifest: {path}')
    bundles = manifest['dsh']['profile']['bundles']
    merged = []
    for name in bundles:
        if name != BUNDLE or name not in merged:
            merged.append(name)
    if BUNDLE not in merged:
        merged.append(BUNDLE)
    if merged == bundles:
        return before, before
    manifest['dsh']['profile']['bundles'] = merged
    return before, (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')


def profile_package_plan(files: dict[str, bytes], home: Path, profile_dir: Path) -> tuple[Path, dict[str, bytes]]:
    """Plan only our namespaced package; never alter a profile's own files."""
    profile_dir = profile_dir.expanduser().absolute()
    reject_links(profile_dir)
    target = profile_dir / 'node_modules/@plainspeak/harness-ui'
    reject_links(target)
    payload = {name.removeprefix('plugins/harness-ui/'): content for name, content in files.items()
               if name.startswith('plugins/harness-ui/')}
    receipt_name = '.plainspeak-install-manifest.json'
    receipt = target / receipt_name
    reject_links(receipt)
    owned = {}
    if target.exists():
        if not receipt.is_file():
            raise ValueError(f'Refusing unowned profile plugin: {target}')
        previous = json.loads(receipt.read_text(encoding='utf-8'))
        if previous.get('owner') != OWNER or previous.get('home') != str(home) or not isinstance(previous.get('files'), dict):
            raise ValueError(f'Unrecognized profile plugin manifest: {receipt}')
        owned = previous['files']
    for name in set(payload) | set(owned):
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or ':' in name or '\\' in name:
            raise ValueError('Unsafe path in profile plugin manifest')
        path = target / name
        reject_links(path)
        if path.exists() and (not path.is_file() or name not in owned or digest(path.read_bytes()) != owned[name]):
            raise ValueError(f'Refusing existing unowned or modified profile plugin file: {path}')
    # Keep old owned files rather than deleting: the profile may still have a
    # running process using them. Unknown files are never touched.
    manifest = {'owner': OWNER, 'home': str(home),
                'files': {**owned, **{name: digest(value) for name, value in payload.items()}}}
    payload[receipt_name] = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    return target, payload


def prepare(root: Path, home: Path, model: str, source: Path | None,
            prepare_only: bool, dry_run: bool, profile_dir: Path | None = None, client: str = 'web') -> dict:
    if sys.version_info < (3, 10):
        raise ValueError('Python 3.10 or newer is required')
    if client not in ('web', 'desktop'):
        raise ValueError('Unsupported Harness client; choose web or desktop')
    root = root.expanduser().resolve()
    # Check before resolve() so a caller cannot hide a symlink behind normalization.
    home = home.expanduser().absolute()
    reject_links(home)
    home = home.resolve()
    if source is not None:
        source = source.expanduser().resolve()
        if not source.is_file():
            raise ValueError('--source must name an existing GGUF file')
    data = json.loads((root / 'src/plainspeak/data/models.json').read_text(encoding='utf-8'))
    if model not in [item['id'] for item in data['models']]:
        raise ValueError(f'Unknown model ID: {model}')
    files = source_files(root)
    files.update(generated_files(home, Path(sys.executable).resolve(), client))
    metadata = json.loads(files['plugins/harness-ui/package.json'].decode('utf-8'))
    metadata.setdefault('dsh', {})['bundle'] = {'patch': 'cordis.patch.yml'}
    files['plugins/harness-ui/package.json'] = (json.dumps(metadata, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if profile_dir is None:
        profile_dir = Path(os.environ.get('DSH_HOME', Path.home() / '.dsh')) / 'profiles' / client
    profile_dir = profile_dir.expanduser().absolute()
    reject_links(profile_dir)
    _recover_transaction(home, profile_dir / 'node_modules/@plainspeak/harness-ui', dry_run, client)
    shared_manifest = desktop_manifest_plan(profile_dir) if client == 'desktop' else None
    plugin_target, plugin_files = profile_package_plan(files, home, profile_dir)
    receipt = home / MANIFEST
    reject_links(receipt)
    owned: dict[str, str] = {}
    if receipt.exists():
        previous = json.loads(receipt.read_text(encoding='utf-8'))
        if previous.get('owner') != OWNER or not isinstance(previous.get('files'), dict):
            raise ValueError(f'Unrecognized installer manifest: {receipt}')
        owned = previous['files']
    else:
        for name in ('app/plainspeak', 'plugins/harness-ui'):
            if (home / name).exists():
                raise ValueError(f'Refusing unowned application directory: {home / name}')
    for name in set(files) | set(owned):
        relative = Path(name)
        if relative.is_absolute() or '..' in relative.parts or ':' in name or '\\' in name:
            raise ValueError('Unsafe path in installer manifest')
        target = home / relative
        reject_links(target)
        if target.exists():
            if not target.is_file() or name not in owned or digest(target.read_bytes()) != owned[name]:
                raise ValueError(f'Refusing existing unowned or locally modified file: {target}')
    command = [sys.executable, '-m', 'plainspeak', 'setup', '--model', model]
    if source is not None:
        command += ['--source', str(source)]
    report = {'home': str(home), 'model': model, 'prepare_only': prepare_only, 'dry_run': dry_run, 'client': client,
              'setup_command': command, 'patch': str(home / 'harness.patch.yml'),
              'profile_dir': str(profile_dir.expanduser().absolute()), 'profile_plugin': str(plugin_target),
              'launch_command': (['dsh', '--profile', 'web', '--patch', str(home / 'harness.patch.yml')]
                                 if client == 'web' else None),
              'restart_required': client == 'desktop',
              'activation': ('Close and restart DeepSeek Harness Desktop to load the profile bundle.'
                             if client == 'desktop' else 'Launch Harness with the additional --patch overlay.')}
    if dry_run:
        return report
    _commit_transaction(home, plugin_target, files, plugin_files, owned, client, shared_manifest)
    if not prepare_only:
        env = dict(os.environ, PLAINSPEAK_HOME=str(home), PYTHONUTF8='1')
        subprocess.run(command, cwd=home / 'app', env=env, check=True)
    return report


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--home', type=Path, default=default_home())
    parser.add_argument('--project-root', type=Path, default=ROOT, help=argparse.SUPPRESS)
    parser.add_argument('--model', default='hy-mt2-1.8b-q4')
    parser.add_argument('--source', type=Path, help='Existing official GGUF; setup verifies size and SHA-256')
    parser.add_argument('--client', choices=('web', 'desktop'), default='web', help='Harness surface; desktop requires an initialized app profile')
    parser.add_argument('--profile-dir', type=Path,
                        help='Harness profile directory; defaults to $DSH_HOME/profiles/<client> or ~/.dsh/profiles/<client>')
    parser.add_argument('--prepare-only', action='store_true', help='Prepare app/patch without downloads')
    parser.add_argument('--dry-run', action='store_true', help='Validate and print plan; no writes, downloads or launch')
    args = parser.parse_args(argv)
    try:
        report = prepare(args.project_root, args.home, args.model, args.source, args.prepare_only, args.dry_run, args.profile_dir, args.client)
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        print(f'install_harness: {error}', file=sys.stderr)
        return 2
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
