"""本机浏览器窗口；仅绑定127.0.0.1，不需要账号或第三方依赖。"""
import argparse
import base64
import json
import mimetypes
import os
import re
import secrets
import threading
import time
import traceback
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
from collector import Collector
from sources.parser import canonical
from storage import ROOT,Store,now
from discovery import Discovery, TYPES, metadata
from library import institutions, queue_many, archive_bundle
from focus import enrich
from snapshot_export import SnapshotJobs, pick_directory, save_destination

TOKEN=secrets.token_urlsafe(32)
STATE={'running':False,'message':'准备就绪','started':'','finished':''}
LOCK=threading.Lock()
STORE=None
DISCOVERY=None
SNAPSHOTS=None

def update_progress(message):
    STATE['message']=message

def start_job(payload):
    with LOCK:
        if STATE['running']:
            raise ValueError('已有检查在进行，请稍后查看结果')
        STATE.update(running=True,message='开始检查',started=now(),finished='')
    def worker():
        try:
            Collector(STORE,progress=update_progress).run(source_id=payload.get('source_id'),force=bool(payload.get('force',True)),backfill=bool(payload.get('backfill')),only_resources=bool(payload.get('only_resources')))
        except Exception as exc:
            STATE['message']='未完成：'+str(exc)
        finally:
            STATE.update(running=False,finished=now())
    threading.Thread(target=worker,daemon=True).start()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):
        pass

    def allowed(self):
        return self.headers.get('Host') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}

    def send(self,data,status=200,ctype='application/json; charset=utf-8',download=None):
        if isinstance(data,(dict,list)):
            data=json.dumps(data,ensure_ascii=False).encode('utf-8')
        elif isinstance(data,str):
            data=data.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type',ctype)
        self.send_header('Content-Length',str(len(data)))
        self.send_header('X-Content-Type-Options','nosniff')
        self.send_header('Cache-Control','no-store')
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        if download:
            self.send_header('Content-Disposition',"attachment; filename*=UTF-8''"+urllib.parse.quote(download))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if not self.allowed():
            return self.send({'error':'仅允许本机访问'},403)
        request=urllib.parse.urlsplit(self.path)
        path=request.path
        params=urllib.parse.parse_qs(request.query)
        try:
            if path=='/api/state':
                data={t:STORE.query('SELECT * FROM '+t+' ORDER BY id DESC') for t in ['items','events','notes','snapshots','resources']}
                job=STATE.copy()
                if not job['running'] and STORE.query("SELECT * FROM leases WHERE name='collector' AND expires>?",(time.time(),)):
                    job.update(running=True,message='命令行或计划任务正在采集，完成后刷新来源状态。')
                data.update(sources=STORE.query('SELECT * FROM sources ORDER BY id'),settings=STORE.public_settings(),job=job,token=TOKEN,root=str(STORE.root))
                catalog=STORE.root/'sources'/'catalog.json'
                data['candidates']=json.loads(catalog.read_text('utf-8')) if catalog.exists() else []
                data['institutions']=institutions(STORE)
                return self.send(enrich(data, STORE.root))
            if path=='/api/health':
                return self.send({'app':'graduate-archive','root':str(STORE.root),'version':7})
            if path=='/api/snapshot-status':
                return self.send(SNAPSHOTS.status())
            if path=='/api/snapshot-guide':
                return self.send((ROOT/'本地胶囊与快照操作指南.md').read_text('utf-8'),ctype='text/plain; charset=utf-8')
            if path=='/api/export':
                with LOCK:
                    folder=STORE.export()
                    return self.send((folder/'完整数据.json').read_bytes(),ctype='application/json; charset=utf-8',download='研招资料.json')
            if path=='/api/notes.csv':
                with LOCK:
                    folder=STORE.export()
                    p=folder/'notes.csv'
                    return self.send(p.read_bytes() if p.exists() else b'',ctype='text/csv; charset=utf-8',download='研招笔记.csv')
            if path=='/api/filing.csv':
                from focus import export_filing
                with LOCK:
                    export_filing(STORE)
                    p=STORE.data/'exports/分类目录.csv'
                    return self.send(p.read_bytes() if p.exists() else b'',ctype='text/csv; charset=utf-8',download='研招分类目录.csv')
            if path=='/api/archive':
                sid=int(params.get('id',['0'])[0])
                rows=STORE.query('SELECT * FROM snapshots WHERE id=?',(sid,))
                if not rows:
                    return self.send({'error':'归档不存在'},404)
                field={'text':'text_path','raw':'raw_path','manifest':'manifest_path'}.get(params.get('view',['text'])[0],'text_path')
                p=(STORE.root/rows[0][field]).resolve()
                if not p.is_relative_to(STORE.data.resolve()):
                    raise ValueError('路径无效')
                return self.send(p.read_bytes(),ctype='text/plain; charset=utf-8' if field!='raw_path' else 'application/octet-stream',download=p.name if field=='raw_path' else None)
            if path=='/api/guide':
                return self.send((STORE.root/'README.md').read_bytes(),ctype='text/plain; charset=utf-8')
            if path=='/api/research':
                return self.send((STORE.root/'先看这里_首批信息与准备路线.md').read_bytes(),ctype='text/plain; charset=utf-8')
            allowed={'/':'index.html','/style.css':'style.css','/ui.js':'ui.js','/workspace.js':'workspace.js','/glass.css':'glass.css','/library.js':'library.js','/library.css':'library.css'}
            allowed.update({'/focus.js':'focus.js','/focus.css':'focus.css','/help':'help.html'})
            allowed.update({'/local-tools.js':'local-tools.js','/local-tools.css':'local-tools.css'})
            allowed.update({'/experience.js':'experience.js','/experience.css':'experience.css'})
            if path in allowed:
                p=ROOT/'static'/allowed[path]
                ctype={'.html':'text/html','.css':'text/css','.js':'text/javascript'}[p.suffix]+'; charset=utf-8'
                return self.send(p.read_bytes(),ctype=ctype)
            return self.send({'error':'未找到页面'},404)
        except Exception as exc:
            self.send({'error':str(exc)},400)

    def do_POST(self):
        if not self.allowed() or self.headers.get('X-App-Token')!=TOKEN:
            return self.send({'error':'请求无效，请刷新本机页面'},403)
        origin=self.headers.get('Origin')
        if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:
            return self.send({'error':'不接受跨站请求'},403)
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=35*1024*1024:
                raise ValueError('请求太大或为空')
            p=json.loads(self.rfile.read(size).decode('utf-8'))
            path=urllib.parse.urlsplit(self.path).path
            if path=='/api/check':
                start_job(p)
            elif path=='/api/snapshot-start':
                return self.send(SNAPSHOTS.start(p))
            elif path=='/api/snapshot-directory':
                if SNAPSHOTS.status()['running']:
                    raise ValueError('请等快照完成后更换目录')
                return self.send({'directory':save_destination(STORE,p.get('directory',''))})
            elif path=='/api/snapshot-pick-directory':
                if SNAPSHOTS.status()['running']:
                    raise ValueError('请等快照完成后更换目录')
                return self.send(pick_directory(STORE))
            elif path=='/api/archive-bundle':
                return self.send(archive_bundle(STORE,p.get('ids')),ctype='application/zip',download='研招原件与来源.zip')
            elif path=='/api/archive-many':
                return self.send(queue_many(STORE,int(p['source_id']),p.get('urls')))
            elif path=='/api/favorite':
                code=str(p.get('id',''))
                if code not in {x['id'] for x in institutions(STORE)}:
                    raise ValueError('院校目录条目不存在')
                with STORE.connect() as db:
                    row=db.execute("SELECT value FROM settings WHERE key='favorites'").fetchone()
                    favorites=set(json.loads(row[0])) if row else set()
                    favorites.add(code) if p.get('favorite') else favorites.discard(code)
                    db.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',('favorites',json.dumps(sorted(favorites))))
            elif path=='/api/discover':
                query=str(p.get('query','')).strip()
                url=canonical(query)
                if not url and re.fullmatch(r'(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d+)?(?:[/?#][^\s]*)?',query,re.I):
                    url=canonical('https://'+query)
                return self.send(DISCOVERY.preview(url,p.get('kind','list'),p.get('rule')) if url else DISCOVERY.search(query))
            elif path=='/api/sync':
                from sync_local import prepare_sync
                with LOCK:
                    if STATE['running']:
                        raise ValueError('请等待本轮检查结束后准备同步')
                    return self.send(prepare_sync(STORE))
            elif path=='/api/item-category':
                STORE.execute('UPDATE items SET category=? WHERE id=?',(str(p['category'])[:30],int(p['id'])))
            elif path=='/api/source':
                url=canonical(str(p.get('url','')))
                if not url or not str(p.get('name','')).strip():
                    raise ValueError('请填写名称和有效网址')
                if p.get('kind') not in {'list','page','file'} or p.get('parser') not in {'auto','ncu','scut','cqu','cas'}:
                    raise ValueError('来源类型或解析器无效')
                hours=int(p.get('interval_hours',24))
                pages=int(p.get('pages',2))
                if not 1<=hours<=720 or not 1<=pages<=20:
                    raise ValueError('检查间隔为1至720小时，页数为1至20页')
                old=STORE.query('SELECT * FROM sources WHERE id=?',(int(p['id']),)) if p.get('id') else []
                proof=None
                if (not old or any(old[0][k]!=p[k] for k in ['kind','parser']) or old[0]['url']!=url or p.get('preview_token')):
                    proof=DISCOVERY.confirmed(p.get('preview_token',''),url,p['kind'])
                values=dict(name=str(p['name'])[:150],url=url,kind=p['kind'],parser=p['parser'],
                    enabled=int(bool(p.get('enabled',True))),interval_hours=hours,pages=pages,note=str(p.get('note',''))[:3000])
                meta=metadata(values['name'])
                for key in ['school','source_type','category','pinned']:
                    default=old[0].get(key) if old else meta.get(key,'综合' if key=='category' else 0)
                    values[key]=p.get(key,default)
                values['school']=str(values['school']).strip()[:100]
                values['category']=str(values['category'])[:30]
                values['pinned']=int(str(values['pinned']) in {'1','True','true'})
                if not values['school'] or values['source_type'] not in TYPES:
                    raise ValueError('请填写学校并选择来源类型')
                values['rule']=json.dumps(proof['rule'],ensure_ascii=False) if proof else old[0]['rule']
                values['verified_at']=proof['verified_at'] if proof else old[0]['verified_at']
                sid=STORE.save_source(values,int(p['id']) if p.get('id') else None)
                return self.send({'ok':True,'id':sid,'config':'sources/custom.json'})
            elif path=='/api/note':
                fields=['school','year','category','title','value','body','url','deadline','verified']
                values=[str(p.get(k,''))[:15000] for k in fields]
                if not values[0].strip() or not values[3].strip():
                    raise ValueError('请填写学校和笔记标题')
                if values[6] and not canonical(values[6]):
                    raise ValueError('来源网址应以 http:// 或 https:// 开头')
                if values[7]:
                    __import__('datetime').date.fromisoformat(values[7])
                if p.get('id'):
                    STORE.execute('UPDATE notes SET '+','.join(k+'=?' for k in fields)+',updated=? WHERE id=?',tuple(values+[now(),int(p['id'])]))
                else:
                    STORE.execute('INSERT INTO notes('+','.join(fields)+',source_id,item_id,created,updated) VALUES ('+','.join('?' for _ in range(len(fields)+4))+')',tuple(values+[p.get('source_id'),p.get('item_id'),now(),now()]))
            elif path=='/api/read':
                if p.get('id'):
                    STORE.execute('UPDATE events SET unread=0 WHERE id=?',(int(p['id']),))
                else:
                    STORE.execute('UPDATE events SET unread=0')
            elif path=='/api/settings':
                y=int(p['target_year'])
                b=int(p['resource_budget'])
                proxy=str(p.get('proxy','')).strip()
                if not 2020<=y<=2050 or not 1<=b<=200:
                    raise ValueError('入学年份2020至2050，每轮归档1至200条')
                if proxy and proxy!='direct' and not canonical(proxy):
                    raise ValueError('代理地址无效')
                for k,v in {'target_year':y,'resource_budget':b,'proxy':proxy}.items():
                    STORE.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',(k,json.dumps(v)))
                if p.get('search_api_key'):
                    key=str(p['search_api_key']).strip()
                    if len(key)>500 or '\r' in key or '\n' in key:
                        raise ValueError('搜索密钥格式无效')
                    STORE.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',('search_api_key',json.dumps(key)))
                elif p.get('clear_search_key'):
                    STORE.execute("DELETE FROM settings WHERE key='search_api_key'")
            elif path=='/api/archive-url':
                sid=int(p['source_id'])
                source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))
                url=canonical(str(p['url']))
                if not source or not url:
                    raise ValueError('请先选择来源并填写有效网址')
                Collector(STORE).queue(source[0],url,str(p.get('title','手动加入归档')),p.get('kind','page'))
            elif path=='/api/import-file':
                sid=int(p['source_id'])
                source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))
                url=canonical(str(p.get('url','')))
                if not source or not url:
                    raise ValueError('需要来源学校和原始网页网址')
                body=base64.b64decode(p['base64'],validate=True)
                if len(body)>25*1024*1024:
                    raise ValueError('单个文件上限25MB')
                filename=Path(str(p.get('filename','file.bin'))).name
                ext=Path(filename).suffix.lower()
                if ext not in {'.html','.htm','.txt','.pdf','.png','.jpg','.jpeg','.doc','.docx','.xls','.xlsx','.csv','.zip','.mhtml'}:
                    raise ValueError('不支持此文件类型')
                import hashlib
                folder=STORE.data/'manual'/now()[:10]
                folder.mkdir(parents=True,exist_ok=True)
                dest=folder/(hashlib.sha256(body).hexdigest()[:16]+ext)
                dest.write_bytes(body)
                manifest=dest.with_suffix(dest.suffix+'.json')
                meta={'provenance':'用户手动导入，未由程序联网核验','source_url':url,'original_filename':filename,'saved_at':now(),'sha256':hashlib.sha256(body).hexdigest()}
                manifest.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
                text=dest.with_suffix(dest.suffix+'.txt')
                text.write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
                rel=lambda x:x.relative_to(STORE.root).as_posix()
                STORE.execute('INSERT INTO snapshots(source_id,url,created,sha256,raw_path,text_path,manifest_path,kind) VALUES (?,?,?,?,?,?,?,?)',(sid,url,now(),meta['sha256'],rel(dest),rel(text),rel(manifest),'手动导入'))
            elif path=='/api/stop':
                if STATE['running'] or SNAPSHOTS.status()['running']:
                    raise ValueError('检查或快照正在进行，请等待结束后退出')
                threading.Thread(target=self.server.shutdown,daemon=True).start()
            else:
                return self.send({'error':'不存在的操作'},404)
            self.send({'ok':True})
        except Exception as exc:
            self.send({'error':str(exc)},400)

