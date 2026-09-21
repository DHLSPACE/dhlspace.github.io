"""Generate a bounded set of evidence-labelled summaries for published originals."""
import concurrent.futures
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from storage import Store,now
from focus import enrich
from providers import Providers

def main():
    s=Store();data={t:s.query('SELECT * FROM '+t+' ORDER BY id DESC') for t in ['sources','items','events','notes','snapshots','resources']};data['settings']=s.public_settings();enrich(data,s.root)
    selected=[];schools=set()
    for row in data['snapshots']:
        f=row['filing'];title=row['display_title']
        if row['kind']!='page' or not f['relevant'] or f['year']!='2027' or f['school'] in schools or not any(x in title for x in ['招生','推免','复试']):continue
        text=(s.root/row['text_path']).read_text('utf-8')
        if len(text)<150:continue
        selected.append((row,text));schools.add(f['school'])
        if len(selected)==12:break
    def summarize(pair):
        row,text=pair;cache=s.data/'ai-summaries'/f"v2-{row['id']}-{row['sha256']}.json"
        try:
            if not cache.exists():
                result=Providers(s).summarize(text,row['url']);result.update(snapshot_id=row['id'],sha256=row['sha256'],created=now())
                cache.parent.mkdir(exist_ok=True);cache.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
            return {'id':row['id'],'school':row['filing']['school'],'status':'已生成','url':row['url']}
        except Exception as exc:return {'id':row['id'],'status':'失败','error':str(exc)}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:report=list(pool.map(summarize,selected))
    (s.data/'v9-public-ai-examples.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({'requested':len(report),'generated':sum(r['status']=='已生成' for r in report)},ensure_ascii=True))

if __name__=='__main__':main()
