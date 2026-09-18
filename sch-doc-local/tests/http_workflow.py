"""真实HTTP链路验收，网站内容为合成夹具；用户数据库完全隔离。"""
import base64
import json
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
class Fixture(BaseHTTPRequestHandler):
    revision=1
    def log_message(self,*args):pass
    def do_GET(self):
        if self.path=='/robots.txt':
            self.send_response(404);self.end_headers();return
        if self.path=='/list.htm':
            html='<li><a href="/page.htm">合成夹具大学2028年硕士招生通知</a><span>2027-09-01</span></li><li><a href="/page.htm?baseline=2">合成夹具大学2028年招生目录通知</a><span>2027-09-01</span></li>'
            if Fixture.revision>1:html+='<li><a href="/page2.htm">合成夹具大学2028年推免补充通知</a><span>2027-09-02</span></li>'
            body=html.encode();ctype='text/html; charset=utf-8'
        elif self.path in {'/page.htm','/page2.htm','/page.htm?baseline=2'}:
            body=('<div class="v_news_content">'+('这是功能验收专用合成通知，不是任何学校真实招生信息。'*5)+'<a href="/file.pdf">夹具PDF</a></div>').encode();ctype='text/html; charset=utf-8'
        elif self.path=='/file.pdf':
            body=b'%PDF-1.4\n% SYNTHETIC TEST FIXTURE - NOT ADMISSIONS DATA';ctype='application/pdf'
        else:
            self.send_response(404);self.end_headers();return
        self.send_response(200);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)

def free_port():
    with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

def run():
    checks=[]
    fixture=ThreadingHTTPServer(('127.0.0.1',0),Fixture)
    threading.Thread(target=fixture.serve_forever,daemon=True).start()
    fixture_url=f'http://127.0.0.1:{fixture.server_port}'
    port=free_port();base=f'http://127.0.0.1:{port}'
    op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with tempfile.TemporaryDirectory(prefix='graduate_http_') as folder:
        process=subprocess.Popen([sys.executable,'-B',str(ROOT/'app.py'),'--no-browser','--port',str(port),'--data-root',folder],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        token=''
        def get(path):return op.open(base+path,timeout=5)
        def state():return json.load(get('/api/state'))
        def post(path,obj,authenticated=True):
            headers={'Content-Type':'application/json'}
            if authenticated:headers['X-App-Token']=token
            req=urllib.request.Request(base+'/api/'+path,json.dumps(obj).encode(),headers)
            return json.load(op.open(req,timeout=10))
        def wait_job():
            for _ in range(120):
                current=state()
                if not current['job']['running']:return current
                time.sleep(.2)
            raise AssertionError('采集未在24秒内完成')
        try:
            for _ in range(40):
                try:token=state()['token'];break
                except Exception:time.sleep(.15)
            assert token,'HTTP服务未启动'
            assert b'<!doctype html>' in get('/').read().lower();checks.append('本地窗口HTML响应')
            try:post('read',{},False);raise AssertionError('缺token被接受')
            except urllib.error.HTTPError as exc:assert exc.code==403
            checks.append('跨站写入防护')
            source={'name':'合成夹具大学','url':fixture_url+'/list.htm','kind':'list','parser':'auto','enabled':True,'pages':1,'interval_hours':24}
            try:post('source',source);raise AssertionError('未试抓的来源被接受')
            except urllib.error.HTTPError as exc:assert exc.code==400
            preview=post('discover',{'query':source['url']})
            assert preview['count']==2
            assert not state()['sources'],'预览不应写入数据库'
            source['preview_token']=preview['preview_token']
            post('source',source)
            config=Path(folder)/'sources'/'custom.json'
            assert json.loads(config.read_text('utf-8'))[0]['verified_at']
            checks.append('试抓后确认写入配置和数据库，未验证不能添加')
            post('check',{'force':True});first=wait_job()
            assert len(first['items'])==2 and len(first['snapshots'])==4,first
            assert {s['kind'] for s in first['snapshots']}=={'list','page','file'}
            checks.append('真实HTTP：列表→详情→PDF下载→归档索引')
            raw=next(s for s in first['snapshots'] if s['kind']=='file')
            assert get('/api/archive?id='+str(raw['id'])+'&view=raw').read().startswith(b'%PDF')
            checks.append('原始附件下载接口')
            post('check',{'force':True});same=wait_job();assert len(same['snapshots'])==4 and same['sources'][0]['status']=='无更新'
            checks.append('重复检查不重复归档')
            Fixture.revision=2
            post('check',{'force':True});changed=wait_job();assert len(changed['items'])==3 and any(e['type']=='新增条目' for e in changed['events'])
            checks.append('新增通知提醒')
            post('note',{'school':'合成夹具大学','year':'2028','category':'其他','title':'验收专用笔记','body':'中文持久化与来源关联验证','url':fixture_url+'/page.htm','source_id':1,'item_id':1,'verified':'待核实'})
            n=state()['notes'][0];assert n['body']=='中文持久化与来源关联验证' and n['item_id']==1
            post('note',{**n,'body':'编辑后仍可检索'});assert state()['notes'][0]['body']=='编辑后仍可检索'
            checks.append('新增/修改结构化笔记并关联通知')
            post('import-file',{'source_id':1,'url':fixture_url+'/manual.pdf','filename':'手动验收.pdf','base64':base64.b64encode(b'%PDF-1.4 test only').decode()})
            assert any(s['kind']=='手动导入' for s in state()['snapshots'])
            checks.append('手动原件导入并区分来源')
            export=json.load(get('/api/export'));assert export['notes'][0]['title']=='验收专用笔记'
            assert '验收专用笔记' in get('/api/notes.csv').read().decode('utf-8-sig')
            checks.append('JSON / UTF-8 CSV 导出')
            post('read',{});assert all(not e['unread'] for e in state()['events'])
            checks.append('已读状态持久化')
            post('source',{**state()['sources'][0],'enabled':False});assert state()['sources'][0]['enabled']==0
            checks.append('暂停来源且保留历史')
            post('stop',{});process.wait(timeout=5)
            process=subprocess.Popen([sys.executable,'-B',str(ROOT/'app.py'),'--no-browser','--port',str(port),'--data-root',folder],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
            for _ in range(40):
                try:
                    restarted=state();break
                except Exception:time.sleep(.15)
            assert restarted['notes'][0]['body']=='编辑后仍可检索' and restarted['sources'][0]['enabled']==0
            checks.append('重启后笔记、归档、暂停状态保留')
        finally:
            process.terminate();process.wait(timeout=5)
            fixture.shutdown();fixture.server_close()
    report={'result':'PASS','checks':checks,'data_boundary':'使用独立临时目录和本地合成网站，未写入用户资料库，也不代表高校网络访问通过。'}
    print(json.dumps(report,ensure_ascii=False,indent=2))
    return report

if __name__=='__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    result=run()
    (ROOT/'research'/'HTTP链路验收.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
