import hashlib
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from storage import Store
from snapshot_export import export_snapshot, records, choose_records, safe_name, save_destination, SnapshotJobs


class SnapshotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store = Store(Path(self.temp.name))
        self.store.execute("INSERT INTO sources(id,name,school,url) VALUES(1,'化学学院','测试大学','https://example.edu.cn')")

    def sample(self, title='2027年硕士拟录取名单公示', url='https://example.edu.cn/list.pdf', raw=b'%PDF-1.4 test fixture', suffix='.pdf'):
        n = len(self.store.query('SELECT id FROM snapshots'))+1
        paths = []
        for name, body in [('original'+suffix,raw),('text.txt',b'text fixture'),('manifest.json',b'{}')]:
            p = self.store.data/(str(n)+'_'+name)
            p.write_bytes(body)
            paths.append(p.relative_to(self.store.root).as_posix())
        self.store.execute('INSERT OR REPLACE INTO resources(source_id,url,title,status) VALUES (1,?,?,?)',(url,title,'已归档'))
        return self.store.execute('INSERT INTO snapshots(source_id,url,created,sha256,kind,raw_path,text_path,manifest_path) VALUES(1,?,?,?,\'file\',?,?,?)',(url,'2026-09-18',hashlib.sha256(raw).hexdigest(),*paths))

    def test_bytes_classification_unicode_and_collision(self):
        self.sample()
        a=export_snapshot(self.store,{'mode':'publicity'})
        b=export_snapshot(self.store,{'mode':'publicity'})
        self.assertNotEqual(a['path'],b['path'])
        self.assertTrue(Path(a['path']).parent.samefile(self.store.root/'snapshot'))
        with zipfile.ZipFile(a['path']) as z:
            self.assertIsNone(z.testzip())
            index=json.loads(z.read('来源索引.json'))
            row=index['records'][0]
            raw=row['files'][0]
            self.assertTrue(raw['path'].startswith('测试大学/2027/目标/'))
            self.assertIn('拟录取名单公示',raw['path'])
            self.assertEqual(z.read(raw['path']),b'%PDF-1.4 test fixture')
            self.assertEqual(raw['sha256'],hashlib.sha256(z.read(raw['path'])).hexdigest())
            self.assertFalse(index['problems'])

    def test_missing_traversal_and_hash_mismatch_are_explicit(self):
        sid=self.sample()
        self.store.execute("UPDATE snapshots SET text_path='../secret.txt',sha256='wrong' WHERE id=?",(sid,))
        result=export_snapshot(self.store,{'mode':'all'})
        self.assertEqual(result['warnings'],2)
        with zipfile.ZipFile(result['path']) as z:
            self.assertFalse(any('secret' in p for p in z.namelist()))
            self.assertEqual(len(json.loads(z.read('未完成与校验问题.json'))['problems']),2)

    def test_latest_selection_and_empty_priority(self):
        first=self.sample(title='2028年硕士招生简章')
        second=self.sample(title='2028年硕士招生简章')
        with self.assertRaises(ValueError):export_snapshot(self.store,{'mode':'publicity'})
        data=records(self.store)
        self.assertEqual([x['id'] for x in choose_records(data,{'mode':'all'})],[second])
        self.assertEqual(len(choose_records(data,{'mode':'all','latest':False})),2)
        self.assertEqual([x['id'] for x in choose_records(data,{'mode':'selected','ids':[first]})],[first])
        with self.assertRaises(ValueError):choose_records(data,{'mode':'selected','ids':[999]})

    def test_limits_remove_incomplete_zip_and_settings_no_export(self):
        self.sample()
        jobs=SnapshotJobs(self.store)
        self.assertFalse(jobs.status()['running'])
        self.assertFalse((self.store.root/'snapshot').exists())
        with patch('snapshot_export.MAX_BYTES',1),self.assertRaises(ValueError):export_snapshot(self.store,{'mode':'all'})
        self.assertEqual(list((self.store.root/'snapshot').iterdir()),[])
        dest=self.store.root/'自选目录'
        save_destination(self.store,str(dest))
        self.assertFalse(dest.exists())
        result=export_snapshot(self.store,{'mode':'all'})
        self.assertEqual(Path(result['path']).parent,dest)
        with self.assertRaises(ValueError):save_destination(self.store,'../relative')

    def test_html_inert_csv_formula_safe_and_unknown_year(self):
        self.sample(title='=硕士名单公示',raw=b'<script>test</script>',suffix='.html')
        result=export_snapshot(self.store,{'mode':'all'})
        with zipfile.ZipFile(result['path']) as z:
            row=json.loads(z.read('来源索引.json'))['records'][0]
            self.assertEqual(row['filing']['year'],'待核实')
            self.assertTrue(row['files'][0]['path'].endswith('.html.download.txt'))
            self.assertIn("'=硕士名单公示",z.read('分类目录.csv').decode('utf-8-sig'))
        self.assertEqual(safe_name('CON'),'_CON')
        self.assertNotIn('/',safe_name('../a/b:*'))


if __name__=='__main__':unittest.main()
