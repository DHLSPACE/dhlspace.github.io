"""Bounded live inventory -> evidenced per-source parser -> archive. No login bypass."""
import concurrent.futures
import hashlib
import json
import re
import sqlite3
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from storage import Store, now
from network import Client, decode, friendly_error
from sources.parser import Tree, clean, canonical, article
from discovery import infer
from collector import Collector
from focus import relevant, fields

ROOT=Path(__file__).resolve().parents[1]
STORE=Store(ROOT)
OUT=ROOT/'research/focus-live';OUT.mkdir(exist_ok=True)
GUARD=threading.Lock()
REPORT=[]
ADMIT=re.compile('研究生|硕士|研考|招生信息|招生工作|招生公告|推免|夏令营|招生通知|招生简章|报考指南')
DEPT=re.compile('化学|化工|材料|生物工程|生物化学|微电子|半导体|能源|食品')

def save_json(path, data):
    body=json.dumps(data,ensure_ascii=False,indent=2)+'\n'
    temp=path.with_suffix('.tmp');temp.write_text(body,'utf-8')
    for attempt in range(6):
        try:temp.replace(path);return
        except PermissionError:
            time.sleep(.2*(attempt+1))
    path.write_text(body,'utf-8')

class CachedClient(Client):
    def __init__(self):
        super().__init__(timeout=10,proxy=STORE.settings().get('proxy',''))
        self.cache={}
    def get(self,url):
        if url not in self.cache: self.cache[url]=super().get(url)
        return self.cache[url]

def anchors(html,base):
    results={}
    for n in Tree(html).root.walk():
        if n.tag!='a':continue
        label=clean(n.text()) or n.attrs.get('title','')
        url=canonical(n.attrs.get('href',''),base)
        if not url or not 2<=len(label)<=50 or url==base:continue
        host=urlsplit(url).hostname or ''
        if not host.endswith(('.edu.cn','.ac.cn','.cas.cn','.gov.cn','.com.cn','.cn')):continue
        if ADMIT.search(label) or DEPT.search(label) and re.search('学院|学部|学系|系$|研究所',label):
            results[url]=dict(label=label,url=url,kind='院系' if DEPT.search(label) and '院' in label else '招生栏目',mode='监控',status='待核验')
    return sorted(results.values(),key=lambda x:(bool(re.search(r'20\d{2}|招聘|公示|拟录取',x['label'])),not bool(re.search('硕士|推免|研究生招生|研究生教育',x['label'])),not bool(DEPT.search(x['label']))))

def domain(url):
    host=urlsplit(url).hostname or ''
    return '.'.join(host.split('.')[-3:] if host.endswith(('.edu.cn','.gov.cn','.ac.cn','.cas.cn')) else host.split('.')[-2:]).replace('.ac.cn','.cas.cn')

def belongs(url,unit):
    return domain(url) in {domain(e['url']) for e in unit['entries'] if not e.get('found_on')}

