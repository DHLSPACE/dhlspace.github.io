"""Synthetic fixtures, isolated storage; no fabricated admissions records in user data."""
import json
import sys
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from discovery import Discovery, infer, parse_rule
from storage import Store
from sync_local import prepare_sync, restore_sync

URL='https://example.edu.cn/notices.htm'
HTML='<html><title>测试大学招生</title><ul id="notices">'+''.join(f'<li><a href="/n/{i}.htm">2027年硕士研究生招生通知第{i}号</a><span>2026-09-{i:02}</span></li>' for i in range(1,4))+'</ul><a href="/other.htm">研究生招生导航菜单</a></html>'

class Client:
    def get(self,url):
        return dict(url=url,body=HTML.encode(),type='text/html',status=200)

class Tests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.store=Store(self.root)
        self.discovery=Discovery(self.store,Client())

    def source(self):
        return dict(name='测试大学招生',url=URL,kind='list',parser='auto',enabled=1,interval_hours=24,pages=1,note='',school='测试大学',source_type='学校研招网',category='综合',pinned=0,rule='{}',verified_at='')

    def test_inference_excludes_navigation_and_rule_replays(self):
        rule,items=infer(HTML,URL)
        self.assertEqual(len(items),3)
        self.assertEqual(parse_rule(HTML.replace('第1号','修订版'),URL,rule)[0]['title'],'2027年硕士研究生招生通知修订版')
        self.assertFalse(parse_rule('<html>Access denied</html>',URL,rule))

    def test_no_repeat_no_success(self):
        self.assertEqual(infer('<li><a href="/n/1">2027年研究生招生通知</a><span>2026-09-01</span></li>',URL),(None,[]))

    def test_proof_required_bound_and_expiring(self):
        with self.assertRaises(ValueError):self.discovery.confirmed('',URL,'list')
        preview=self.discovery.preview(URL)
        self.assertEqual(preview['count'],3)
        token=preview['preview_token']
        self.assertEqual(self.discovery.confirmed(token,URL,'list')['url'],URL)
        with self.assertRaises(ValueError):self.discovery.confirmed(token,URL+'?x=1','list')
        with self.assertRaises(ValueError):self.discovery.confirmed(token,URL,'page')
        self.discovery.previews[token]=(time.time()-1,preview)
        with self.assertRaises(ValueError):self.discovery.confirmed(token,URL,'list')
        self.assertFalse(self.store.query('SELECT * FROM sources'))

    def test_portal_requires_choice(self):
        class Portal:
            def get(self,url):return dict(url=url,body=(HTML+'<a href="/notices.htm">硕士招生</a>').encode(),type='text/html',status=200)
        result=Discovery(self.store,Portal()).preview('https://example.edu.cn/')
        self.assertEqual(result['kind'],'candidates')
        self.assertTrue(result['candidates'])

    def test_configuration_restores_and_duplicate_rejected(self):
        s=self.source()
        sid=self.store.save_source(s)
        with self.assertRaises(ValueError):self.store.save_source(s)
        s['pinned']=1
        s['enabled']=0
        self.store.save_source(s,sid)
        self.store.seed()
        restored=self.store.query('SELECT * FROM sources')[0]
        self.assertEqual(restored['pinned'],1)
        self.assertEqual(restored['enabled'],0)
        self.assertEqual(len(json.loads((self.root/'sources/custom.json').read_text('utf-8'))),1)

    def test_write_failure_rolls_back_database(self):
        with patch.object(Path,'replace',side_effect=OSError('disk full')):
            with self.assertRaises(OSError):self.store.save_source(self.source())
        self.assertFalse(self.store.query('SELECT * FROM sources'))

    def test_url_change_preserves_old_and_pauses_it(self):
        s=self.source();sid=self.store.save_source(s);s['url']=URL+'?new=1'
        self.store.save_source(s,sid)
        rows=self.store.query('SELECT * FROM sources ORDER BY id')
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[0]['enabled'],0)

    def test_search_failure_is_explicit_not_fake_results(self):
        class Failed:
            def get(self,url):raise OSError('offline')
        result=Discovery(self.store,Failed()).search('测试大学')
        self.assertEqual(result['candidates'],[])
        self.assertIn('offline',result['warning'])

    def test_search_live_candidates_parsed(self):
        class Search:
            def get(self,url):return dict(url=url,body=b'<h2><a href="https://test.edu.cn/list">University admissions</a></h2>',type='text/html',status=200)
        result=Discovery(self.store,Search()).search('任意学校')
        self.assertEqual(result['candidates'][0]['via'],'Bing 实时搜索，待试抓')

    def test_configured_api_dispatch_and_key_not_exported(self):
        self.store.execute('INSERT INTO settings VALUES (?,?)',('search_api_key',json.dumps('TEST-ONLY-KEY')))
        with patch.object(self.discovery,'search_api',return_value=[dict(title='官网招生',url=URL,via='Brave Search API 实时搜索，待试抓')]) as api:
            result=self.discovery.search('测试大学')
            api.assert_called_once_with('测试大学','TEST-ONLY-KEY')
            self.assertEqual(result['candidates'][0]['url'],URL)
        self.assertNotIn('search_api_key',self.store.public_settings())
        self.assertTrue(self.store.public_settings()['search_api_configured'])
        self.assertNotIn('TEST-ONLY-KEY',(self.store.export()/'完整数据.json').read_text('utf-8'))

    def test_sync_restores_notes_and_sources_but_not_missing_archives(self):
        repo=self.root/'github-site';(repo/'.git').mkdir(parents=True)
        self.store.save_source(self.source())
        self.store.execute('INSERT INTO notes(school,title,body) VALUES (?,?,?)',('测试大学','我的笔记','必须保存'))
        self.store.execute('INSERT INTO snapshots(raw_path) VALUES (?)',('data/missing.pdf',))
        result=prepare_sync(self.store,repo)
        restored=Store(result['destination'])
        self.assertTrue(restore_sync(restored))
        self.assertEqual(restored.query('SELECT * FROM notes')[0]['body'],'必须保存')
        self.assertFalse(restored.query('SELECT * FROM snapshots'))
        self.assertFalse(restore_sync(restored))
        self.assertFalse((Path(result['destination'])/'data/records.sqlite3').read_bytes()==self.store.db.read_bytes())

if __name__=='__main__':unittest.main(verbosity=2)
