"""Authenticated loopback translation bridge for the Harness host plugin.

The browser never talks directly to this process. The owning host keeps stdin
open, proxies requests, and closes stdin when the plugin is unloaded.
"""

from __future__ import annotations

import argparse
import hmac
import json
import os
import re
import signal
import sys
import threading
import time
from collections import OrderedDict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .backend import create_backend
from .core import rewrite, RewriteCancelled
from .languages import LANGUAGES, resolve_route
from .storage import UIStore, StorageError


class BridgeServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, port: int, token: str, defaults: dict | None = None):
        super().__init__(('127.0.0.1', port), BridgeHandler)
        self.token = token
        self.translation_lock = threading.Lock()
        self.work_slots = threading.BoundedSemaphore(4)
        self.closing = threading.Event()
        self.request_lock = threading.Lock()
        self.requests: dict[str, threading.Event] = {}
        self.cancelled_requests: OrderedDict[str, float] = OrderedDict()
        self.storage = None
        self.storage_error = None
        try:
            from .managed import data_home
            if defaults is None:
                defaults = json.loads(os.environ.get('PLAINSPEAK_UI_DEFAULTS', '{}'))
            self.storage = UIStore(data_home() / 'ui/records.sqlite3', defaults)
        except (OSError, ValueError, RuntimeError) as error:
            self.storage_error = f'UI settings initialization failed: {error}'

    def store(self) -> UIStore:
        if self.storage is None:
            raise StorageError(self.storage_error or 'UI settings initialization failed.')
        return self.storage

    def _prune_cancelled(self) -> None:
        now = time.monotonic()
        while self.cancelled_requests and next(iter(self.cancelled_requests.values())) <= now:
            self.cancelled_requests.popitem(last=False)

    def cancel(self, request_id: str) -> None:
        with self.request_lock:
            self._prune_cancelled()
            event = self.requests.get(request_id)
            if event is not None:
                event.set()
            # Cancellation can arrive before the rewrite POST. Keep only IDs,
            # never paragraph content, for a bounded race window.
            self.cancelled_requests.pop(request_id, None)
            self.cancelled_requests[request_id] = time.monotonic() + 60
            while len(self.cancelled_requests) > 256:
                self.cancelled_requests.popitem(last=False)

    def register(self, request_id: str | None) -> threading.Event:
        event = threading.Event()
        if request_id is not None:
            with self.request_lock:
                self._prune_cancelled()
                if request_id in self.requests:
                    raise RewriteCancelled('A translation with this requestId is already pending.')
                if request_id in self.cancelled_requests:
                    event.set()
                self.requests[request_id] = event
        return event

    def unregister(self, request_id: str | None, event: threading.Event) -> None:
        if request_id is not None:
            with self.request_lock:
                if self.requests.get(request_id) is event:
                    self.requests.pop(request_id)


