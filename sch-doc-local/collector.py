"""检查列表、发现详情、保存附件和修订历史。每次运行有明确的抓取边界。"""
import hashlib
import importlib
import json
import re
import time
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import urlsplit
from network import Client, decode, friendly_error
from sources.parser import article, next_page, parse_list
from storage import now
from focus import relevant, classify

KEYWORDS = re.compile('推免|免试|名额|招生|录取|复试|夏令营|暑期学校|预报名|初试|化工|化学|质量报告')

def digest(value):
    return hashlib.sha256(value if isinstance(value,bytes) else value.encode('utf-8')).hexdigest()

def due(checked,hours):
    return not checked or (datetime.now().astimezone()-datetime.fromisoformat(checked)).total_seconds() >= hours*3600

def list_parser(name,html,url):
    if name in {'ncu','scut','cqu','cas'}:
        return importlib.import_module('sources.'+name).parse(html,url)
    return parse_list(html,url)

class Collector:
    def __init__(self,store,client=None,progress=None):
        self.store=store
        self.client=client or Client(proxy=store.settings().get('proxy',''))
        self.progress=progress or (lambda x:None)
        self.owner=uuid.uuid4().hex

    def acquire(self):
        with self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute("SELECT * FROM leases WHERE name='collector'").fetchone()
            if row and row['expires']>time.time():
                return False
            db.execute("INSERT OR REPLACE INTO leases VALUES ('collector',?,?)",(self.owner,time.time()+180))
            return True

    def heartbeat(self):
        self.store.execute("UPDATE leases SET expires=? WHERE name='collector' AND owner=?",(time.time()+180,self.owner))

    def archive(self,source,url,response,kind,text=''):
        sha=digest(response['body'])
        existing=self.store.query('SELECT id FROM snapshots WHERE url=? AND sha256=?',(url,sha))
        if existing:
            return existing[0]['id']
        records=self.store.query('SELECT title FROM resources WHERE source_id=? AND url=?',(source['id'],url))
        title=records[0]['title'] if records else source['name']
        filing=classify(source,title)
        if kind=='list':
            filing['year']='跨年'
        safe=lambda v: re.sub(r'[^\w\u4e00-\u9fff.-]','_',v)[:80]
        folder=self.store.data/'snapshots'/safe(filing['scope'])/safe(filing['year'])/safe(filing['school'])/safe(filing['department'])/datetime.now().strftime('%Y-%m-%d')
        folder.mkdir(parents=True,exist_ok=True)
        body=response['body']
        suffix='.html'
        if body.startswith(b'%PDF'):
            suffix='.pdf'
        elif 'html' not in response['type'].lower() and kind=='file':
            candidate=Path(urlsplit(response['url']).path).suffix.lower()
            suffix=candidate if candidate in {'.doc','.docx','.xls','.xlsx','.png','.jpg','.jpeg','.zip','.rar','.csv'} else '.bin'
        stem=datetime.now().strftime('%H%M%S_%f')+'_'+sha[:12]
        raw=folder/(stem+suffix)
        raw.write_bytes(body)
        txt=folder/(stem+'.txt')
        if text:
            txt.write_text(text,encoding='utf-8')
        else:
            txt.write_text('此文件为原始二进制附件，请打开原文件。程序未自动提取或核实人数。',encoding='utf-8')
        manifest=folder/(stem+'.json')
        rel=lambda p:p.relative_to(self.store.root).as_posix()
        metadata={'source':source['name'],'requested_url':url,'final_url':response['url'],'fetched_at':now(),'http_status':response['status'],'content_type':response['type'],'sha256':sha,'bytes':len(body),'raw_path':rel(raw),'text_path':rel(txt),'kind':kind,'provenance':'本机直接获取的公开网站原始响应'}
        manifest.write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
        return self.store.execute('INSERT INTO snapshots(source_id,url,created,sha256,raw_path,text_path,manifest_path,kind) VALUES (?,?,?,?,?,?,?,?)',(source['id'],url,now(),sha,rel(raw),rel(txt),rel(manifest),kind))

    def queue(self,source,url,title,kind='page'):
        self.store.execute('INSERT OR IGNORE INTO resources(source_id,url,title,kind) VALUES (?,?,?,?)',(source['id'],url,title,kind))

    def check_source(self,source,pages=None):
        self.progress('检查：'+source['name'])
        checked=now()
        try:
            if source['kind']!='list':
                self.queue(source,source['url'],source['name'],'file' if source['kind']=='file' else 'page')
                resource=self.store.query('SELECT * FROM resources WHERE url=?',(source['url'],))[0]
                self.check_resource(resource,source)
                resource=self.store.query('SELECT * FROM resources WHERE id=?',(resource['id'],))[0]
                if resource['error']:
                    raise RuntimeError(resource['error'])
                status='已检查并归档'
            else:
                items={}
                url=source['url']
                visited=set()
                responses=[]
                truncated=False
                for _ in range(pages or source['pages']):
                    self.heartbeat()
                    if not url or url in visited:
                        break
                    visited.add(url)
                    response=self.client.get(url)
                    html=decode(response['body'],response['type'])
                    if source.get('rule') and source['rule'] != '{}':
                        from discovery import parse_rule
                        found=parse_rule(html,response['url'],json.loads(source['rule']))
                    else:
                        found=list_parser(source['parser'],html,response['url'])
                    if not found:
                        # 失败响应也留档，但不更新成功基线，防止错误的“无更新”。
                        text,_=article(html,response['url'])
                        self.archive(source,url,response,'异常页面',text)
                        raise RuntimeError('未解析到通知条目；可能是页面改版、认证页或动态页面，请打开官网核对。成功基线未覆盖。')
                    for item in found:
                        items[item['url']]=item
                    responses.append((url,response,found,html))
                    url=next_page(html,response['url'])
                    truncated=bool(url and url not in visited)
                initial=not source['fingerprint']
                old={x['url']:x for x in self.store.query('SELECT * FROM items WHERE source_id=?',(source['id'],))}
                added,changed=0,0
                for item in items.values():
                    previous=old.get(item['url'])
                    if previous is None:
                        self.store.execute('INSERT INTO items(source_id,url,title,published,first_seen,last_seen) VALUES (?,?,?,?,?,?)',(source['id'],item['url'],item['title'],item['published'],checked,checked))
                        added+=1
                        if not initial:
                            self.store.event(source['id'],'新增条目',item['title'],item['url'],'网页发布日期：'+(item['published'] or '未标注')+'；发现时间不等于发布日期。')
                    else:
                        if previous['title']!=item['title'] or previous['published']!=item['published']:
                            changed+=1
                            self.store.event(source['id'],'条目修改',item['title'],item['url'],json.dumps({'before':{'title':previous['title'],'published':previous['published']},'after':item},ensure_ascii=False))
                        self.store.execute('UPDATE items SET title=?,published=?,last_seen=? WHERE id=?',(item['title'],item['published'],checked,previous['id']))
                    if KEYWORDS.search(item['title']) and relevant(item['title'],source):
                        kind='file' if re.search(r'\.(pdf|docx?|xlsx?)(?:\?|$)',item['url'],re.I) else 'page'
                        self.queue(source,item['url'],item['title'],kind)
                signature=digest(json.dumps(sorted(items.values(),key=lambda i:i['url']),ensure_ascii=False,sort_keys=True))
                if signature!=source['fingerprint']:
                    for page_url,response,found,html in responses:
                        text,_=article(html,response['url'])
                        self.archive(source,page_url,response,'list',text)
                    if initial:
                        self.store.event(source['id'],'首次建档',f'建立 {len(items)} 条历史基线',source['url'],'首次看见的旧通知不会标成今天发布。')
                    elif not added and not changed:
                        self.store.event(source['id'],'列表范围变化','列表条目移出当前扫描范围',source['url'],'可能为翻页或移除；此前条目和归档继续保留。')
                self.store.execute('UPDATE sources SET fingerprint=? WHERE id=?',(signature,source['id']))
                status='首次建档' if initial else ('有更新' if added or changed or signature!=source['fingerprint'] else '无更新')
                if truncated:
                    status+='（仅检查前'+str(len(visited))+'页）'
            self.store.execute('UPDATE sources SET checked=?,status=?,error=? WHERE id=?',(checked,status,'',source['id']))
        except Exception as exc:
            error=friendly_error(exc)
            if source['error']!=error:
                self.store.event(source['id'],'抓取失败',source['name'],source['url'],error)
            self.store.execute('UPDATE sources SET checked=?,status=?,error=? WHERE id=?',(checked,'抓取失败',error,source['id']))
            self.progress(source['name']+'：抓取失败')

    def check_resource(self,resource,source):
        self.heartbeat()
        self.progress('归档：'+resource['title'][:55])
        try:
            response=self.client.get(resource['url'])
            is_html='html' in response['type'].lower() or response['body'].lstrip().lower().startswith((b'<!doctype html',b'<html'))
            text,assets=article(decode(response['body'],response['type']),response['url']) if is_html else ('',[])
            if is_html and any(s in response['url'].lower() for s in ['/login','cas_login','sso.']):
                raise RuntimeError('详情跳转到登录页，请手动查看；未保存为正文成功归档')
            if is_html and (len(text)<40 or re.search('验证码|access denied|checking your browser|验证您是真人',text,re.I)):
                raise RuntimeError('正文为空或网站要求验证，请手动查看')
            if resource['kind']=='file' and is_html:
                raise RuntimeError('附件链接返回HTML而非文件，请手动核对')
            if (re.search(r'\.pdf(?:\?|$)',resource['url'],re.I) or 'application/pdf' in response['type'].lower()) and not response['body'].lstrip().startswith(b'%PDF'):
                raise RuntimeError('PDF响应缺少有效文件标记，未保存为成功附件')
            fp=digest(text+'\n'+json.dumps(assets,ensure_ascii=False)) if is_html else digest(response['body'])
            if fp!=resource['fingerprint']:
                sid=self.archive(source,resource['url'],response,'page' if is_html else 'file',text)
                if resource['fingerprint']:
                    self.store.event(source['id'],'正文或附件更新',resource['title'],resource['url'],'新旧版本均已保留，可在归档中按网址对照。')
                self.store.execute('UPDATE resources SET fingerprint=?,snapshot_id=? WHERE id=?',(fp,sid,resource['id']))
            for asset in assets:
                self.queue(source,asset['url'],resource['title']+' / '+asset['title'],'file')
            self.store.execute('UPDATE resources SET checked=?,status=?,error=? WHERE id=?',(now(),'已归档','',resource['id']))
        except Exception as exc:
            self.store.execute('UPDATE resources SET checked=?,status=?,error=? WHERE id=?',(now(),'归档失败',friendly_error(exc),resource['id']))

    def run(self,source_id=None,force=False,backfill=False,only_resources=False):
        if not self.acquire():
            raise RuntimeError('另一次检查正在进行，请稍后查看结果。')
        try:
            sources=self.store.query('SELECT * FROM sources WHERE enabled=1'+(' AND id=?' if source_id else ''),(source_id,) if source_id else ())
            for source in sources:
                self.heartbeat()
                if not only_resources and (force or due(source['checked'],source['interval_hours'])):
                    self.check_source(source,20 if backfill else None)
            by_id={s['id']:s for s in sources}
            budget=int(self.store.settings()['resource_budget'])
            processed=set()
            for _ in range(budget):
                # 新附件优先，失败项参与轮转；每个运行内每个资源最多尝试一次。
                pending=self.store.query("SELECT * FROM resources ORDER BY CASE WHEN checked='' AND kind='file' THEN 0 WHEN checked='' THEN 1 ELSE 2 END, checked, id DESC")
                r=next((x for x in pending if x['source_id'] in by_id and relevant(x['title'],by_id[x['source_id']]) and x['id'] not in processed and (not x['checked'] or due(x['checked'],by_id[x['source_id']]['interval_hours']))),None)
                if not r:
                    break
                processed.add(r['id'])
                self.check_resource(r,by_id[r['source_id']])
            self.store.export()
            self.progress('本轮完成；未完成的详情和附件保留在归档队列。')
        finally:
            self.store.execute("DELETE FROM leases WHERE name='collector' AND owner=?",(self.owner,))