def main():
    global STORE,DISCOVERY,SNAPSHOTS
    parser=argparse.ArgumentParser(description='研招监控助手')
    parser.add_argument('--check',action='store_true',help='检查到期来源并退出，供计划任务使用')
    parser.add_argument('--force',action='store_true')
    parser.add_argument('--no-browser',action='store_true')
    parser.add_argument('--port',type=int,default=8765)
    parser.add_argument('--data-root',type=Path,default=ROOT,help='测试时使用隔离数据目录')
    args=parser.parse_args()
    STORE=Store(args.data_root)
    from sync_local import restore_sync
    restore_sync(STORE)
    STORE.seed()
    DISCOVERY=Discovery(STORE)
    SNAPSHOTS=SnapshotJobs(STORE)
    if args.check:
        log=STORE.data/'last_check.log'
        lines=[]
        try:
            Collector(STORE,progress=lambda s:lines.append(now()+' '+s)).run(force=args.force)
        finally:
            log.write_text('\n'.join(lines),encoding='utf-8')
        return
    url=f'http://127.0.0.1:{args.port}'
    try:
        server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    except OSError:
        import urllib.request
        try:
            op=urllib.request.build_opener(urllib.request.ProxyHandler({}))
            data=json.load(op.open(url+'/api/health',timeout=2))
            if data.get('app')=='graduate-archive' and data.get('root')==str(STORE.root):
                if not args.no_browser:
                    webbrowser.open(url)
                return
        except Exception:
            pass
        raise RuntimeError(f'端口 {args.port} 被其他程序占用，请使用 python app.py --port 8766')
    if not args.no_browser:
        threading.Timer(0.5,lambda:webbrowser.open(url)).start()
    server.serve_forever(poll_interval=0.4)
    server.server_close()

if __name__=='__main__':
    main()
