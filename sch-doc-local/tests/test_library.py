import io
import json
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch
from storage import Store, ROOT
from library import institutions, queue_many, archive_bundle
from discovery import Discovery

class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.store=Store(Path(self.temp.name))
        self.store.execute("INSERT INTO sources(id,name,school,url) VALUES (1,'测试学院','测试大学','https://example.edu.cn')")

    def test_batch_atomic_validation_and_duplicates(self):
        with self.assertRaises(ValueError):queue_many(self.store,1,['https://example.edu.cn/a.pdf','bad'])
        self.assertEqual(self.store.query('SELECT * FROM resources'),[])
        result=queue_many(self.store,1,['https://example.edu.cn/a.pdf']*2+['https://example.edu.cn/n.htm'])
        self.assertEqual(result,dict(ok=True,added=2,duplicates=1))
        self.assertEqual(queue_many(self.store,1,['https://example.edu.cn/a.pdf'])['added'],0)
        with self.assertRaises(ValueError):queue_many(self.store,99,['https://example.edu.cn/a'])
        with self.assertRaises(ValueError):queue_many(self.store,1,['https://example.edu.cn/a']*31)

    def snapshot(self):
        for name in ['original.pdf','text.txt','manifest.json']:
            (self.store.data/name).write_bytes(b'original bytes')
        return self.store.execute("INSERT INTO snapshots(source_id,url,kind,raw_path,text_path,manifest_path) VALUES (1,'https://example.edu.cn/a','PDF','data/original.pdf','data/text.txt','data/manifest.json')")

    def test_bundle_keeps_original_bytes_and_provenance(self):
        self.snapshot()
        sid=self.store.query('SELECT id FROM snapshots')[0]['id']
        with zipfile.ZipFile(io.BytesIO(archive_bundle(self.store,[sid]))) as bundle:
            names=bundle.namelist()
            self.assertEqual(len(names),4)
            self.assertEqual(bundle.read(next(n for n in names if 'raw_path' in n)),b'original bytes')
            self.assertEqual(json.loads(bundle.read('来源索引.json'))[0]['url'],'https://example.edu.cn/a')

    def test_bundle_rejects_missing_traversal_and_oversize(self):
        self.snapshot()
        sid=self.store.query('SELECT id FROM snapshots')[0]['id']
        with self.assertRaises(ValueError):archive_bundle(self.store,[999])
        with self.assertRaises(ValueError):archive_bundle(self.store,list(range(201)))
        self.store.execute("UPDATE snapshots SET raw_path='../private.txt'")
        with self.assertRaises(ValueError):archive_bundle(self.store,[sid])
        self.store.execute("UPDATE snapshots SET raw_path='data/missing.pdf'")
        with self.assertRaises(ValueError):archive_bundle(self.store,[sid])

    def test_catalog_complete_and_local_search_needs_no_network(self):
        rows=institutions(type('ReadOnly',(),{'root':ROOT})())
        self.assertEqual(sum(x['tier']=='985' for x in rows),39)
        self.assertEqual(sum(x['tier']=='研究所' for x in rows),37)
        self.assertEqual(sum(x['school']=='南昌大学' for x in rows),1)
        self.assertTrue(all(x.get('province') and '京外' not in x['province'] for x in rows))
        self.assertEqual(len({r['id'] for r in rows}),len(rows))
        self.assertTrue(all('chem' not in row for row in rows))
        (self.store.root/'sources').mkdir()
        (self.store.root/'sources/institutions.json').write_text(json.dumps(rows),encoding='utf-8')
        with patch.object(Discovery,'network',side_effect=AssertionError('No network needed')):
            result=Discovery(self.store).search('过程工程研究所')
        self.assertTrue(result['candidates'])
        self.assertEqual(self.store.query('SELECT COUNT(*) AS n FROM sources')[0]['n'],1)

if __name__=='__main__':unittest.main()