def examine(unit):
    client=CachedClient();collector=Collector(STORE,client=client)
    report=dict(id=unit['id'],school=unit['school'],started=now(),attempts=[],sources=[],items=0,archives=0)
    entries=unit['entries']
    # Three distinct layers for universities; institutes start at their official root.
    queue=[(e,0) for e in list(entries)]
    seen=set();source_ids=[];followed=0
    while queue and len(seen)<13:
        entry,depth=queue.pop(0);url=entry['url']
        if url in seen:continue
        seen.add(url)
        attempt=dict(url=url,label=entry['label'],time=now())
        try:
            r=client.get(url);html=decode(r['body'],r['type']);text,assets=article(html,r['url'])
            if len(text)<60 or re.search('验证码|access denied|checking your browser|验证您是真人',text,re.I) or re.search(r'/login|sso\.',r['url'],re.I):
                raise ValueError('响应不是可读取的公开正文（验证/登录/空页面）')
            title=next((clean(n.text()) for n in Tree(html).root.walk() if n.tag=='title'),'')
            if re.search(r'404|页面不存在|找不到|not found|网站已关闭',title,re.I):raise ValueError('服务器返回错误页面：'+title)
            key=hashlib.sha256(url.encode()).hexdigest()[:16]
            (OUT/(key+'.html')).write_bytes(r['body'])
            attempt.update(status='可访问',http_status=r['status'],final_url=r['url'],sha256=hashlib.sha256(r['body']).hexdigest(),evidence=str((OUT/(key+'.html')).relative_to(ROOT)))
            entry.update(status='链接已核验',verified_at=now(),final_url=r['url'],note='本轮可公开访问；常设入口不代表历史公告永久保留。')
            rule,items=infer(html,r['url'])
            eligible=[i for i in items if relevant(i['title']) and re.search('硕士|研究生|招生|推免|夏令营|复试|录取|报名|推荐免试',i['title'])]
            # Never turn a general university / agency homepage into a news monitor.
            is_root=entry.get('kind')=='官网' or unit.get('policy') and depth==0 and entry.get('kind')!='招生栏目' and entry.get('mode')!='单篇归档'
            if not is_root and len(eligible)>=2 and len(source_ids)<4:
                sid=None
                existing=STORE.query('SELECT * FROM sources WHERE url=?',(url,))
                values=dict(name=unit['school']+' · '+entry['label'],school=unit['school'],url=url,kind='list',parser='auto',enabled=1,interval_hours=24,pages=2,note='实测重复结构、日期与链接后接入；只自动归档化工相关及全校通用招生通知。',source_type='监管机构' if unit.get('policy') else '研究院/研究所' if unit.get('tier')=='研究所' else '学院官网' if entry.get('kind')=='院系' or DEPT.search(entry['label']) else '学校研招网',category='综合',pinned=0,rule=json.dumps(rule,ensure_ascii=False),verified_at=now())
                with GUARD:
                    if existing:
                        sid=existing[0]['id']
                        # Preserve existing enable/pause choices. Verified rules improve parser only.
                        STORE.execute('UPDATE sources SET rule=?,verified_at=? WHERE id=?',(values['rule'],values['verified_at'],sid))
                    else:sid=STORE.save_source(values)
                source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))[0]
                if source['enabled']:
                    collector.check_source(source,pages=2)
                    source_ids.append(sid)
                entry.update(mode='监控' if source['enabled'] else '链接',source_id=sid,status='已接入' if source['enabled'] else '已暂停')
                attempt.update(source_id=sid,parsed=len(items),relevant=len(eligible))
                report['sources'].append(sid)
            elif entry.get('mode')=='单篇归档':
                existing=STORE.query('SELECT * FROM sources WHERE url=?',(url,))
                if existing:source=existing[0]
                else:
                    with GUARD:
                        sid=STORE.save_source(dict(name=unit['school']+' · '+entry['label'],school=unit['school'],url=url,kind='page',parser='auto',enabled=1,interval_hours=168,pages=1,note='历史政策原文；不代表目标年份政策',source_type='监管机构',category='综合',rule='{}',verified_at=now(),pinned=0))
                    source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))[0]
                collector.check_source(source);entry.update(source_id=source['id'],status='已归档');report['sources'].append(source['id'])
            candidates=anchors(html,r['url'])
            if depth<2 and entry.get('mode')!='单篇归档':
                for child in candidates:
                    if followed>=8:break
                    if child['url'] in seen or any(x[0]['url']==child['url'] for x in queue):continue
                    if depth==0 and entry.get('kind')=='院系':child['label']=entry['label']+' · '+child['label'];child['kind']='院系'
                    if belongs(child['url'],unit) and (child['kind']=='院系' or ADMIT.search(child['label'])):
                        # Only links actually present in this official response are followed.
                        child['found_on']=r['url'];entries.append(child);queue.append((child,depth+1));followed+=1
        except Exception as exc:
            entry.update(status='访问失败',error=friendly_error(exc),verified_at=now())
            attempt.update(status='失败',error=friendly_error(exc))
        report['attempts'].append(attempt)
    # Archive a bounded latest sample per collected source, then its attachments.
    for sid in source_ids:
        source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))[0]
        pending=STORE.query("SELECT resources.* FROM resources LEFT JOIN items ON items.source_id=resources.source_id AND items.url=resources.url WHERE resources.source_id=? AND resources.checked='' ORDER BY items.published DESC,resources.id DESC",(sid,))
        for resource in [r for r in pending if relevant(r['title'])][:3]:
            collector.check_resource(resource,source)
        attachments=STORE.query("SELECT * FROM resources WHERE source_id=? AND kind='file' AND checked='' ORDER BY id DESC",(sid,))
        for resource in [r for r in attachments if relevant(r['title'])][:3]:collector.check_resource(resource,source)
    if report['sources']:
        marks=','.join('?'*len(report['sources']))
        report['items']=STORE.query('SELECT count(*) n FROM items WHERE source_id IN ('+marks+')',report['sources'])[0]['n']
        report['archives']=STORE.query('SELECT count(*) n FROM snapshots WHERE source_id IN ('+marks+')',report['sources'])[0]['n']
    report['finished']=now();unit['entry_status']='已核验并接入招生栏目' if report['sources'] else '官网入口已核验，招生栏目待识别' if any(a['status']=='可访问' for a in report['attempts']) else '本轮访问失败，保留官网链接'
    unit['verified_at']=now()
    if unit.get('tier')!='研究所':
        found_fields=fields(' '.join(e['label'] for e in entries if e.get('status')!='访问失败'))
        if found_fields:unit['directions']=found_fields
    with GUARD:
        REPORT.append(report);save_json(ROOT/'sources/coverage.json',REPORT)
        print(json.dumps(dict(school=unit['school'],attempts=len(report['attempts']),sources=len(report['sources']),items=report['items'],archives=report['archives']),ensure_ascii=False),flush=True)
    return unit

