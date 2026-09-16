import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import cloud


class PublishTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='sch-doc-test-')
        self.root = Path(self.tmp.name)
        self.store = cloud.prepare(self.root)

    def tearDown(self):
        self.tmp.cleanup()

    def test_private_data_not_published(self):
        self.store.execute("INSERT INTO notes(school,title,body) VALUES ('私人学校','私人计划','PRIVATE_SENTINEL')")
        self.store.execute("UPDATE settings SET value='\"PRIVATE_PROXY\"' WHERE key='proxy'")
        cloud.publish(self.store, self.root / 'out')
        body = (self.root / 'out' / 'data.json').read_text('utf-8')
        self.assertNotIn('PRIVATE_', body)
        self.assertEqual(len(json.loads(body)['notes']), len(json.loads((cloud.HERE / 'seed_notes.json').read_text('utf-8'))))

    def test_html_is_inert_and_manifest_is_preserved(self):
        source = self.store.query('SELECT * FROM sources LIMIT 1')[0]
        raw = b'<html><script>window.untrusted=true</script><p>Archive</p></html>'
        cloud.Collector(self.store).archive(source, 'https://example.org/notice', {'body': raw, 'url': 'https://example.org/notice', 'type': 'text/html', 'status': 200}, 'page', 'Archive')
        result = cloud.publish(self.store, self.root / 'out')
        snapshot = result['snapshots'][0]
        self.assertTrue(snapshot['raw_path'].endswith('.html.download.txt'))
        self.assertEqual((self.root / 'out' / snapshot['raw_path']).read_bytes(), raw)
        manifest = json.loads((self.root / 'out' / snapshot['manifest_path']).read_text('utf-8'))
        self.assertEqual(manifest['http_status'], 200)

    def test_configuration_removal_pauses_without_erasing_history(self):
        sid = self.store.execute("INSERT INTO sources(name,url,enabled) VALUES ('removed','https://example.org/old',1)")
        self.store.execute("INSERT INTO items(source_id,url,title) VALUES (?, 'https://example.org/one','old notice')", (sid,))
        cloud.prepare(self.root)
        self.assertEqual(self.store.query('SELECT enabled FROM sources WHERE id=?', (sid,))[0]['enabled'], 0)
        self.assertEqual(len(self.store.query('SELECT * FROM items WHERE source_id=?', (sid,))), 1)

    def test_archive_path_cannot_escape_data(self):
        self.store.execute("INSERT INTO snapshots(raw_path,text_path,manifest_path) VALUES ('../private.txt','','')")
        with self.assertRaises(ValueError):
            cloud.publish(self.store, self.root / 'out')

    def test_existing_branch_is_updated_without_force(self):
        api = cloud.GitHub('test/repo', 'test-token-not-real')
        calls = []
        def fake(path, payload=None, method=None):
            calls.append((path, payload, method))
            if path.startswith('/git/trees/'): return {'tree': []}
            return {'sha': 'fake-sha'}
        with patch.object(api, 'call', side_effect=fake):
            api.persist(self.root, 'previous-sha')
        self.assertEqual(calls[-1], ('/git/refs/heads/sch-doc-data', {'sha': 'fake-sha', 'force': False}, 'PATCH'))
        commit = next(payload for path, payload, method in calls if path == '/git/commits')
        self.assertEqual(commit['parents'], ['previous-sha'])
        tree = next(payload for path, payload, method in calls if path == '/git/trees')
        self.assertTrue(all(x['path'].startswith('data/') for x in tree['tree']))

    def test_existing_backup_failure_does_not_start_empty(self):
        api = cloud.GitHub('test/repo', 'test-token-not-real')
        with patch('urllib.request.urlopen', side_effect=OSError('unavailable')):
            with self.assertRaises(OSError):
                api.restore(self.root / 'new', 'previous-sha')
        self.assertFalse((self.root / 'new' / 'data' / 'records.sqlite3').exists())


if __name__ == '__main__':
    unittest.main()
