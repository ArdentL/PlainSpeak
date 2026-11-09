"""Durable local UI settings and bounded translation records; no model calls."""

from contextlib import contextmanager
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import threading

from ..languages import language as resolve_language

SCHEMA = 4
LIMIT = 1000
DEFAULTS = {'enabled': True, 'language': 'zh-CN', 'clearWriting': True, 'saveHistory': True,
            'hideOriginal': False}


class StorageError(RuntimeError):
    """Local storage is unavailable; safe to expose without paragraph contents."""


def validate_settings(partial: dict) -> dict:
    if not isinstance(partial, dict) or set(partial) - set(DEFAULTS):
        raise ValueError('Settings accept only enabled, language, clearWriting, saveHistory, hideOriginal.')
    result = dict(partial)
    for key, value in result.items():
        if key == 'language':
            if not isinstance(value, str):
                raise ValueError('language must be a supported language label.')
            result[key] = resolve_language(value).code
        elif type(value) is not bool:
            raise ValueError(f'{key} must be a boolean.')
    return result


class UIStore:
    def __init__(self, path: Path, defaults: dict | None = None):
        self.path = Path(path)
        self.lock = threading.RLock()
        initial = {**DEFAULTS, **validate_settings(defaults if defaults is not None else {})}
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self._transaction() as db:
                db.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY CHECK(id=1), settings TEXT NOT NULL, epoch INTEGER NOT NULL)')
                if 'work_epoch' not in {row[1] for row in db.execute('PRAGMA table_info(state)')}:
                    db.execute('ALTER TABLE state ADD COLUMN work_epoch INTEGER NOT NULL DEFAULT 0')
                db.execute('CREATE TABLE IF NOT EXISTS records (id INTEGER PRIMARY KEY AUTOINCREMENT, cache_key TEXT UNIQUE NOT NULL, source TEXT NOT NULL, text TEXT NOT NULL, language TEXT NOT NULL, pivot TEXT NOT NULL, model TEXT NOT NULL, created_at TEXT NOT NULL, report TEXT NOT NULL, reusable INTEGER NOT NULL)')
                db.execute('INSERT OR IGNORE INTO state (id,settings,epoch) VALUES (1, ?, 0)', (json.dumps(initial),))
                self._state(db)
            self._compact_legacy_database()
        except (OSError, sqlite3.Error) as error:
            raise self._failure(error) from None

    def _failure(self, error: Exception) -> StorageError:
        return StorageError(f'Local translation storage unavailable at {self.path}: {error}')

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.path, timeout=5)
        try:
            db.row_factory = sqlite3.Row
            db.execute('PRAGMA secure_delete=ON')
            return db
        except sqlite3.Error:
            db.close()
            raise

    def _compact_legacy_database(self) -> None:
        # A one-time migration reclaims payload left on old freelist pages.
        # This addresses the current database file, not backups or disk media.
        with self.lock:
            db = self._connect()
            try:
                if db.execute('PRAGMA user_version').fetchone()[0] < 1:
                    db.execute('VACUUM')
                    db.execute('PRAGMA user_version=1')
                    db.commit()
            finally:
                db.close()

    @contextmanager
    def _transaction(self):
        with self.lock:
            db = None
            try:
                db = self._connect()
                db.execute('BEGIN IMMEDIATE')
                yield db
                db.commit()
            except (OSError, sqlite3.Error) as error:
                if db is not None:
                    db.rollback()
                raise self._failure(error) from None
            finally:
                if db is not None:
                    db.close()

    def _state(self, db) -> tuple[dict, int]:
        row = db.execute('SELECT settings, epoch FROM state WHERE id=1').fetchone()
        try:
            settings = validate_settings(json.loads(row['settings']))
            # v0.3 stores lack this display preference. Preserve all older values
            # and records while migrating, without changing the cache epoch.
            if set(settings) == set(DEFAULTS) - {'hideOriginal'}:
                settings['hideOriginal'] = False
                db.execute('UPDATE state SET settings=? WHERE id=1',
                           (json.dumps(settings, ensure_ascii=False),))
            if set(settings) != set(DEFAULTS):
                raise ValueError('Required settings are missing.')
            return settings, row['epoch']
        except (ValueError, TypeError, KeyError) as error:
            raise StorageError(f'Invalid local UI settings at {self.path}: {error}') from None

    def begin(self) -> tuple[dict, int]:
        with self._transaction() as db:
            return self._state(db)

    def settings(self) -> dict:
        return self.begin()[0]

    def begin_work(self) -> tuple[dict, int, int]:
        with self._transaction() as db:
            settings, epoch = self._state(db)
            work_epoch = db.execute('SELECT work_epoch FROM state WHERE id=1').fetchone()[0]
            return settings, epoch, work_epoch

    def work_current(self, work_epoch: int) -> bool:
        settings, _, current = self.begin_work()
        return settings['enabled'] and current == work_epoch

    def update_settings(self, partial: dict) -> dict:
        changes = validate_settings(partial)
        with self._transaction() as db:
            previous, epoch = self._state(db)
            updated = {**previous, **changes}
            if updated != previous:
                cancel_work = (previous['enabled'] and not updated['enabled']) or updated['language'] != previous['language']
                db.execute('UPDATE state SET settings=?, epoch=?, work_epoch=work_epoch+? WHERE id=1',
                           (json.dumps(updated, ensure_ascii=False), epoch + 1, int(cancel_work)))
            return updated

    @staticmethod
    def _key(source: str, language: str, pivot: str, model: str, context: str = '') -> str:
        # Background affects translation reuse but is not stored in history.
        return hashlib.sha256(json.dumps([SCHEMA, source, language, pivot, model, context],
                             ensure_ascii=False).encode('utf-8')).hexdigest()

    @staticmethod
    def _record(row) -> dict:
        result = {key: row[key] for key in ('id', 'source', 'text', 'language', 'pivot', 'model', 'created_at')}
        result['report'] = json.loads(row['report'])
        return result

    def cached(self, source: str, language: str, pivot: str, model: str, epoch: int,
               *, context: str = '') -> dict | None:
        with self._transaction() as db:
            settings, current = self._state(db)
            if current != epoch or not settings['enabled'] or not settings['saveHistory']:
                return None
            row = db.execute('SELECT * FROM records WHERE cache_key=? AND reusable=1',
                             (self._key(source, language, pivot, model, context),)).fetchone()
            return self._record(row) if row is not None else None

    def current(self, epoch: int) -> bool:
        with self._transaction() as db:
            settings, current = self._state(db)
            return current == epoch and settings['enabled'] and settings['saveHistory']

    def record(self, source: str, text: str, language: str, pivot: str, model: str,
               report: dict, epoch: int, *, context: str = '') -> bool:
        with self._transaction() as db:
            settings, current = self._state(db)
            if current != epoch or not settings['enabled'] or not settings['saveHistory']:
                return False
            db.execute('INSERT INTO records (cache_key,source,text,language,pivot,model,created_at,report,reusable) '
                       'VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(cache_key) DO UPDATE SET '
                       'text=excluded.text,created_at=excluded.created_at,report=excluded.report,reusable=excluded.reusable',
                       (self._key(source, language, pivot, model, context), source, text, language, pivot, model,
                        datetime.now(timezone.utc).isoformat(), json.dumps(report, ensure_ascii=False),
                        int(report.get('retained_chunks', 0) == 0)))
            db.execute('DELETE FROM records WHERE id NOT IN (SELECT id FROM records ORDER BY created_at DESC,id DESC LIMIT ?)', (LIMIT,))
            return True

    def _history(self, db) -> dict:
        settings, _ = self._state(db)
        rows = db.execute('SELECT * FROM records ORDER BY created_at DESC,id DESC LIMIT ?', (LIMIT,)).fetchall()
        return {'records': [self._record(row) for row in rows], 'count': len(rows),
                'limit': LIMIT, 'path': str(self.path), 'settings': settings}

    def history(self) -> dict:
        with self._transaction() as db:
            return self._history(db)

    def clear(self) -> dict:
        with self._transaction() as db:
            db.execute('DELETE FROM records')
            db.execute('UPDATE state SET epoch=epoch+1, work_epoch=work_epoch+1 WHERE id=1')
            return self._history(db)
