"""功能测试使用明确的合成网页，隔离在临时目录；不写入用户资料库。"""
import json
import tempfile
import unittest
from pathlib import Path
from collector import Collector,due,list_parser
from network import decode
from sources.parser import article,canonical,next_page
from storage import Store

BASE='https://unit.example'
def listing(items):
    return '<html><body><ul>'+''.join(f'<li><a href="/info/1001/{num}.htm" title="{title}">{title}</a><span>{date}</span></li>' for num,title,date in items)+'</ul></body></html>'
def response(body,url=BASE+'/list.htm',kind='text/html; charset=utf-8'):
    return dict(body=body.encode() if isinstance(body,str) else body,url=url,status=200,type=kind,headers={})
class FakeClient:
    def __init__(self,values):self.values=values
    def get(self,url):
        value=self.values[url]
        if isinstance(value,Exception):raise value
        return value

class CoreTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.store=Store(self.temp.name)
        self.sid=self.store.execute('INSERT INTO sources(name,url,parser,pages) VALUES (?,?,?,?)',('合成测试学校',BASE+'/list.htm','ncu',1))
        self.client=FakeClient({})
        self.collector=Collector(self.store,self.client)
    def tearDown(self):self.temp.cleanup()
    def source(self):return self.store.query('SELECT * FROM sources WHERE id=?',(self.sid,))[0]
    def check(self,html):
        self.client.values[BASE+'/list.htm']=response(html)
        self.collector.check_source(self.source())
    def test_first_baseline_then_new_item(self):
        original=[(1,'2026年硕士研究生拟录取名单','2026-04-01')]
        self.check(listing(original))
        self.assertEqual([e['type'] for e in self.store.query('SELECT * FROM events')],['首次建档'])
        self.check(listing(original))
        self.assertEqual(self.source()['status'],'无更新')
        self.check(listing([(2,'2027年推免预报名通知','2026-09-01')]+original))
        self.assertEqual(len(self.store.query("SELECT * FROM events WHERE type='新增条目'")),1)
        self.assertEqual(len(self.store.query('SELECT * FROM snapshots')),2)
    def test_failed_parse_preserves_baseline(self):
        self.check(listing([(1,'2026年硕士研究生名单','2026-04-01')]))
        old=self.source()['fingerprint']
        self.check('<html>请登录</html>')
        self.assertEqual(self.source()['status'],'抓取失败')
        self.assertEqual(self.source()['fingerprint'],old)
        self.assertEqual(len(self.store.query('SELECT * FROM items')),1)
    def test_removed_items_are_preserved(self):
        self.check(listing([(1,'2026年硕士研究生名单','2026-04-01'),(2,'2027年推免预报名通知','2026-09-01')]))
        self.check(listing([(2,'2027年推免预报名通知','2026-09-01')]))
        self.assertEqual(len(self.store.query('SELECT * FROM items')),2)
        self.assertTrue(self.store.query("SELECT * FROM events WHERE type='列表范围变化'"))
    def test_title_and_date_change(self):
        self.check(listing([(1,'2026年硕士研究生名单','2026-04-01')]))
        self.check(listing([(1,'2026年硕士研究生名单（更正）','2026-04-02')]))
        self.assertEqual(len(self.store.query("SELECT * FROM events WHERE type='条目修改'")),1)
    def test_page_and_pdf_revision(self):
        url=BASE+'/page.htm';pdf=BASE+'/list.pdf'
        self.collector.queue(self.source(),url,'合成测试通知')
        self.client.values[url]=response('<div class="v_news_content">'+('招生内容 '*30)+f'<a href="{pdf}">名单PDF</a></div>',url)
        resource=self.store.query('SELECT * FROM resources WHERE url=?',(url,))[0]
        self.collector.check_resource(resource,self.source())
        file=self.store.query('SELECT * FROM resources WHERE url=?',(pdf,))[0]
        self.client.values[pdf]=response(b'%PDF-1.4\nsynthetic test version 1',pdf,'application/pdf')
        self.collector.check_resource(file,self.source())
        file=self.store.query('SELECT * FROM resources WHERE url=?',(pdf,))[0]
        self.client.values[pdf]=response(b'%PDF-1.4\nsynthetic test version 2',pdf,'application/pdf')
        self.collector.check_resource(file,self.source())
        self.assertEqual(len(self.store.query('SELECT * FROM snapshots WHERE url=?',(pdf,))),2)
        self.assertEqual(len(self.store.query("SELECT * FROM events WHERE type='正文或附件更新'")),1)
        for snapshot in self.store.query('SELECT * FROM snapshots'):
            self.assertTrue((self.store.root/snapshot['raw_path']).exists())
            meta=json.loads((self.store.root/snapshot['manifest_path']).read_text('utf-8'))
            self.assertEqual(meta['requested_url'],snapshot['url'])
    def test_attachment_failure_is_visible(self):
        url=BASE+'/broken.pdf'
        self.collector.queue(self.source(),url,'失败测试','file')
        self.client.values[url]=RuntimeError('HTTP 404')
        self.collector.check_resource(self.store.query('SELECT * FROM resources')[0],self.source())
        self.assertEqual(self.store.query('SELECT * FROM resources')[0]['status'],'归档失败')
        self.assertFalse(self.store.query('SELECT * FROM snapshots'))
    def test_auth_redirect_is_not_archived(self):
        url=BASE+'/restricted'
        self.collector.queue(self.source(),url,'登录测试')
        self.client.values[url]=response('登录页面 '*30,BASE+'/login')
        self.collector.check_resource(self.store.query('SELECT * FROM resources')[0],self.source())
        self.assertFalse(self.store.query('SELECT * FROM snapshots'))
    def test_process_lease(self):
        self.assertTrue(self.collector.acquire())
        self.assertFalse(Collector(self.store,self.client).acquire())
    def test_export_unicode_and_csv_formula(self):
        self.store.execute('INSERT INTO notes(school,title,body) VALUES (?,?,?)',('测试大学','=2+3','中文说明'))
        folder=self.store.export()
        obj=json.loads((folder/'完整数据.json').read_text('utf-8'))
        self.assertEqual(obj['notes'][0]['school'],'测试大学')
        self.assertIn("'=2+3",(folder/'notes.csv').read_text('utf-8-sig'))
    def test_site_adapters(self):
        cases=[('ncu','/article.jsp?urltype=news.NewsContentUrl&wbnewsid=1&wbtreeid=1311'),('scut','/2026/0402/c40628a622314/page.htm'),('cqu','/news/2026-03/2505.html'),('cas','/zsxx/202609/t20260907_856010.html'),('auto','/graduate/new.htm')]
        for parser,url in cases:
            html=f'<li><span>2026-09-07</span><a href="{url}">2027年研究生招生通知</a></li>'
            parsed=list_parser(parser,html,BASE)
            self.assertEqual(len(parsed),1,parser)
            self.assertEqual(parsed[0]['published'],'2026-09-07')
    def test_utf8_gbk_and_relative_links(self):
        self.assertEqual(decode('化工招生'.encode('gb18030'),'text/html; charset=GB2312'),'化工招生')
        self.assertEqual(canonical('../notice.htm#abc',BASE+'/list/index.htm'),BASE+'/notice.htm')
        self.assertEqual(canonical('javascript:alert(1)'), '')
    def test_publication_is_not_title_event_date(self):
        html='<li><a href="/info/1/2.htm">关于2025-06-01活动的招生通知</a><span>2026-09-01</span></li>'
        self.assertEqual(list_parser('ncu',html,BASE)[0]['published'],'2026-09-01')
    def test_navigation_without_date_is_not_a_notice(self):
        html='<a href="/info/1/2.htm">硕士研究生招生简章</a>'
        self.assertFalse(list_parser('ncu',html,BASE))
    def test_pdf_error_response_is_not_a_file(self):
        url=BASE+'/bad.pdf'
        self.collector.queue(self.source(),url,'错误文件','file')
        self.client.values[url]=response(b'Access unavailable',url,'application/pdf')
        self.collector.check_resource(self.store.query('SELECT * FROM resources')[0],self.source())
        self.assertFalse(self.store.query('SELECT * FROM snapshots'))
        self.assertEqual(self.store.query('SELECT * FROM resources')[0]['status'],'归档失败')
    def test_embedded_assets_and_next(self):
        html='<img src="/logo.png"><div class="v_news_content">通知正文<img src="/table.png"><iframe src="/doc.pdf"></iframe></div><a href="list2.htm">下一页&gt;&gt;</a>'
        text,assets=article(html,BASE)
        self.assertEqual({x['url'] for x in assets},{BASE+'/table.png',BASE+'/doc.pdf'})
        self.assertEqual(next_page(html,BASE+'/list.htm'),BASE+'/list2.htm')
    def test_last_checked_and_due(self):
        self.assertTrue(due('',24))
        self.check(listing([(1,'2026年硕士研究生名单','2026-04-01')]))
        self.assertFalse(due(self.source()['checked'],24))

if __name__=='__main__':unittest.main(verbosity=2)
