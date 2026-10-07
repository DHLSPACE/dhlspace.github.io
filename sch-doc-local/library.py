"""Local directory preferences and bounded, provenance-preserving file export."""
import io
import json
import re
import zipfile
from pathlib import Path
from sources.parser import canonical
from focus import classify

def institutions(store):
    path = store.root/'sources/institutions.json'
    return json.loads(path.read_text('utf-8')) if path.exists() else []

def queue_many(store, source_id, lines):
    if not store.query('SELECT id FROM sources WHERE id=?', (source_id,)):
        raise ValueError('请选择有效的归属来源')
    if not isinstance(lines, list) or not 1 <= len(lines) <= 30:
        raise ValueError('每批支持 1 至 30 个网址')
    urls = [canonical(str(line).strip()) for line in lines]
    if not all(urls):
        raise ValueError('包含无效网址，本批未加入；请每行填写一个完整 HTTP/HTTPS 网址')
    added = 0
    with store.connect() as db:
        for url in dict.fromkeys(urls):
            kind = 'file' if re.search(r'\.(pdf|docx?|xlsx?|png|jpe?g|zip)(?:$|\?)',url,re.I) else 'page'
            added += db.execute('INSERT OR IGNORE INTO resources(source_id,url,title,kind) VALUES (?,?,?,?)',
                (source_id,url,'批量加入 · '+url.rsplit('/',1)[-1][:120],kind)).rowcount
    return dict(ok=True, added=added, duplicates=len(lines)-added)

def archive_bundle(store, ids):
    if not isinstance(ids,list) or not 1 <= len(ids) <= 200:
        raise ValueError('每次选择 1 至 200 个版本打包')
    ids = list(dict.fromkeys(int(x) for x in ids))
    records = store.query('SELECT snapshots.*,sources.school,sources.name AS source_name FROM snapshots LEFT JOIN sources ON sources.id=snapshots.source_id WHERE snapshots.id IN ('+','.join('?' for _ in ids)+')',ids)
    if len(records) != len(ids):
        raise ValueError('部分归档不存在，请刷新后重试')
    files, size, index = [], 0, []
    safe = lambda value: re.sub(r'[\x00-\x1f<>:"/\\|?*]', '_', str(value)).strip(' .')[:90] or '未分类'
    for row in records:
        titles=store.query('SELECT title FROM resources WHERE source_id=? AND url=?',(row['source_id'],row['url']))
        filing=classify({'school':row['school'],'name':row['source_name']},titles[0]['title'] if titles else '')
        if row['kind']=='list': filing['year']='跨年'
        folder='/'.join(safe(filing[k]) for k in ['scope','year','school','department'])+'/'+str(row['id'])+'/'
        entry = {k:row[k] for k in ['id','school','url','created','sha256','kind']}
        entry['files'] = []
        entry['filing'] = filing
        for field in ['raw_path','text_path','manifest_path']:
            path = (store.root/(row[field] or '')).resolve()
            if not path.is_relative_to(store.data.resolve()) or not path.is_file():
                raise ValueError('部分归档文件缺失或路径无效，请恢复原件后重试')
            size += path.stat().st_size
            if size > 250*1024*1024:
                raise ValueError('本批原件超过 250MB，请减少选择后重试')
            name = folder+field+'_'+safe(path.name)
            files.append((path,name))
            entry['files'].append(name)
        index.append(entry)
    output = io.BytesIO()
    with zipfile.ZipFile(output,'w',zipfile.ZIP_STORED) as bundle:
        for path,name in files:
            bundle.write(path,name)
        bundle.writestr('来源索引.json',json.dumps(index,ensure_ascii=False,indent=2))
    return output.getvalue()
