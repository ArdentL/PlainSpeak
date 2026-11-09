"""Verified HTTPS downloads and conservative archive extraction (stdlib only)."""

import hashlib
import os
from pathlib import Path, PurePosixPath
import posixpath
import shutil
import stat
import sys
import tarfile
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile


def validate_file(path: Path, sha256: str, size_bytes: int | None = None) -> None:
    if not path.is_file() or path.is_symlink():
        raise RuntimeError(f'Missing or unsafe file: {path}')
    if size_bytes is not None and path.stat().st_size != size_bytes:
        raise RuntimeError(f'File size integrity check failed: {path}')
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            digest.update(chunk)
    if digest.hexdigest() != sha256:
        raise RuntimeError(f'SHA-256 integrity check failed: {path}')


def _publish(part: Path, destination: Path) -> None:
    # Link publishes atomically without replacing an installation from another process.
    try:
        if os.name == 'nt':
            # Windows rename is atomic and refuses an existing destination.
            os.rename(part, destination)
        else:
            os.link(part, destination)
    except FileExistsError:
        raise RuntimeError(f'Destination already exists; refusing to replace: {destination}') from None
    part.unlink(missing_ok=True)


def copy_verified(source: Path, destination: Path, sha256: str, size_bytes: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    part = destination.with_name(destination.name + '.part')
    try:
        with part.open('xb') as output, source.open('rb') as stream:
            shutil.copyfileobj(stream, output, 4 * 1024 * 1024)
            output.flush()
            os.fsync(output.fileno())
        validate_file(part, sha256, size_bytes)
        _publish(part, destination)
    except FileExistsError:
        raise RuntimeError(f'An installation is in progress or a partial file remains: {part}') from None
    finally:
        # Do not delete another installer's part if exclusive creation failed.
        if 'output' in locals() and part.exists():
            part.unlink()


def download_verified(url: str, destination: Path, sha256: str,
                      size_bytes: int | None = None, retries: int = 3) -> None:
    """Download without changing TLS/proxy settings; no partial file is published."""
    if urllib.parse.urlsplit(url).scheme != 'https':
        raise RuntimeError('Downloads require HTTPS.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    if destination.exists():
        validate_file(destination, sha256, size_bytes)
        return
    part = destination.with_name(destination.name + '.part')
    for attempt in range(retries):
        created = False
        try:
            with part.open('xb') as output:
                created = True
                request = urllib.request.Request(url, headers={'User-Agent': 'PlainSpeak/0.1'})
                with urllib.request.urlopen(request, timeout=30) as response:
                    if urllib.parse.urlsplit(response.geturl()).scheme != 'https':
                        raise RuntimeError('Download redirected away from HTTPS.')
                    print(f'Downloading {destination.name}...', file=sys.stderr, flush=True)
                    downloaded, next_report = 0, 64 * 1024 * 1024
                    for chunk in iter(lambda: response.read(1024 * 1024), b''):
                        downloaded += len(chunk)
                        if size_bytes is not None and downloaded > size_bytes:
                            raise RuntimeError('Download exceeds expected file size.')
                        output.write(chunk)
                        if downloaded >= next_report:
                            print(f'  {downloaded // (1024 * 1024)} MiB', file=sys.stderr, flush=True)
                            next_report += 64 * 1024 * 1024
                output.flush()
                os.fsync(output.fileno())
            validate_file(part, sha256, size_bytes)
            _publish(part, destination)
            return
        except FileExistsError:
            raise RuntimeError(f'An installation is in progress or a partial file remains: {part}') from None
        except (urllib.error.URLError, TimeoutError, OSError) as error:
            if attempt + 1 == retries:
                raise RuntimeError(f'Download failed after {retries} attempts: {error}') from None
            time.sleep(min(2 ** attempt, 4))
        finally:
            if created and part.exists():
                part.unlink()


def _member_path(name: str, destination: Path) -> Path:
    pure = PurePosixPath(name.replace('\\', '/'))
    if pure.is_absolute() or not pure.parts or any(
            p in ('.', '..') or ':' in p or p.endswith((' ', '.')) for p in pure.parts):
        raise RuntimeError(f'Unsafe archive path: {name}')
    reserved = {'CON', 'PRN', 'AUX', 'NUL'} | {f'{p}{n}' for p in ('COM', 'LPT') for n in range(1, 10)}
    if any(p.split('.')[0].upper() in reserved for p in pure.parts):
        raise RuntimeError(f'Unsafe archive path: {name}')
    path = destination.joinpath(*pure.parts)
    if not path.resolve().is_relative_to(destination.resolve()):
        raise RuntimeError(f'Unsafe archive path: {name}')
    return path


def safe_extract(archive: Path, destination: Path) -> None:
    """Validate before writing; materialize safe tar library links as regular files."""
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError('Archive destination must be empty.')
    if zipfile.is_zipfile(archive):
        with zipfile.ZipFile(archive) as bundle:
            members = bundle.infolist()
            if len(members) > 20000 or sum(m.file_size for m in members) > 1024 ** 3:
                raise RuntimeError('Runtime archive is unexpectedly large.')
            for member in members:
                _member_path(member.filename, destination)
                mode = member.external_attr >> 16
                if stat.S_ISLNK(mode) or (stat.S_IFMT(mode) not in (0, stat.S_IFREG, stat.S_IFDIR)):
                    raise RuntimeError('Archive links and special files are forbidden.')
            for member in members:
                path = _member_path(member.filename, destination)
                if member.is_dir():
                    path.mkdir(parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    with bundle.open(member) as source, path.open('xb') as output:
                        shutil.copyfileobj(source, output)
    else:
        with tarfile.open(archive, 'r:*') as bundle:
            members = bundle.getmembers()
            if len(members) > 20000 or sum(m.size for m in members) > 1024 ** 3:
                raise RuntimeError('Runtime archive is unexpectedly large.')
            lookup = {posixpath.normpath(m.name): m for m in members}
            resolved = {}
            for member in members:
                _member_path(member.name, destination)
                target = member
                seen = set()
                while target.issym() or target.islnk():
                    if target.name in seen:
                        raise RuntimeError('Archive link cycle is forbidden.')
                    seen.add(target.name)
                    parent = posixpath.dirname(target.name) if target.issym() else ''
                    name = posixpath.normpath(posixpath.join(parent, target.linkname.replace('\\', '/')))
                    _member_path(name, destination)
                    if name not in lookup:
                        raise RuntimeError('Archive link target is missing.')
                    target = lookup[name]
                if not (target.isfile() or (target.isdir() and target is member)):
                    raise RuntimeError('Archive special files and directory links are forbidden.')
                resolved[member.name] = target
            if sum(resolved[m.name].size for m in members) > 1024 ** 3:
                raise RuntimeError('Expanded runtime archive is unexpectedly large.')
            for member in members:
                path = _member_path(member.name, destination)
                if member.isdir():
                    path.mkdir(parents=True, exist_ok=True)
                else:
                    path.parent.mkdir(parents=True, exist_ok=True)
                    target = resolved[member.name]
                    with bundle.extractfile(target) as source, path.open('xb') as output:
                        shutil.copyfileobj(source, output)
                    path.chmod(0o755 if target.mode & 0o111 else 0o644)
