"""Opt-in model installation and a private, lazily started llama.cpp server."""

import atexit
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

from .backend import Backend, Settings
from .downloads import copy_verified, download_verified, safe_extract, validate_file

_lock = threading.RLock()
_process: subprocess.Popen | None = None
_backend: Backend | None = None
_identity: tuple[str, str] | None = None


def data_home() -> Path:
    override = os.environ.get('PLAINSPEAK_HOME')
    if override:
        return Path(override).expanduser().resolve()
    if sys.platform == 'win32':
        base = Path(os.environ.get('LOCALAPPDATA', Path.home() / 'AppData/Local'))
    elif sys.platform == 'darwin':
        base = Path.home() / 'Library/Application Support'
    else:
        base = Path(os.environ.get('XDG_DATA_HOME', Path.home() / '.local/share'))
    return base / ('plainspeak' if sys.platform.startswith('linux') else 'PlainSpeak')


def _data(name: str) -> dict:
    return json.loads((Path(__file__).parent / 'data' / name).read_text(encoding='utf-8'))


def catalog() -> dict:
    return _data('models.json')


def _model(model_id: str | None = None) -> dict:
    data = catalog()
    wanted = model_id or data['default']
    for model in data['models']:
        if model['id'] == wanted:
            # Catalog paths must remain single path components even in edited catalogs.
            if any(Path(model[k]).name != model[k] or '/' in model[k] or '\\' in model[k]
                   or model[k] in ('.', '..') for k in ('id', 'filename')):
                raise RuntimeError('Unsafe model catalog path.')
            return dict(model)
    raise RuntimeError(f'Unknown model: {wanted}. Run plainspeak models list.')


def _model_path(model: dict) -> Path:
    return data_home() / 'models' / model['id'] / model['filename']


def _active() -> str:
    path = data_home() / 'config.json'
    if not path.exists():
        return catalog()['default']
    try:
        value = json.loads(path.read_text(encoding='utf-8'))['model']
        return _model(value)['id']
    except (OSError, ValueError, KeyError, TypeError) as error:
        raise RuntimeError(f'Invalid PlainSpeak config: {path}') from error


def _installed(model: dict) -> bool:
    path = _model_path(model)
    return path.is_file() and not path.is_symlink() and path.stat().st_size == model['size_bytes']


def list_models() -> list[dict]:
    active = _active()
    return [dict(model, installed=_installed(model), active=model['id'] == active,
                 path=str(_model_path(model)), integrity='unchecked')
            for model in catalog()['models']]


def install_model(model_id: str | None = None, source: Path | None = None) -> dict:
    with _lock:
        model = _model(model_id)
        path = _model_path(model)
        if path.exists():
            # Never silently overwrite corrupt weights; preserve them for diagnosis.
            validate_file(path, model['sha256'], model['size_bytes'])
        elif source is not None:
            copy_verified(Path(source), path, model['sha256'], model['size_bytes'])
        else:
            download_verified(model['url'], path, model['sha256'], model['size_bytes'])
        return dict(model, installed=True, path=str(path), integrity='verified',
                    active=_active() == model['id'])


def _atomic_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=path.name + '.', suffix='.part', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def select_model(model_id: str) -> dict:
    with _lock:
        model = _model(model_id)
        path = _model_path(model)
        validate_file(path, model['sha256'], model['size_bytes'])
        _atomic_json(data_home() / 'config.json', {'model': model_id})
        if _identity is not None and _identity != (str(data_home()), model_id):
            shutdown()
        return dict(model, installed=True, active=True, path=str(path), integrity='verified')


def _runtime_spec() -> dict:
    machine = ((os.uname().machine if hasattr(os, 'uname') else '') or os.environ.get('PROCESSOR_ARCHITEW6432')
               or os.environ.get('PROCESSOR_ARCHITECTURE')
               or ('x86_64' if struct.calcsize('P') == 8 else 'x86')).lower()
    architecture = {'amd64': 'x64', 'x86_64': 'x64', 'aarch64': 'arm64', 'arm64': 'arm64'}.get(machine)
    system = {'win32': 'windows', 'darwin': 'macos'}.get(sys.platform, 'linux' if sys.platform.startswith('linux') else '')
    key = f'{system}-{architecture}'
    data = _data('runtimes.json')
    if key not in data['runtimes']:
        raise RuntimeError(f'No managed runtime for {sys.platform}/{machine}; configure an external provider.')
    return dict(data['runtimes'][key], release=data['release'], platform=key)


def _runtime_dir(spec: dict) -> Path:
    return data_home() / 'runtimes' / spec['release'] / spec['platform']


def _runtime_binary(spec: dict) -> Path | None:
    directory = _runtime_dir(spec)
    receipt = directory / 'installation.json'
    if not receipt.is_file():
        return None
    try:
        metadata = json.loads(receipt.read_text(encoding='utf-8'))
        if metadata['archive_sha256'] != spec['sha256']:
            return None
        binary = directory / metadata['binary']
        if not binary.resolve().is_relative_to(directory.resolve()) or binary.is_symlink():
            return None
        return binary if binary.is_file() else None
    except (OSError, ValueError, KeyError, TypeError):
        return None