def main():
    keeper=Collector(STORE)
    if not keeper.acquire():raise RuntimeError('已有采集任务，未并发修改资料')
    stop=threading.Event()
    def pulse():
        while not stop.wait(30):keeper.heartbeat()
    threading.Thread(target=pulse,daemon=True).start()
    backup=ROOT/'data/backups'/('pre_focus_'+time.strftime('%Y%m%d_%H%M%S')+'.sqlite3');backup.parent.mkdir(exist_ok=True)
    with sqlite3.connect(STORE.db) as src,sqlite3.connect(backup) as dst:src.backup(dst)
    try:
        units=json.loads((ROOT/'sources/institutions.json').read_text('utf-8'))
        portals=json.loads((ROOT/'sources/portals.json').read_text('utf-8'))
        policy=[]
        for n,p in enumerate(portals):
            if p['group'] in {'国家政策','地方政策'}:
                policy.append(dict(id='policy-'+str(n),school=p['label'].split(' · ')[0] if '2026' not in p['label'] else '教育部',policy=True,entries=[p]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures={pool.submit(examine,u):u for u in units+policy}
            for f in concurrent.futures.as_completed(futures):
                try:f.result()
                except Exception as exc:
                    with GUARD:REPORT.append(dict(id=futures[f]['id'],school=futures[f]['school'],error=str(exc),sources=[],attempts=[]))
                with GUARD:
                    save_json(ROOT/'sources/institutions.json',units);save_json(ROOT/'sources/portals.json',portals)
        save_json(ROOT/'sources/coverage.json',REPORT)
        STORE.export()
    finally:
        stop.set();STORE.execute("DELETE FROM leases WHERE name='collector' AND owner=?",(keeper.owner,))

if __name__=='__main__':main()
