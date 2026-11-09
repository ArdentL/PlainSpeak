import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import zipfile

from plainspeak import managed
from plainspeak.downloads import download_verified, safe_extract


class ManagedTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / '.scratch'
        scratch.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=scratch)
        self.home = Path(self.tmp.name)
        self.env = patch.dict(os.environ, {'PLAINSPEAK_HOME': str(self.home)})
        self.env.start()
        self.content = b'GGUF test payload'
        model = {'id': 'test', 'filename': 'test.gguf', 'name': 'Test',
                 'size_bytes': len(self.content), 'sha256': hashlib.sha256(self.content).hexdigest(),
                 'url': 'https://example.invalid/test.gguf'}
        self.catalog = patch.object(managed, 'catalog', return_value={
            'schema_version': 1, 'default': 'test', 'models': [model]})
        self.catalog_mock = self.catalog.start()

    def tearDown(self):
        managed.shutdown()
        self.catalog.stop()
        self.env.stop()
        self.tmp.cleanup()

    def source(self):
        path = self.home / 'source.gguf'
        path.write_bytes(self.content)
        return path

    def test_missing_setup_is_read_only_and_does_not_spawn_or_download(self):
        with patch.object(managed.subprocess, 'Popen') as popen:
            self.assertFalse(managed.status()['model_installed'])
            with self.assertRaisesRegex(RuntimeError, 'setup'):
                managed.get_managed_backend()
            popen.assert_not_called()
        self.assertEqual(list(self.home.iterdir()), [])

    def test_install_and_select_validate_bytes_and_preserve_corrupt_existing_file(self):
        result = managed.install_model(source=self.source())
        self.assertEqual(result['id'], 'test')
        path = self.home / 'models/test/test.gguf'
        self.assertEqual(path.read_bytes(), self.content)
        managed.select_model('test')
        self.assertEqual(json.loads((self.home / 'config.json').read_text(encoding='utf-8')), {'model': 'test'})
        path.write_bytes(b'corrupt')
        with self.assertRaisesRegex(RuntimeError, 'corrupt|integrity|SHA|size'):
            managed.install_model(source=self.source())
        self.assertEqual(path.read_bytes(), b'corrupt')
        with self.assertRaises(RuntimeError):
            managed.select_model('test')

    def test_bad_download_is_never_published(self):
        dest = self.home / 'model.gguf'
        class Response(io.BytesIO):
            headers = {}
            def geturl(self):
                return 'https://example.invalid/file'
        with patch('urllib.request.urlopen', return_value=Response(b'wrong')):
            with self.assertRaises(RuntimeError):
                download_verified('https://example.invalid/file', dest, '0' * 64, 5)
        self.assertFalse(dest.exists())
        self.assertFalse(dest.with_name(dest.name + '.part').exists())

    def test_zip_and_tar_traversal_are_rejected_before_extraction(self):
        archive = self.home / 'bad.zip'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('good.txt', 'fine')
            z.writestr('../escape.txt', 'bad')
        with self.assertRaises(RuntimeError):
            safe_extract(archive, self.home / 'out')
        self.assertFalse((self.home / 'out/good.txt').exists())
        archive = self.home / 'bad.tar.gz'
        with tarfile.open(archive, 'w:gz') as t:
            item = tarfile.TarInfo('linked')
            item.type = tarfile.SYMTYPE
            item.linkname = '../../escape'
            t.addfile(item)
        with self.assertRaises(RuntimeError):
            safe_extract(archive, self.home / 'out')

    def test_shutdown_waits_for_own_supervisor_only(self):
        from unittest.mock import Mock
        child = Mock()
        child.poll.return_value = None
        managed._process = child
        managed._backend = object()
        managed.shutdown()
        child.stdin.close.assert_called_once()
        child.wait.assert_called_once()
        child.terminate.assert_not_called()
        self.assertIsNone(managed._backend)

    def test_internal_tar_library_link_is_materialized_as_regular_file(self):
        archive = self.home / 'runtime.tar.gz'
        with tarfile.open(archive, 'w:gz') as t:
            library = tarfile.TarInfo('runtime/libllama.so.0')
            library.size = 3
            t.addfile(library, io.BytesIO(b'lib'))
            link = tarfile.TarInfo('runtime/libllama.so')
            link.type = tarfile.SYMTYPE
            link.linkname = 'libllama.so.0'
            t.addfile(link)
        safe_extract(archive, self.home / 'runtime')
        result = self.home / 'runtime/runtime/libllama.so'
        self.assertFalse(result.is_symlink())
        self.assertEqual(result.read_bytes(), b'lib')

    def test_switch_stops_old_server_and_next_request_starts_selected_model(self):
        from unittest.mock import Mock
        self.catalog_mock.return_value['models'].append(dict(self.catalog_mock.return_value['models'][0], id='second'))
        managed.install_model('test', source=self.source())
        managed.install_model('second', source=self.source())
        children = [Mock(), Mock()]
        for child in children:
            child.poll.return_value = None
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.status = 200
        opener = Mock()
        opener.open.return_value = response
        with patch.object(managed, '_runtime_binary', return_value=self.home / 'llama-server.exe'), \
             patch.object(managed, '_start_process', side_effect=children) as launch, \
             patch.object(managed.urllib.request, 'build_opener', return_value=opener):
            first = managed.get_managed_backend()
            self.assertIs(managed.get_managed_backend(), first)
            managed.select_model('second')
            children[0].stdin.close.assert_called_once()
            second = managed.get_managed_backend()
            self.assertEqual(second.settings.model, 'second')
            self.assertEqual(launch.call_count, 2)
            self.assertEqual(launch.call_args.args[0][-3], 'second')

    def test_supervisor_eof_stops_real_child(self):
        import sys
        import time
        heartbeat = self.home / 'heartbeat.txt'
        code = ('import pathlib,time; p=pathlib.Path(' + repr(str(heartbeat)) + '); '
                '\nwhile True:\n p.write_text(str(time.time()),encoding="utf-8"); time.sleep(.05)')
        with (self.home / 'log').open('wb') as log:
            process = managed._start_process([sys.executable, '-c', code], log)
        try:
            deadline = time.monotonic() + 10
            while not heartbeat.exists() and time.monotonic() < deadline:
                if process.poll() is not None:
                    self.fail((self.home / 'log').read_text(encoding='utf-8', errors='replace'))
                time.sleep(.05)
            self.assertTrue(heartbeat.exists())
            process.stdin.close()
            process.wait(timeout=8)
            before = heartbeat.read_text(encoding='utf-8')
            time.sleep(.2)
            self.assertEqual(heartbeat.read_text(encoding='utf-8'), before)
        finally:
            if process.poll() is None:
                process.stdin.close()
                process.wait(timeout=8)


if __name__ == '__main__':
    unittest.main()