def install_runtime() -> Path:
    with _lock:
        spec = _runtime_spec()
        existing = _runtime_binary(spec)
        if existing is not None:
            return existing
        final = _runtime_dir(spec)
        if final.exists():
            raise RuntimeError(f'Incomplete runtime already exists; inspect or remove it before retrying: {final}')
        cache = data_home() / 'downloads' / spec['filename']
        download_verified(spec['url'], cache, spec['sha256'], spec.get('size_bytes'))
        final.parent.mkdir(parents=True, exist_ok=True)
        stage = Path(tempfile.mkdtemp(prefix=spec['platform'] + '.', dir=final.parent))
        try:
            safe_extract(cache, stage)
            name = 'llama-server.exe' if spec['platform'].startswith('windows') else 'llama-server'
            binaries = list(stage.rglob(name))
            if len(binaries) != 1:
                raise RuntimeError('Runtime archive does not contain exactly one llama-server.')
            binary = binaries[0]
            if os.name != 'nt':
                binary.chmod(binary.stat().st_mode | 0o111)
            (stage / 'LICENSE.llama.cpp.txt').write_text(_data('runtimes.json')['license_text'], encoding='utf-8')
            _atomic_json(stage / 'installation.json', {'archive_sha256': spec['sha256'],
                         'binary': binary.relative_to(stage).as_posix()})
            stage.rename(final)
            return final / binary.relative_to(stage)
        finally:
            if stage.exists():
                shutil.rmtree(stage)


def status() -> dict:
    """Read local state only: no network, hashing gigabytes, or process creation."""
    model = _model(_active())
    try:
        runtime = _runtime_binary(_runtime_spec())
        runtime_error = None
    except RuntimeError as error:
        runtime, runtime_error = None, str(error)
    running = _process is not None and _process.poll() is None
    return {'home': str(data_home()), 'model': model['id'], 'model_installed': _installed(model),
            'model_path': str(_model_path(model)), 'integrity': 'unchecked',
            'runtime_installed': runtime is not None, 'runtime_path': str(runtime) if runtime else None,
            'runtime_error': runtime_error, 'running': running,
            'ready': _installed(model) and runtime is not None,
            'log_path': str(data_home() / 'runtime.log')}


def _server_environment() -> dict[str, str]:
    # Preserve platform loader/Python essentials; remove llama.cpp configuration and
    # dynamic-loader injection. HTTPS download proxy/TLS configuration is unaffected.
    allowed = {'PATH', 'SYSTEMROOT', 'WINDIR', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE',
               'LOCALAPPDATA', 'APPDATA', 'LANG', 'LC_ALL', 'PYTHONPATH', 'VIRTUAL_ENV',
               'CONDA_PREFIX', 'PATHEXT', 'COMSPEC', 'NUMBER_OF_PROCESSORS'}
    return {key: value for key, value in os.environ.items() if key.upper() in allowed}


def _start_process(command: list[str], log) -> subprocess.Popen:
    # The supervisor owns the native server; loss of this stdin pipe (even abrupt
    # parent death) shuts the server down. No unrelated process is inspected/killed.
    return subprocess.Popen([sys.executable, '-m', 'plainspeak.managed', '--supervise', *command],
                            stdin=subprocess.PIPE, stdout=log, stderr=log,
                            env=_server_environment(), close_fds=True,
                            creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))


def get_managed_backend() -> Backend:
    global _process, _backend, _identity
    with _lock:
        model = _model(_active())
        identity = (str(data_home()), model['id'])
        if _backend is not None and _identity == identity and _process is not None and _process.poll() is None:
            return _backend
        shutdown()
        path = _model_path(model)
        runtime = _runtime_binary(_runtime_spec())
        if not _installed(model) or runtime is None:
            raise RuntimeError('Managed model/runtime is missing. Run plainspeak setup first.')
        validate_file(path, model['sha256'], model['size_bytes'])
        with socket.socket() as reservation:
            reservation.bind(('127.0.0.1', 0))
            port = reservation.getsockname()[1]
        token = secrets.token_urlsafe(32)
        command = [str(runtime), '-m', str(path), '--host', '127.0.0.1', '--port', str(port),
                   '-c', '8192', '-np', '1', '-ngl', '0', '--alias', model['id'], '--api-key', token]
        try:
            with (data_home() / 'runtime.log').open('ab', buffering=0) as log:
                _process = _start_process(command, log)
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            request = urllib.request.Request(f'http://127.0.0.1:{port}/health',
                                             headers={'Authorization': f'Bearer {token}'})
            deadline = time.monotonic() + 90
            while time.monotonic() < deadline:
                if _process.poll() is not None:
                    raise RuntimeError('Managed runtime exited during startup; inspect runtime.log.')
                try:
                    with opener.open(request, timeout=1) as response:
                        if response.status == 200:
                            _backend = Backend(Settings('openai', model['id'],
                                f'http://127.0.0.1:{port}/v1', token, 180))
                            _identity = identity
                            return _backend
                except (urllib.error.URLError, OSError, TimeoutError):
                    pass
                time.sleep(0.2)
            raise RuntimeError('Managed runtime startup exceeded 90 seconds; inspect runtime.log.')
        except BaseException:
            shutdown()
            raise


def shutdown() -> None:
    global _process, _backend, _identity
    with _lock:
        process, _process = _process, None
        _backend, _identity = None, None
        if process is None:
            return
        if process.stdin is not None:
            try:
                process.stdin.close()
            except OSError:
                pass
        try:
            process.wait(timeout=8)
        except subprocess.TimeoutExpired:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)


def _supervise(command: list[str]) -> int:
    """Separate interpreter so stdin EOF remains observable after parent death."""
    child = subprocess.Popen(command, stdin=subprocess.DEVNULL, close_fds=True,
                             creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
    def stop_on_eof() -> None:
        try:
            while sys.stdin.buffer.read(1):
                pass
        finally:
            if child.poll() is None:
                child.terminate()
                try:
                    child.wait(timeout=4)
                except subprocess.TimeoutExpired:
                    child.kill()
    watcher = threading.Thread(target=stop_on_eof, daemon=True)
    watcher.start()
    try:
        return child.wait()
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()


atexit.register(shutdown)

if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[1] == '--supervise':
    raise SystemExit(_supervise(sys.argv[2:]))
