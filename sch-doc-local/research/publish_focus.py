"""Build the public /sch-doc snapshot, without network access or private records."""
import hashlib
import json
import shutil
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from storage import Store, now
from focus import enrich, export_filing
from library import institutions
from sync_local import prepare_sync

ROOT=Path(__file__).resolve().parents[1]
REPO=ROOT.parent if (ROOT.parent/'.git').exists() else ROOT.parent/'github-site'
OUT=REPO/'public/sch-doc'

def build():
    # Publication reads an existing database; it must never initialize or migrate it.
    store=Store.__new__(Store)
    store.root=ROOT;store.data=ROOT/'data';store.db=store.data/'records.sqlite3'
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'.gitattributes').write_text('archive/** -text\n','utf-8')
    state={t:store.query('SELECT * FROM '+t+' ORDER BY id DESC') for t in ['sources','items','events','snapshots','resources']}
    # Only the deliberately curated public seed is published. Personal database notes never leave the machine.
    state['notes']=json.loads((ROOT/'research/首批核实资料.json').read_text('utf-8'))
    for i,n in enumerate(state['notes']):
        n.update(id=-(i+1),created=n.get('created',''),updated=n.get('updated',''))
    state.update(settings={'target_year':store.settings().get('target_year',2028),'favorites':[],'resource_budget':25,'proxy':''},institutions=institutions(store),candidates=[],root='',job={'running':False,'message':'已发布采集快照','finished':now()})
    enrich(state,ROOT)
    copied=0
    for row in state['snapshots']:
        for key in ['raw_path','text_path','manifest_path']:
            source=(ROOT/row[key]).resolve()
            if not source.is_relative_to((ROOT/'data').resolve()) or not source.is_file():
                raise ValueError('Missing or unsafe archive: '+row[key])
            if key=='raw_path' and hashlib.sha256(source.read_bytes()).hexdigest()!=row['sha256']:
                raise ValueError('Archive checksum mismatch')
            suffix=source.suffix.lower()
            # Treat archived active content as inert downloads on the public origin.
            if suffix in {'.html','.htm','.svg','.xml','.xhtml','.mhtml','.js'}:suffix+='.download.txt'
            relative=Path('archive')/str(row['id'])/(key.removesuffix('_path')+suffix)
            target=OUT/relative;target.parent.mkdir(parents=True,exist_ok=True)
            if key=='manifest_path':
                manifest=json.loads(source.read_text('utf-8'))
                # Export provenance, never local absolute filesystem paths.
                manifest={k:v for k,v in manifest.items() if 'path' not in k and 'proxy' not in k and 'token' not in k}
                target.write_text(json.dumps(manifest,ensure_ascii=False,indent=2),'utf-8')
            elif not target.exists() or target.stat().st_size!=source.stat().st_size:shutil.copy2(source,target)
            row[key]=relative.as_posix();copied+=1
    state['meta']={'version':4,'published_at':now(),'mode':'published_snapshot','scheduled_collection':False,'repository':'https://github.com/DHLSPACE/dhlspace.github.io','source_count':len(state['sources']),'snapshot_count':len(state['snapshots'])}
    (OUT/'data.json').write_text(json.dumps(state,ensure_ascii=False,separators=(',',':')),'utf-8')
    for name in ['index.html','style.css','glass.css','library.css','focus.css','ui.js','workspace.js','library.js','focus.js','help.html','public.js','public.css']:
        source=ROOT/'static'/name
        text=source.read_text('utf-8').replace('href="/help"','href="./help.html"')
        if name=='index.html':
            text=text.replace('href="/','href="./').replace('src="/','src="./')
            text=text.replace('</head>','<link rel="stylesheet" href="./public.css"><script src="./public.js" defer></script></head>')
        if name=='ui.js':text=text.replace("load();setInterval(()=>{if(!$('#editor').open)load()},5000);",'')
        if name=='help.html':
            text=text.replace('href="/"','href="./"').replace('href="/style.css"','href="./style.css"').replace('href="/focus.css"','href="./focus.css"').replace('href="/glass.css"','href="./glass.css"').replace('href="/api/guide"','href="https://github.com/DHLSPACE/dhlspace.github.io/tree/main/sch-doc-local"')
            text=text.replace('<h1>为你的每一步准备留底。</h1>','<h1>为你的每一步准备留底。</h1><p class="notice">公开站展示已发布的采集快照，不会在浏览器中抓取官网。以下采集、计划任务、原始文件备份操作适用于本机程序；公开站的个人笔记在设置中单独备份。</p>')
        (OUT/name).write_text(text,'utf-8')
    # The public index refers to published paths, not machine paths.
    (OUT/'filing.json').write_text(json.dumps([{'id':s['id'],'title':s['display_title'],**s['filing'],'url':s['url'],'raw_path':s['raw_path'],'sha256':s['sha256']} for s in state['snapshots']],ensure_ascii=False,indent=2),'utf-8')
    prepare_sync(store,REPO)
    folder=REPO/'sch-doc-local/research';folder.mkdir(exist_ok=True)
    for name in ['publish_focus.py','collect_focus.py','complete_focus_collection.py','drain_focus.py']:
        shutil.copy2(ROOT/'research'/name,folder/name)
    report={'published_at':state['meta']['published_at'],'institutions':len(state['institutions']),'sources':len(state['sources']),'successful_sources':sum(bool(s['checked']) and not s['error'] for s in state['sources']),'snapshots':len(state['snapshots']),'relevant_snapshots':sum(s['filing']['relevant'] for s in state['snapshots']),'files_copied':copied,'public_seed_notes':len(state['notes']),'personal_notes_published':False}
    (ROOT/'research/focus-public-build.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf-8')
    print(json.dumps(report,ensure_ascii=False))

if __name__=='__main__':build()
