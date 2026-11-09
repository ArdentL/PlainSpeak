import tempfile
import json
import sqlite3
from contextlib import closing
from pathlib import Path
import unittest
from unittest.mock import patch

from plainspeak.storage import UIStore, StorageError


class StorageTests(unittest.TestCase):
    def setUp(self):
        scratch = Path(__file__).resolve().parents[1] / '.scratch'
        scratch.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(dir=scratch)
        self.path = Path(self.tmp.name) / 'ui/records.sqlite3'
        self.store = UIStore(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def save(self, source='你好', language='zh-CN', pivot='en', model='model-a', retained=0, epoch=None):
        if epoch is None:
            _, epoch = self.store.begin()
        return self.store.record(source, '译文', language, pivot, model,
                                 {'retained_chunks': retained}, epoch)

    def test_unicode_and_settings_persist_across_restart(self):
        self.store.update_settings({'language': 'ja', 'clearWriting': False, 'hideOriginal': True})
        self.save()
        restarted = UIStore(self.path, {'language': 'en'})
        self.assertEqual(restarted.settings()['language'], 'ja')
        self.assertFalse(restarted.settings()['clearWriting'])
        self.assertTrue(restarted.settings()['hideOriginal'])
        _, epoch = restarted.begin()
        self.assertEqual(restarted.cached('你好', 'zh-CN', 'en', 'model-a', epoch)['text'], '译文')
        self.assertEqual(restarted.history()['records'][0]['source'], '你好')

    def test_upgrade_preserves_old_settings_and_records(self):
        self.save()
        old = {'enabled': False, 'language': 'ja', 'clearWriting': False, 'saveHistory': False}
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('UPDATE state SET settings=? WHERE id=1', (json.dumps(old),))
        restarted = UIStore(self.path)
        self.assertEqual(restarted.settings(), {**old, 'hideOriginal': False})
        self.assertEqual(restarted.history()['count'], 1)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertIn('hideOriginal', json.loads(db.execute('SELECT settings FROM state').fetchone()[0]))

    def test_disabled_history_does_not_write_or_reuse(self):
        self.save()
        self.store.update_settings({'saveHistory': False})
        _, epoch = self.store.begin()
        self.assertIsNone(self.store.cached('你好', 'zh-CN', 'en', 'model-a', epoch))
        self.assertFalse(self.save(source='新文本', epoch=epoch))
        self.assertEqual(self.store.history()['count'], 1)

    def test_old_guard_schema_keeps_records_but_does_not_reuse_them(self):
        with patch('plainspeak.storage.SCHEMA', 3):
            self.save()
        _, epoch = self.store.begin()
        self.assertEqual(self.store.history()['count'], 1)
        self.assertIsNone(self.store.cached('你好', 'zh-CN', 'en', 'model-a', epoch))

    def test_context_scopes_cache_across_restart_without_storing_background(self):
        _, epoch = self.store.begin()
        context = 'PRIVATE_BACKGROUND_ONLY_481923_😀'
        self.assertTrue(self.store.record('Same paragraph', 'First output', 'en', 'zh-CN', 'model-a',
                                         {'retained_chunks': 0}, epoch, context=context))
        restarted = UIStore(self.path)
        self.assertEqual(restarted.cached('Same paragraph', 'en', 'zh-CN', 'model-a', epoch,
                                          context=context)['text'], 'First output')
        self.assertIsNone(restarted.cached('Same paragraph', 'en', 'zh-CN', 'model-a', epoch,
                                           context='Other background'))
        self.assertIsNone(restarted.cached('Same paragraph', 'en', 'zh-CN', 'model-a', epoch))
        self.assertTrue(restarted.record('Same paragraph', 'Second output', 'en', 'zh-CN', 'model-a',
                                         {'retained_chunks': 0}, epoch, context='Other background'))
        self.assertEqual(restarted.history()['count'], 2)
        self.assertFalse(context.encode('utf-8') in self.path.read_bytes(), 'Background plaintext was stored')
        self.assertTrue(all('context' not in record for record in restarted.history()['records']))

    def test_clear_overwrites_deleted_payload_in_database(self):
        marker = 'PRIVATE_CLEAR_PROBE_163904_'
        self.save(source=marker * 400)
        self.assertIn(marker.encode('utf-8'), self.path.read_bytes())
        self.assertEqual(self.store.clear()['count'], 0)
        self.assertFalse(marker.encode('utf-8') in self.path.read_bytes(), 'Deleted marker remains in database')

    def test_limit_eviction_overwrites_old_payload_and_preserves_recent(self):
        marker = 'PRIVATE_EVICTION_PROBE_163904_'
        with patch('plainspeak.storage.LIMIT', 2):
            self.save(source=marker * 400)
            self.save(source='Recent one')
            self.save(source='Recent two')
            self.assertEqual(self.store.history()['count'], 2)
        self.assertFalse(marker.encode('utf-8') in self.path.read_bytes(), 'Evicted marker remains in database')

    def test_startup_compacts_legacy_deleted_payload(self):
        marker = 'PRIVATE_LEGACY_PROBE_163904_'
        self.save(source=marker * 400)
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('PRAGMA secure_delete=OFF')
            db.execute('PRAGMA user_version=0')
            db.execute('DELETE FROM records')
        self.assertIn(marker.encode('utf-8'), self.path.read_bytes())
        restarted = UIStore(self.path)
        self.assertEqual(restarted.history()['count'], 0)
        self.assertFalse(marker.encode('utf-8') in self.path.read_bytes(), 'Legacy marker remains in database')
        with restarted._transaction() as db:
            self.assertEqual(db.execute('PRAGMA secure_delete').fetchone()[0], 1)

    def test_only_work_settings_and_clear_cancel_pending_translation(self):
        _, _, work_epoch = self.store.begin_work()
        self.store.update_settings({'saveHistory': False, 'hideOriginal': True})
        self.assertTrue(self.store.work_current(work_epoch))
        self.store.update_settings({'enabled': False})
        self.store.update_settings({'enabled': True})
        self.assertFalse(self.store.work_current(work_epoch))
        _, _, work_epoch = self.store.begin_work()
        self.store.update_settings({'language': 'ja'})
        self.assertFalse(self.store.work_current(work_epoch))
        _, _, work_epoch = self.store.begin_work()
        self.store.clear()
        self.assertFalse(self.store.work_current(work_epoch))

    def test_clear_and_disable_fence_inflight_results(self):
        self.save()
        _, old_epoch = self.store.begin()
        self.assertEqual(self.store.clear()['count'], 0)
        self.assertFalse(self.save(epoch=old_epoch))
        self.assertIsNone(self.store.cached('你好', 'zh-CN', 'en', 'model-a', old_epoch))
        _, old_epoch = self.store.begin()
        self.store.update_settings({'saveHistory': False})
        self.store.update_settings({'saveHistory': True})
        self.assertFalse(self.save(epoch=old_epoch))

    def test_cache_key_changes_with_language_pivot_or_model_and_partial_is_not_reused(self):
        self.save()
        _, epoch = self.store.begin()
        for language, pivot, model in [('ja', 'en', 'model-a'), ('zh-CN', 'ja', 'model-a'), ('zh-CN', 'en', 'model-b')]:
            self.assertIsNone(self.store.cached('你好', language, pivot, model, epoch))
        self.save(source='部分保留', retained=1)
        self.assertIsNone(self.store.cached('部分保留', 'zh-CN', 'en', 'model-a', epoch))
        self.assertEqual(self.store.history()['records'][0]['report']['retained_chunks'], 1)

    def test_validation_and_bounded_upsert(self):
        for invalid in ({'saveHistory': 1}, {'hideOriginal': 'true'}, {'language': 'bad'}, {'unknown': False}):
            with self.assertRaises(ValueError):
                self.store.update_settings(invalid)
        self.save()
        self.save()
        self.assertEqual(self.store.history()['count'], 1)
        with self.assertRaises(StorageError):
            UIStore(Path(self.tmp.name))

    def test_record_limit_discards_oldest_and_preserves_recent(self):
        for number in range(1002):
            self.save(source=f'段落 {number}')
        result = self.store.history()
        self.assertEqual(result['count'], 1000)
        self.assertEqual(result['records'][0]['source'], '段落 1001')
        self.assertNotIn('段落 0', [r['source'] for r in result['records']])


if __name__ == '__main__':
    unittest.main()