class BridgeHandler(BaseHTTPRequestHandler):
    server: BridgeServer

    def log_message(self, *_args) -> None:
        # Do not log paragraph text, bearer tokens, or request URLs.
        pass

    def _json(self, code: int, payload: object) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.end_headers()
        try:
            self.wfile.write(raw)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _authorized(self) -> bool:
        # Only the host proxy is allowed. A page cannot open a CORS connection.
        supplied = self.headers.get('Authorization', '')
        if self.headers.get('Origin') or not hmac.compare_digest(
                supplied.encode('utf-8'), ('Bearer ' + self.server.token).encode('utf-8')):
            self._json(403, {'error': 'Host authorization required.'})
            return False
        return True

    def do_GET(self) -> None:
        if not self._authorized():
            return
        from . import managed
        try:
            if self.path == '/health':
                state = managed.status()
                self._json(200, {'ok': True, 'modelReady': bool(state.get('ready')), 'status': state})
            elif self.path == '/models':
                self._json(200, {'models': managed.list_models(), 'status': managed.status()})
            elif self.path == '/languages':
                self._json(200, [{'code': item.code, 'name': item.name} for item in LANGUAGES.values()])
            elif self.path == '/settings':
                self._json(200, self.server.store().settings())
            elif self.path == '/history':
                self._json(200, self.server.store().history())
            else:
                self._json(404, {'error': 'Unknown endpoint.'})
        except (OSError, ValueError, RuntimeError) as error:
            self._json(503, {'error': str(error)[:300]})

    def do_POST(self) -> None:
        if not self._authorized():
            return
        if self.path not in ('/rewrite', '/settings', '/history/clear', '/cancel'):
            self._json(404, {'error': 'Unknown endpoint.'})
            return
        if self.headers.get('Transfer-Encoding') or self.headers.get_content_type() != 'application/json':
            self._json(415, {'error': 'Send application/json with Content-Length.'})
            return
        try:
            size = int(self.headers.get('Content-Length', '0'))
            if size < 0 or size > 256_000 or (size == 0 and self.path != '/history/clear'):
                self._json(413, {'error': 'Request is empty or larger than 256,000 bytes.'})
                return
            self.connection.settimeout(10)
            body = json.loads(self.rfile.read(size).decode('utf-8')) if size else {}
            if not isinstance(body, dict):
                raise ValueError('Request body must be an object.')
            request_id = body.get('requestId')
            if 'requestId' in body and (not isinstance(request_id, str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}', request_id)):
                raise ValueError('requestId must contain 8-128 ASCII letters, numbers, hyphens or underscores.')
            if self.path == '/cancel':
                if set(body) != {'requestId'}:
                    raise ValueError('Cancellation requires only requestId.')
                self.server.cancel(request_id)
                self._json(200, {'cancelled': True})
                return
            if self.path == '/settings':
                self._json(200, self.server.store().update_settings(body))
                return
            if self.path == '/history/clear':
                if body != {}:
                    raise ValueError('History clear accepts an empty object.')
                self._json(200, self.server.store().clear())
                return
            if not isinstance(body, dict) or not isinstance(body.get('text'), str):
                raise ValueError('text must be a string.')
            text = body['text']
            text.encode('utf-8')
            if not text.strip() or len(text) > 20_000:
                raise ValueError('Use a nonempty paragraph of at most 20,000 characters.')
            context = body.get('context', '')
            if not isinstance(context, str) or len(context) > 2400:
                raise ValueError('context must be a string of at most 2,400 characters.')
            context.encode('utf-8')
            if 'model' in body:
                raise ValueError('Select the managed model with plainspeak models use MODEL_ID.')
            settings, epoch, work_epoch = self.server.store().begin_work()
            if not settings['enabled']:
                self._json(409, {'error': 'Translation is disabled in local settings.'})
                return
            output_language = body.get('language', settings['language'])
            pivot = body.get('pivot')
            if not isinstance(output_language, str) or (pivot is not None and not isinstance(pivot, str)):
                raise ValueError('language and pivot must be language labels.')
            original, intermediate = resolve_route(output_language, pivot)
            output_language, pivot = original.code, intermediate.code
        except (ValueError, UnicodeError, OSError) as error:
            self._json(400, {'error': str(error)[:200]})
            return
        except RuntimeError as error:
            self._json(503, {'error': str(error)[:300]})
            return
        # A short bounded queue handles React remounts and concurrent tabs. An
        # aborted fetch may still have inference running in the previous worker.
        if not self.server.work_slots.acquire(blocking=False):
            self._json(429, {'error': 'Translation is busy; retry the paragraph later.'})
            return
        cancel_event = None
        try:
            cancel_event = self.server.register(request_id)

            def cancelled() -> bool:
                return (cancel_event.is_set() or self.server.closing.is_set()
                        or not self.server.store().work_current(work_epoch))

            with self.server.translation_lock:
                if cancelled():
                    raise RewriteCancelled('Translation was cancelled.')
                from . import managed
                model = managed.status()['model']
                store = self.server.store()
                # Refresh settings after waiting for another translation. A clear,
                # disable, or preference change invalidates this request's epoch.
                current_settings, current_epoch = store.begin()
                if not current_settings['enabled']:
                    self._json(409, {'error': 'Translation is disabled in local settings.'})
                    return
                if current_epoch == epoch:
                    cached = store.cached(text, output_language, pivot, model, epoch, context=context)
                    if cached is not None and store.current(epoch) and not cancelled():
                        self._json(200, {'text': cached['text'], 'report': cached['report'], 'cached': True})
                        return
                result = rewrite(text, create_backend(), language=output_language, pivot=pivot,
                                 cancelled=cancelled, context=context)
                if cancelled():
                    raise RewriteCancelled('Translation was cancelled.')
                payload = {'text': result.text, 'report': result.report(), 'cached': False}
                same_model = False
                try:
                    # Keep potentially slow model inspection outside request_lock.
                    same_model = managed.status()['model'] == model
                except (OSError, ValueError, RuntimeError) as error:
                    payload['storage_error'] = str(error)[:300]
                # Completion and explicit cancellation have one ordering point.
                # cancel() only takes request_lock; storage never takes it, so
                # keeping the final fenced save here cannot invert those locks.
                with self.server.request_lock:
                    if cancelled():
                        raise RewriteCancelled('Translation was cancelled.')
                    if same_model:
                        try:
                            store.record(text, result.text, output_language, pivot, model, result.report(), epoch,
                                         context=context)
                        except (OSError, ValueError, RuntimeError) as error:
                            payload['storage_error'] = str(error)[:300]
                    if request_id is not None and self.server.requests.get(request_id) is cancel_event:
                        self.server.requests.pop(request_id)
                self._json(200, payload)
        except RewriteCancelled as error:
            self._json(409, {'error': str(error)})
        except (OSError, ValueError, RuntimeError) as error:
            self._json(503, {'error': str(error)[:300]})
        finally:
            if cancel_event is not None:
                self.server.unregister(request_id, cancel_event)
            self.server.work_slots.release()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=0)
    parser.add_argument('--token', required=True)
    parser.add_argument('--exit-on-stdin-close', action='store_true')
    args = parser.parse_args(argv)
    if len(args.token) < 24 or not 0 <= args.port <= 65535:
        parser.error('Use a random token of at least 24 characters and a valid local port.')
    os.environ.setdefault('PLAINSPEAK_PROVIDER', 'managed')
    server = BridgeServer(args.port, args.token)

    def stop() -> None:
        server.closing.set()
        server.shutdown()

    def watch_stdin() -> None:
        try:
            while sys.stdin.buffer.read(1):
                pass
        finally:
            stop()

    if args.exit_on_stdin_close:
        threading.Thread(target=watch_stdin, name='plainspeak-owner', daemon=True).start()
    for signum in (signal.SIGINT, signal.SIGTERM):
        signal.signal(signum, lambda *_: threading.Thread(target=stop, daemon=True).start())
    print(json.dumps({'port': server.server_port, 'host': '127.0.0.1', 'service': 'plainspeak'}), flush=True)
    try:
        server.serve_forever(poll_interval=0.2)
    finally:
        server.server_close()
        from .managed import shutdown
        shutdown()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
