"""Live Brave discovery, official-host validation and bounded original archiving."""
import concurrent.futures
import hashlib
import json
import re
import sys
import threading
import time
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from storage import Store, now
from providers import Providers
from network import Client, decode
from sources.parser import Tree, clean, canonical, article
from discovery import infer
from collector import Collector
from focus import relevant

ROOT=Path(__file__).resolve().parents[1]
STORE=Store(ROOT)
OUT=STORE.data/'expansion-20260921'
OUT.mkdir(exist_ok=True)
LOCK=threading.Lock()
SEARCH_LOCK=threading.Lock()
LAST_SEARCH=0
REPORT=[]
CHEM=re.compile('化学|化工|化学工程')
RELATED=re.compile('材料|能源|环境|生物工程|生物化学|高分子|催化|分离')
ADMIT=re.compile('硕士|研究生|招生|推免|夏令营|复试|录取|参考书|考试大纲')

def write(path, obj):
    temp=path.with_suffix('.tmp')
    temp.write_text(json.dumps(obj,ensure_ascii=False,indent=2),encoding='utf-8')
    temp.replace(path)

def domain(url):
    host=urlsplit(url).hostname or ''
    return '.'.join(host.split('.')[-3:]) if host.endswith(('.edu.cn','.ac.cn','.cas.cn')) else host

def group(label,url=''):
    if re.search(r'20\d{2}|\.pdf|\.doc|\.xls',label+' '+url): return '通知与附件直链'
    if CHEM.search(label):return '化学与化工院系'
    if RELATED.search(label):return '相关院系与研究方向'
    if re.search('研究生|研招|招生|教育处',label):return '研究生院与招生'
    return '学校与研究所官网'

def search(query):
    global LAST_SEARCH
    with SEARCH_LOCK:
        time.sleep(max(0,1.15-(time.monotonic()-LAST_SEARCH)))
        LAST_SEARCH=time.monotonic()
        return Providers(STORE).search(query,10)

