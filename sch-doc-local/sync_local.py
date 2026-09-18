"""Prepare reviewable files in the existing Git checkout; no network/git push."""
import json
import shutil
from pathlib import Path
from storage import ROOT, Store, now

TABLES = ['sources', 'items', 'events', 'notes', 'resources', 'snapshots']


def prepare_sync(store, repository=None):
    repo = Path(repository) if repository else (store.root.parent if (store.root.parent/'.git').exists() else store.root.parent/'github-site')
    if not (repo/'.git').exists():
        raise ValueError('未找到旁边的 github-site Git 仓库；请把本地程序与仓库放在同一级目录')
    destination = repo/'sch-doc-local'
    destination.mkdir(exist_ok=True)
    files = list(store.root.glob('*.py'))+list(store.root.glob('*.pyw'))+list(store.root.glob('*.cmd'))+list(store.root.glob('*.ps1'))+list(store.root.glob('*.md'))
    files += [p for folder in ['sources','static','tests'] for p in (store.root/folder).rglob('*') if p.is_file() and p.suffix in {'.json','.py','.js','.css','.html'}]
    files += [store.root/'requirements.txt',store.root/'.gitignore']
    for source in files:
        if not source.exists():
            continue
        target = destination/source.relative_to(store.root)
        target.parent.mkdir(parents=True,exist_ok=True)
        if source.resolve() != target.resolve():
            shutil.copy2(source,target)
    # A single read transaction provides a consistent snapshot even during a scheduled collection.
    with store.connect() as db:
        db.execute('BEGIN')
        payload = {t:[dict(row) for row in db.execute('SELECT * FROM '+t+' ORDER BY id')] for t in TABLES}
    payload['exported_at']=now()
    payload['format']='sch-doc.sync.v1'
    folder=destination/'sync'
    folder.mkdir(exist_ok=True)
    temp=folder/'records.tmp'
    temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    temp.replace(folder/'records.json')
    # Curated initial notes are required for a code-only checkout too.
    seed=store.root/'research'/'首批核实资料.json'
    if seed.exists():
        target=destination/'research'/seed.name
        target.parent.mkdir(exist_ok=True)
        if seed.resolve()!=target.resolve():
            shutil.copy2(seed,target)
    return {'ok':True,'destination':str(destination),
            'message':f'已准备到 {destination}：代码、来源配置、笔记、通知和归档索引。原始附件、数据库、代理设置留在本机；尚未提交或推送 GitHub。'}


def restore_sync(store):
    """Only restore an empty database. Never merge over existing personal work."""
    path=store.root/'sync'/'records.json'
    if not path.exists() or store.query('SELECT id FROM sources LIMIT 1'):
        return False
    payload=json.loads(path.read_text('utf-8'))
    if payload.get('format')!='sch-doc.sync.v1':
        raise ValueError('同步数据格式无效')
    with store.connect() as db:
        for table in ['sources','items','events','notes']:
            allowed={r['name'] for r in db.execute('PRAGMA table_info('+table+')')}
            for raw in payload.get(table,[]):
                row={k:v for k,v in raw.items() if k in allowed}
                db.execute('INSERT INTO '+table+'('+','.join(row)+') VALUES ('+','.join('?' for _ in row)+')',tuple(row.values()))
        # Without raw files, do not pretend restored indexes are accessible archives.
        for s in payload.get('sources',[]):
            db.execute("UPDATE sources SET checked='',fingerprint='',status='同步恢复，待本机采集',error='' WHERE id=?",(s['id'],))
        db.execute("INSERT OR REPLACE INTO settings VALUES ('seed_notes_v1','true')")
    return True


if __name__=='__main__':
    store=Store(ROOT)
    print(json.dumps(prepare_sync(store),ensure_ascii=False,indent=2))
