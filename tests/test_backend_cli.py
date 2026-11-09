import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

from plainspeak.backend import Backend, Settings
from plainspeak.languages import language


class Handler(BaseHTTPRequestHandler):
    redirect_target = ''
    received_authorization = []

    def log_message(self, *args):
        pass

    def do_GET(self):
        if self.path in ('/redirect/models', '/same/models'):
            self.send_response(302)
            self.send_header('Location', self.redirect_target if self.path.startswith('/redirect') else '/target/models')
            self.end_headers()
            return
        self.received_authorization.append(self.headers.get('Authorization'))
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'{"data": []}')

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path in ('/redirect/chat/completions', '/same/chat/completions'):
            self.send_response(302)
            self.send_header('Location', self.redirect_target if self.path.startswith('/redirect') else '/target/models')
            self.end_headers()
            return
        if self.path == '/api/chat':
            text = 'Hello' if '翻译为英语' in body['messages'][0]['content'] else '你好'
            response = {'message': {'content': text}, 'done_reason': 'stop'}
        elif self.path == '/v1/chat/completions':
            response = {'choices': [{'message': {'content': 'Hello'}, 'finish_reason': 'stop'}]}
        elif self.path == '/cut/api/chat':
            response = {'message': {'content': 'unfinished'}, 'done_reason': 'length'}
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(response).encode('utf-8'))


class BackendTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def test_real_ollama_request_contract(self):
        backend = Backend(Settings(base_url=self.url))
        self.assertEqual(backend.translate('你好', language('en')), 'Hello')

    def test_real_openai_compatible_request_contract(self):
        backend = Backend(Settings(provider='openai', base_url=self.url + '/v1'))
        self.assertEqual(backend.translate('你好', language('en')), 'Hello')

    def test_context_prompt_separates_background_from_translation_target(self):
        backend = Backend(Settings(provider='openai', base_url=self.url + '/v1'))
        response = {'choices': [{'message': {'content': 'I am staying on.'}, 'finish_reason': 'stop'}]}
        with patch.object(backend, '_request', return_value=response) as request:
            backend.translate('今天不下。', language('en'), context='她坐在公交车上。')
        prompt = request.call_args.args[1]['messages'][0]['content']
        self.assertIn('背景信息（仅供理解，不要翻译）：\n她坐在公交车上。', prompt)
        self.assertIn('结合上述背景，将下面这段文本翻译为英语', prompt)
        self.assertTrue(prompt.endswith('只输出这段文本的译文：\n今天不下。'))

    def test_invalid_context_never_reaches_provider(self):
        backend = Backend(Settings())
        with patch.object(backend, '_request') as request:
            for context in (None, [], 42, 'x' * 2401):
                with self.subTest(context_type=type(context).__name__), self.assertRaises(ValueError):
                    backend.translate('hello', language('en'), context=context)
        request.assert_not_called()

    def test_refuses_truncated_provider_output(self):
        backend = Backend(Settings(base_url=self.url + '/cut'))
        with self.assertRaises(RuntimeError):
            backend.translate('你好', language('en'))

    def test_provider_redirects_never_forward_bearer_credentials(self):
        target = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=target.serve_forever, daemon=True)
        thread.start()
        Handler.redirect_target = f'http://localhost:{target.server_port}/target/models'
        try:
            for path in ('/redirect', '/same'):
                Handler.received_authorization.clear()
                backend = Backend(Settings(provider='openai', base_url=self.url + path, api_key='synthetic-secret'))
                for operation in (backend.doctor, lambda: backend.translate('synthetic paragraph', language('en'))):
                    with self.assertRaises(RuntimeError):
                        operation()
                    self.assertEqual(Handler.received_authorization, [])
        finally:
            target.shutdown()
            target.server_close()
            thread.join()

    def test_config_rejects_embedded_url_credentials(self):
        with self.assertRaises(ValueError):
            Backend(Settings(base_url='http://user:secret@127.0.0.1:11434'))

    def test_fresh_settings_use_managed_model_and_explicit_legacy_endpoint_still_works(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(Settings.from_env().provider, 'managed')
        with patch.dict(os.environ, {'PLAINSPEAK_BASE_URL': self.url}, clear=True):
            self.assertEqual(Settings.from_env().provider, 'ollama')
            self.assertEqual(Settings.from_env().model, 'plainspeak-hy')

    def test_managed_cli_refuses_ignored_model_or_endpoint_override(self):
        from plainspeak.cli import _parser, _settings
        for override in (['--model', 'hy-mt2-7b-q4'], ['--base-url', self.url]):
            args = _parser().parse_args(['doctor', '--provider', 'managed', *override])
            with self.assertRaises(ValueError):
                _settings(args)

    def test_cli_refuses_to_overwrite_input_even_with_force(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'input.md'
            file.write_text('原文', encoding='utf-8')
            run = subprocess.run([sys.executable, '-m', 'plainspeak', 'rewrite', str(file),
                '--output', str(file), '--force', '--language', 'zh-CN'], capture_output=True)
            self.assertNotEqual(run.returncode, 0)
            self.assertEqual(file.read_text(encoding='utf-8'), '原文')

    def test_cli_real_roundtrip_writes_utf8_and_keeps_crlf(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'in.md', Path(directory) / 'out.md'
            source.write_bytes('你好\r\n\r\n```go\r\nx := 1\r\n```\r\n'.encode('utf-8'))
            env = {**os.environ, 'PLAINSPEAK_BASE_URL': self.url}
            run = subprocess.run([sys.executable, '-m', 'plainspeak', 'rewrite', str(source),
                '--output', str(output), '--language', 'zh-CN'], capture_output=True, env=env)
            self.assertEqual(run.returncode, 0, run.stderr.decode('utf-8', errors='replace'))
            self.assertEqual(output.read_bytes(), source.read_bytes())

    def test_cli_dry_run_makes_no_model_request_or_output_file(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'in.md', Path(directory) / 'out.md'
            source.write_text('你好', encoding='utf-8')
            env = {**os.environ, 'PLAINSPEAK_BASE_URL': 'http://127.0.0.1:1'}
            run = subprocess.run([sys.executable, '-m', 'plainspeak', 'rewrite', str(source),
                '-o', str(output), '--language', 'zh-CN', '--dry-run'], capture_output=True, env=env)
            self.assertEqual(run.returncode, 0, run.stderr.decode('utf-8', errors='replace'))
            self.assertFalse(output.exists())
            self.assertEqual(json.loads(run.stdout)['language'], 'zh-CN')
