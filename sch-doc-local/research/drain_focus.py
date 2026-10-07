"""Archive the discovered relevant backlog, grouped by official host with rate limits."""
import concurrent.futures
import json
import sys
import threading
from collections import defaultdict
from pathlib import Path
from urllib.parse import urlsplit
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from collector import Collector
from focus import relevant, export_filing
from network import Client
from storage import Store, ROOT, now

store=Store(ROOT);guard=threading.Lock();results=[]
def domain(url):
    host=urlsplit(url).hostname or ''
    return '.'.join(host.split('.')[-3:] if host.endswith(('.edu.cn','.cas.cn','.ac.cn','.gov.cn')) else host.split('.')[-2:])

def worker(pair):
    host,ids=pair;client=Client(timeout=12,proxy=store.settings().get('proxy',''));collector=Collector(store,client=client)
    sources={r['id']:r for r in store.query('SELECT * FROM sources WHERE enabled=1') if r['id'] in ids}
    processed=set();success=failed=0
    # Each domain processes its initial queue plus newly discovered attachments; 100 is a finite host budget.
    while len(processed)<100:
        rows=store.query("SELECT * FROM resources WHERE status!='已归档' ORDER BY CASE WHEN kind='file' THEN 0 ELSE 1 END, id DESC")
        row=next((r for r in rows if r['source_id'] in sources and r['id'] not in processed and relevant(r['title'])),None)
        if not row:break
        processed.add(row['id']);collector.check_resource(row,sources[row['source_id']])
        result=store.query('SELECT status FROM resources WHERE id=?',(row['id'],))[0]['status']
        if result=='已归档':success+=1
        else:failed+=1
        # Avoid hammering an unavailable host. Preserve every failure and unprocessed item.
        if failed>=4 and success==0:break
    with guard:
        results.append(dict(host=host,attempted=len(processed),success=success,failed=failed,finished=now()))
        (ROOT/'research/focus-backlog-report.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),'utf-8')
        print(json.dumps(results[-1],ensure_ascii=False),flush=True)

def main():
    keeper=Collector(store)
    if not keeper.acquire():raise RuntimeError('已有采集任务')
    stop=threading.Event()
    def pulse():
        while not stop.wait(30):keeper.heartbeat()
    threading.Thread(target=pulse,daemon=True).start()
    try:
        groups=defaultdict(set)
        for source in store.query('SELECT * FROM sources WHERE enabled=1'):
            groups[domain(source['url'])].add(source['id'])
        with concurrent.futures.ThreadPoolExecutor(max_workers=7) as pool:
            list(pool.map(worker,groups.items()))
        store.export()
    finally:
        stop.set();store.execute("DELETE FROM leases WHERE name='collector' AND owner=?",(keeper.owner,))

if __name__=='__main__':main()