def examine(unit):
    report={'id':unit['id'],'school':unit['school'],'started':now(),'searches':[],'attempts':[],'added_entries':0}
    domains={domain(e['url']) for e in unit['entries']}|{domain(unit['url'])}
    domains.discard('')
    suffix=' ('+' OR '.join('site:'+d for d in sorted(domains))+')'
    topics=['研究生院 招生 硕士 2026 2027','化学 化工 学院 研究生 招生','材料 能源 环境 学院 研究生 招生'] if unit['tier']!='研究所' else ['研究生教育 硕士 招生 2026 2027','化学 催化 材料 研究方向 招生']
    known={e['url']:e for e in unit['entries']}
    queue=[]
    for topic in topics:
        query=unit['school']+' '+topic+suffix
        try:
            rows=search(query)
            report['searches'].append({'query':query,'results':rows})
            for row in rows:
                url=canonical(row['url']);label=clean(row['title'])
                if not url or domain(url) not in domains or not label:continue
                if url not in known:
                    entry={'label':label[:160],'url':url,'kind':'招生栏目' if ADMIT.search(label) else '院系','mode':'链接','status':'搜索发现，待核验','via':'Brave Search API','found_on':query,'group':group(label,url)}
                    known[url]=entry;unit['entries'].append(entry);report['added_entries']+=1
                if url not in queue:queue.append(url)
        except Exception as exc:report['searches'].append({'query':query,'error':str(exc)})
    client=Client(timeout=9,proxy=STORE.settings().get('proxy',''))
    collector=Collector(STORE,client=client)
    # Existing roots are part of the category audit, even when search returns no new URL.
    queue=queue[:14]
    for entry in unit['entries']:
        entry.setdefault('group',group(entry['label'],entry['url']))
    for url in queue:
        entry=known[url];attempt={'url':url,'time':now()}
        try:
            response=client.get(url)
            if domain(response['url']) not in domains:raise ValueError('跳转到非本单位域名，需人工核验')
            is_html='html' in response['type'].lower()
            html=decode(response['body'],response['type']) if is_html else ''
            text,assets=article(html,response['url']) if is_html else ('',[])
            title=next((clean(n.text()) for n in Tree(html).root.walk() if n.tag=='title'),'') if html else entry['label']
            if is_html and (len(text)<80 or re.search('404|页面不存在|not found|验证码|access denied|checking your browser',title,re.I)):
                raise ValueError('响应为错误页、验证页或无可读正文')
            if not is_html and not response['body'].startswith((b'%PDF',b'PK',b'\xd0\xcf\x11\xe0')):
                raise ValueError('非可识别的网页或文档原件')
            entry.update(status='链接已核验',verified_at=now(),final_url=response['url']);entry.pop('error',None)
            attempt.update(status='可访问',http_status=response['status'],sha256=hashlib.sha256(response['body']).hexdigest())
            proof=OUT/(hashlib.sha256(url.encode()).hexdigest()+('.html' if is_html else '.bin'))
            proof.write_bytes(response['body']);attempt['evidence']=str(proof.relative_to(ROOT))
            rule,items=infer(html,response['url']) if is_html else ({},[])
            eligible=[i for i in items if relevant(i['title'])]
            existing=STORE.query('SELECT * FROM sources WHERE url=?',(url,))
            detail=bool(relevant(entry['label']) and ADMIT.search(entry['label']) and (re.search(r'20\d{2}',entry['label']) or not is_html))
            kind='list' if len(eligible)>=2 else 'page' if detail and is_html else 'file' if detail else None
            if not kind:continue
            with LOCK:
                if existing:sid=existing[0]['id']
                else:
                    sid=STORE.save_source({'name':unit['school']+' · '+entry['label'][:100],'school':unit['school'],'url':url,'kind':kind,'parser':'auto','enabled':1,'interval_hours':24 if kind=='list' else 168,'pages':2 if kind=='list' else 1,'source_type':'研究院/研究所' if unit['tier']=='研究所' else '学院官网' if CHEM.search(entry['label']) or RELATED.search(entry['label']) else '学校研招网','category':'综合','pinned':0,'rule':json.dumps(rule,ensure_ascii=False),'verified_at':now(),'note':'2026-09-21 Brave发现，原站实测核验；搜索摘要不是原文。'})
            source=STORE.query('SELECT * FROM sources WHERE id=?',(sid,))[0]
            entry.update(source_id=sid,mode='监控' if kind=='list' else '单篇归档',status='已接入' if source['enabled'] else '已暂停')
            if not source['enabled']:continue
            collector.check_source(source,pages=2)
            pending=STORE.query("SELECT * FROM resources WHERE source_id=? AND checked='' ORDER BY id DESC",(sid,))
            for resource in [r for r in pending if relevant(r['title'])][:3]:collector.check_resource(resource,source)
            attachments=STORE.query("SELECT * FROM resources WHERE source_id=? AND kind='file' AND checked='' ORDER BY id DESC",(sid,))
            for resource in attachments[:2]:collector.check_resource(resource,source)
            attempt['source_id']=sid
        except Exception as exc:
            entry.update(status='本轮访问失败',error=str(exc)[:400],verified_at=now());attempt.update(status='失败',error=str(exc)[:400])
        finally:report['attempts'].append(attempt)
    groups=['学校与研究所官网','研究生院与招生','化学与化工院系','相关院系与研究方向','通知与附件直链']
    unit['category_coverage']=[{'label':g,'count':sum(e.get('group')==g for e in unit['entries']),'status':'已有入口，见逐项核验状态' if any(e.get('group')==g for e in unit['entries']) else '研究所按研究方向归类，不套用学院' if unit['tier']=='研究所' and g=='化学与化工院系' else '本轮未找到可确认入口'} for g in groups]
    report['finished']=now()
    with LOCK:
        REPORT.append(report);write(OUT/'report.json',REPORT)
        print(json.dumps({'school':unit['school'],'new_entries':report['added_entries'],'verified':sum(a['status']=='可访问' for a in report['attempts'])},ensure_ascii=True),flush=True)
    return unit

def main():
    keeper=Collector(STORE)
    if not keeper.acquire():raise RuntimeError('已有采集正在进行')
    stop=threading.Event()
    def pulse():
        while not stop.wait(30):keeper.heartbeat()
    threading.Thread(target=pulse,daemon=True).start()
    path=ROOT/'sources/institutions.json'
    units=json.loads(path.read_text('utf-8'))
    backup=OUT/'institutions-before.json'
    if not backup.exists():write(backup,units)
    try:
        for tier in [('985','相关高校'),('研究所',)]:
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                jobs=[pool.submit(examine,u) for u in units if u['tier'] in tier or (tier[0]=='985' and u['tier'] not in {'985','研究所'})]
                for job in concurrent.futures.as_completed(jobs):
                    job.result()
            write(path,units)
        STORE.export()
    finally:
        stop.set();STORE.execute("DELETE FROM leases WHERE name='collector' AND owner=?",(keeper.owner,))

if __name__=='__main__':main()
