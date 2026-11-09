"""Bridge authentication, failure behavior, and owning-host lifecycle."""

import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from types import SimpleNamespace

from plainspeak.bridge import BridgeServer

TOKEN = 'test-token-with-at-least-thirty-characters'


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.home = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {'PLAINSPEAK_HOME': self.home.name})
        self.env.start()
        self.server = BridgeServer(0, TOKEN)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        self.opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        self.home.cleanup()

    def request(self, path, body=None, token=TOKEN, origin=None):
        headers = {'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'}
        if origin:
            headers['Origin'] = origin
        req = urllib.request.Request(self.url + path, headers=headers,
            data=json.dumps(body).encode('utf-8') if body is not None else None)
        try:
            response = self.opener.open(req, timeout=10)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.load(response)

    def test_unauthorized_and_browser_origin_cannot_read_or_translate(self):
        with patch('plainspeak.bridge.create_backend') as backend:
            self.assertEqual(self.request('/health', token='wrong')[0], 403)
            self.assertEqual(self.request('/languages', origin='https://example.com')[0], 403)
            self.assertEqual(self.request('/rewrite', {'text': '私有段落'}, token='wrong')[0], 403)
            backend.assert_not_called()

    def test_empty_oversize_or_invalid_language_rejected_before_model_start(self):
        with patch('plainspeak.bridge.create_backend') as backend:
            for body in ({'text': ''}, {'text': 'x' * 20_001}, {'text': 'hello', 'language': 'bad'}):
                self.assertEqual(self.request('/rewrite', body)[0], 400)
            backend.assert_not_called()

    def test_context_type_and_unicode_length_are_checked_before_model_start(self):
        with patch('plainspeak.bridge.create_backend') as backend:
            for context in (None, 123, [], {}, True, '😀' * 2401):
                with self.subTest(context_type=type(context).__name__):
                    self.assertEqual(self.request('/rewrite', {'text': 'Synthetic paragraph', 'context': context})[0], 400)
            backend.assert_not_called()

    def test_context_is_forwarded_and_cache_is_scoped_to_it(self):
        context = 'Independent background 😀' * 30
        result = SimpleNamespace(text='Synthetic output', report=lambda: {'retained_chunks': 0})
        body = {'text': 'Synthetic paragraph', 'language': 'en', 'context': context}
        with patch('plainspeak.bridge.create_backend'), patch('plainspeak.bridge.rewrite', return_value=result) as rewrite:
            code, first = self.request('/rewrite', body)
            self.assertEqual(code, 200)
            self.assertFalse(first['cached'])
            self.assertEqual(rewrite.call_args.kwargs['context'], context)
            code, second = self.request('/rewrite', body)
            self.assertEqual(code, 200)
            self.assertTrue(second['cached'])
            self.assertEqual(rewrite.call_count, 1)
            code, different = self.request('/rewrite', {**body, 'context': 'Different background'})
            self.assertEqual(code, 200)
            self.assertFalse(different['cached'])
            self.assertEqual(rewrite.call_count, 2)

    def test_empty_and_maximum_context_are_accepted(self):
        result = SimpleNamespace(text='Synthetic output', report=lambda: {'retained_chunks': 0})
        with patch('plainspeak.bridge.create_backend'), patch('plainspeak.bridge.rewrite', return_value=result) as rewrite:
            for context in ('', '😀' * 2400):
                code, _ = self.request('/rewrite', {'text': 'Synthetic paragraph', 'context': context})
                self.assertEqual(code, 200)
                self.assertEqual(rewrite.call_args.kwargs['context'], context)

    def test_invalid_local_config_returns_a_structured_error(self):
        with patch('plainspeak.managed.status', side_effect=RuntimeError('Invalid PlainSpeak config')):
            code, response = self.request('/health')
        self.assertEqual(code, 503)
        self.assertIn('config', response['error'])

    def test_code_damage_retains_original_and_reports_it(self):
        class DamagedBackend:
            def translate(self, text, target):
                return '结果是 `limit=999`。'
        with patch('plainspeak.bridge.create_backend', return_value=DamagedBackend()):
            code, result = self.request('/rewrite', {'text': '使用 `limit=54`。', 'language': 'zh-CN'})
        self.assertEqual(code, 200)
        self.assertEqual(result['text'], '使用 `limit=54`。')
        self.assertEqual(result['report']['retained_chunks'], 1)

    def test_plain_number_changes_are_returned_without_retention(self):
        class NumericBackend:
            def translate(self, text, target):
                return '老周开27路末班车，已经开了11年。'
        with patch('plainspeak.bridge.create_backend', return_value=NumericBackend()):
            code, result = self.request('/rewrite', {'text': '老周开27路末班车，开了十一年。', 'language': 'zh-CN'})
        self.assertEqual(code, 200)
        self.assertEqual(result['text'], '老周开27路末班车，已经开了11年。')
        self.assertEqual(result['report']['retained_chunks'], 0)

    def test_busy_model_rejects_extra_work_without_starting_another(self):
        for _ in range(4):
            self.server.work_slots.acquire()
        try:
            with patch('plainspeak.bridge.create_backend') as backend:
                self.assertEqual(self.request('/rewrite', {'text': 'hello', 'language': 'en'})[0], 429)
                backend.assert_not_called()
        finally:
            for _ in range(4):
                self.server.work_slots.release()

    def test_settings_history_and_restart_reuse_without_backend_start(self):
        class Translator:
            def translate(self, text, target):
                return '清楚的译文'
        with patch('plainspeak.bridge.create_backend', return_value=Translator()):
            code, first = self.request('/rewrite', {'text': '你好世界', 'language': 'zh-CN'})
        self.assertEqual(code, 200)
        self.assertFalse(first['cached'])
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.server = BridgeServer(0, TOKEN)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f'http://127.0.0.1:{self.server.server_port}'
        with patch('plainspeak.bridge.create_backend') as backend:
            code, reused = self.request('/rewrite', {'text': '你好世界', 'language': 'zh-CN'})
            backend.assert_not_called()
        self.assertTrue(reused['cached'])
        self.assertEqual(self.request('/history')[1]['count'], 1)
        self.assertEqual(self.request('/history/clear', {})[1]['count'], 0)
        self.assertFalse(self.request('/settings', {'saveHistory': False})[1]['saveHistory'])
        self.assertEqual(self.request('/settings', {'enabled': False})[0], 200)
        with patch('plainspeak.bridge.create_backend') as backend:
            self.assertEqual(self.request('/rewrite', {'text': '你好世界'})[0], 409)
            backend.assert_not_called()

    def test_settings_and_model_errors_precede_backend_start(self):
        with patch('plainspeak.bridge.create_backend') as backend:
            for invalid in ({'enabled': 1}, {'language': 'bad'}, {'oops': True}):
                self.assertEqual(self.request('/settings', invalid)[0], 400)
            self.assertEqual(self.request('/rewrite', {'text': 'hello', 'model': 'unknown'})[0], 400)
            backend.assert_not_called()

    def test_clear_or_history_disable_during_inference_fences_save(self):
        for operation in ('clear', 'disable'):
            entered, proceed = threading.Event(), threading.Event()
            class DelayedTranslator:
                def translate(self, text, target):
                    entered.set()
                    if not proceed.wait(5):
                        raise RuntimeError('Test did not release inference')
                    return '译文'
            responses = []
            self.request('/settings', {'saveHistory': True})
            with patch('plainspeak.bridge.create_backend', return_value=DelayedTranslator()):
                worker = threading.Thread(target=lambda: responses.append(self.request('/rewrite', {'text': f'并发测试{operation}', 'language': 'zh-CN'})))
                worker.start()
                self.assertTrue(entered.wait(5))
                if operation == 'clear':
                    self.assertEqual(self.request('/history/clear', {})[0], 200)
                else:
                    self.assertEqual(self.request('/settings', {'saveHistory': False})[0], 200)
                proceed.set()
                worker.join(5)
            self.assertFalse(worker.is_alive())
            self.assertEqual(responses[0][0], 409 if operation == 'clear' else 200)
            self.assertEqual(self.request('/history')[1]['count'], 0)

    def test_disable_cancel_and_close_stop_between_provider_calls(self):
        for operation in ('disable', 'cancel', 'close'):
            with self.subTest(operation=operation):
                self.server.closing.clear()
                self.request('/settings', {'enabled': True})
                entered, proceed = threading.Event(), threading.Event()
                calls, responses = [], []
                class DelayedTranslator:
                    def translate(self, text, target):
                        calls.append(text)
                        if len(calls) == 1:
                            entered.set()
                            if not proceed.wait(5):
                                raise RuntimeError('Fixture was not released')
                        return text
                request_id = 'work-id-' + operation
                with patch('plainspeak.bridge.create_backend', return_value=DelayedTranslator()):
                    worker = threading.Thread(target=lambda: responses.append(self.request('/rewrite', {
                        'text': 'This is a multichunk synthetic paragraph. ' * 60,
                        'language': 'en', 'requestId': request_id})))
                    worker.start()
                    self.assertTrue(entered.wait(5))
                    try:
                        if operation == 'disable':
                            self.request('/settings', {'enabled': False})
                            self.request('/settings', {'enabled': True})
                        elif operation == 'cancel':
                            self.assertEqual(self.request('/cancel', {'requestId': request_id})[0], 200)
                        else:
                            self.server.closing.set()
                    finally:
                        proceed.set()
                        worker.join(5)
                self.assertFalse(worker.is_alive())
                self.assertEqual(len(calls), 1)
                self.assertEqual(responses[0][0], 409)
                self.assertEqual(self.request('/history')[1]['count'], 0)
                self.assertEqual(self.server.requests, {})

    def test_cancel_before_rewrite_and_request_id_validation(self):
        self.assertEqual(self.request('/cancel', {'requestId': 'early-cancel-id'})[0], 200)
        with patch('plainspeak.bridge.create_backend') as backend:
            self.assertEqual(self.request('/rewrite', {'text': 'hello', 'requestId': 'early-cancel-id'})[0], 409)
            for invalid in ('', 'x' * 129, 'invalid id', 42):
                self.assertEqual(self.request('/cancel', {'requestId': invalid})[0], 400)
                self.assertEqual(self.request('/rewrite', {'text': 'hello', 'requestId': invalid})[0], 400)
            backend.assert_not_called()

    def test_cancel_during_final_model_check_prevents_record_and_success(self):
        entered, proceed = threading.Event(), threading.Event()
        responses, status_calls = [], []
        class Translator:
            def translate(self, text, target):
                return text
        def status():
            status_calls.append(True)
            if len(status_calls) == 2:
                entered.set()
                if not proceed.wait(5):
                    raise RuntimeError('Fixture was not released')
            return {'model': 'synthetic'}
        with patch('plainspeak.bridge.create_backend', return_value=Translator()), \
             patch('plainspeak.managed.status', side_effect=status):
            worker = threading.Thread(target=lambda: responses.append(self.request('/rewrite', {
                'text': 'Synthetic cancellation before final save.', 'requestId': 'final-save-cancel'})))
            worker.start()
            self.assertTrue(entered.wait(5))
            try:
                self.assertEqual(self.request('/cancel', {'requestId': 'final-save-cancel'})[0], 200)
            finally:
                proceed.set()
                worker.join(5)
        self.assertFalse(worker.is_alive())
        self.assertEqual(responses[0][0], 409)
        self.assertEqual(self.server.store().history()['count'], 0)
        self.assertEqual(self.server.requests, {})

    def test_optional_record_failure_preserves_successful_translation(self):
        from plainspeak.storage import StorageError
        class Translator:
            def translate(self, text, target):
                return '成功译文'
        with patch('plainspeak.bridge.create_backend', return_value=Translator()), \
             patch.object(self.server.storage, 'record', side_effect=StorageError('disk full')):
            code, response = self.request('/rewrite', {'text': '待译文本'})
        self.assertEqual(code, 200)
        self.assertEqual(response['text'], '成功译文')
        self.assertIn('disk full', response['storage_error'])

    def test_initialization_failure_is_structured_and_never_starts_backend(self):
        self.server.storage = None
        self.server.storage_error = 'UI settings initialization failed: read-only disk'
        with patch('plainspeak.bridge.create_backend') as backend:
            self.assertEqual(self.request('/settings')[0], 503)
            self.assertEqual(self.request('/rewrite', {'text': 'hello'})[0], 503)
            backend.assert_not_called()

    def test_host_stdin_close_stops_actual_bridge_without_starting_model(self):
        with tempfile.TemporaryDirectory() as directory:
            env = {**os.environ, 'PLAINSPEAK_HOME': directory, 'PLAINSPEAK_PROVIDER': 'managed'}
            child = subprocess.Popen([sys.executable, '-m', 'plainspeak.bridge', '--port', '0',
                '--token', TOKEN, '--exit-on-stdin-close'], stdin=subprocess.PIPE,
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env, text=True, encoding='utf-8')
            try:
                ready = json.loads(child.stdout.readline())
                self.assertEqual(ready['service'], 'plainspeak')
                request = urllib.request.Request(f'http://127.0.0.1:{ready["port"]}/health',
                    headers={'Authorization': 'Bearer ' + TOKEN})
                with self.opener.open(request, timeout=10) as response:
                    self.assertFalse(json.load(response)['modelReady'])
                self.assertFalse((Path(directory) / 'runtime.log').exists())
                child.stdin.close()
                self.assertEqual(child.wait(timeout=10), 0)
            finally:
                if child.poll() is None:
                    child.kill()
                    child.wait()
                child.stdout.close()
                child.stderr.close()
