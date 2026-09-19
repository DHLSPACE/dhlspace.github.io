"""Manual-only, streaming ZIP exports. No network or scheduler entry point."""
import csv
import hashlib
import io
import json
import re
import subprocess
import sys
import threading
import zipfile
from datetime import datetime
from pathlib import Path
from focus import enrich

MAX_BYTES = 4 * 1024**3
PUBLICITY = re.compile(r'公示|拟录取|录取名单|复试名单|入围名单|推免名单|资格名单|推荐名单')


def safe_name(value, limit=65):
    name = re.sub(r'[\x00-\x1f<>:"/\\|?*]', '_', str(value or '')).strip(' .')[:limit] or '待核实'
    if re.match(r'^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)', name, re.I):
        name = '_' + name
    return name


def records(store):
    data = {t: store.query('SELECT * FROM '+t+' ORDER BY id DESC') for t in ['sources','items','events','notes','snapshots','resources']}
    data['settings'] = store.settings()
    return enrich(data, store.root)


def choose_records(data, payload):
    mode = payload.get('mode', 'publicity')
    if mode not in {'publicity', 'all', 'selected', 'filtered'}:
        raise ValueError('快照范围无效')
    rows = [x for x in data['snapshots'] if x['kind'] != '异常页面']
    if mode in {'selected', 'filtered'}:
        ids = payload.get('ids')
        if not isinstance(ids, list) or not ids or len(ids) > 20000:
            raise ValueError('请选择文件或调整筛选；单次最多 20000 个版本')
        ids = {int(x) for x in ids}
        if ids - {x['id'] for x in rows}:
            raise ValueError('选中文件已不可用，请刷新后重试')
        rows = [x for x in rows if x['id'] in ids]
    elif mode == 'publicity':
        rows = [x for x in rows if x['kind'] != 'list' and x['filing']['relevant'] and PUBLICITY.search(x['display_title'])]
    if payload.get('latest', True):
        seen, latest = set(), []
        for row in rows:
            key = (row['source_id'], row['url'])
            if key not in seen:
                seen.add(key)
                latest.append(row)
        rows = latest
    return rows


def destination(store):
    return Path(store.settings().get('snapshot_directory') or store.root/'snapshot').resolve()


def save_destination(store, value):
    if not value:
        path = (store.root/'snapshot').resolve()
    else:
        path = Path(str(value).strip()).expanduser()
        if not path.is_absolute():
            raise ValueError('请填写绝对目录路径，或使用“选择文件夹”')
        path = path.resolve()
    if path.exists() and not path.is_dir():
        raise ValueError('保存位置必须是文件夹')
    store.execute('INSERT OR REPLACE INTO settings VALUES (?,?)', ('snapshot_directory', json.dumps(str(path))))
    return str(path)


def pick_directory(store):
    # Tk runs in a dedicated process/main thread; never run it during page load.
    script = "import tkinter as t,json,sys;from tkinter import filedialog;r=t.Tk();r.withdraw();r.attributes('-topmost',True);p=filedialog.askdirectory(title='选择快照 ZIP 保存文件夹',initialdir=sys.argv[1]);r.destroy();print(json.dumps(p))"
    result = subprocess.run([sys.executable, '-c', script, str(destination(store))], capture_output=True, text=True, timeout=180)
    if result.returncode:
        raise ValueError('系统目录选择器不可用，请在设置中填写绝对路径')
    selected = json.loads(result.stdout)
    return {'cancelled': not bool(selected), 'directory': save_destination(store, selected) if selected else str(destination(store))}


def export_snapshot(store, payload, progress=lambda **kw: None):
    data = records(store)
    rows = choose_records(data, payload)
    if not rows:
        raise ValueError('此范围没有已保存原件。请先在“动态”保存通知，再到“资料”继续归档队列；也可手动导入。')
    target = destination(store)
    target.mkdir(parents=True, exist_ok=True)
    date = datetime.now().strftime('%Y-%m-%d')
    # Exclusive create avoids overwriting any prior export, even across processes.
    for serial in range(10000):
        path = target/(date + (f'_{serial:02}' if serial else '') + '.zip')
        try:
            stream = path.open('xb')
            break
        except FileExistsError:
            continue
    else:
        raise ValueError('当日快照数量过多，请更换目录')
    index, problems, total_bytes = [], [], 0
    try:
        with stream, zipfile.ZipFile(stream, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3, allowZip64=True) as bundle:
            for number, row in enumerate(rows, 1):
                filing = row['filing']
                title = row['display_title']
                folder = '/'.join(safe_name(filing[k], 42) for k in ['school','year','scope','department']) + '/' + safe_name(title, 48) + f"__{row['id']}/"
                entry = {k: row[k] for k in ['id','url','created','sha256','kind','display_title','filing']}
                entry['files'] = []
                entry['warnings'] = []
                used = set()
                for field, label in [('raw_path','原件'),('text_path','正文'),('manifest_path','来源')]:
                    source = (store.root/(row.get(field) or '')).resolve()
                    if not row.get(field) or not source.is_relative_to(store.data.resolve()) or not source.is_file():
                        message = label+'缺失或路径无效'
                        entry['warnings'].append(message)
                        problems.append({'id':row['id'],'title':title,'url':row['url'],'problem':message})
                        continue
                    # HTML is retained byte-for-byte as inert text, never executable in the app.
                    suffix = source.suffix.lower()
                    ext = suffix if suffix in {'.pdf','.doc','.docx','.xls','.xlsx','.csv','.txt','.json','.png','.jpg','.jpeg','.gif','.webp','.zip','.mhtml'} else suffix+'.download.txt'
                    filename = folder + label + ext
                    if filename in used:
                        filename = folder + field + ext
                    used.add(filename)
                    digest = hashlib.sha256()
                    with source.open('rb') as original, bundle.open(filename, 'w', force_zip64=True) as saved:
                        while chunk := original.read(1024*1024):
                            total_bytes += len(chunk)
                            if total_bytes > MAX_BYTES:
                                raise ValueError('快照原件超过 4 GiB，请按学校或年份分批打包')
                            digest.update(chunk)
                            saved.write(chunk)
                    checksum = digest.hexdigest()
                    entry['files'].append({'path':filename,'sha256':checksum,'role':label})
                    if field == 'raw_path' and row.get('sha256') and checksum != row['sha256']:
                        entry['warnings'].append('原件校验值与入库记录不同')
                        problems.append({'id':row['id'],'title':title,'url':row['url'],'problem':'原件 SHA256 与入库记录不符；实际校验值见索引'})
                index.append(entry)
                progress(done=number, total=len(rows), message=f'正在整理 {number}/{len(rows)} · {filing["school"]}')
            pending = [dict(id=x['id'],title=x['title'],url=x['url'],status=x['status'],error=x['error'],filing=x['filing']) for x in data['resources'] if x['status'] != '已归档' and (payload.get('mode') != 'publicity' or PUBLICITY.search(x['display_title']))]
            metadata = dict(created=datetime.now().astimezone().isoformat(),mode=payload.get('mode','publicity'),latest=payload.get('latest',True),classification='本地规则推导，未调用 AI；不代表原站确认',records=index,problems=problems,pending=pending,pending_scope='当前全库待归档资源参考；公示模式仅列标题匹配项，不表示全部属于本次选择')
            bundle.writestr('来源索引.json', json.dumps(metadata,ensure_ascii=False,indent=2))
            text = io.StringIO(newline='')
            writer = csv.writer(text)
            writer.writerow(['编号','学校','招生年份','用途','院系','标题','原网址','保存时间','导出状态'])
            for row in index:
                values = [row['id'],*[row['filing'][k] for k in ['school','year','scope','department']],row['display_title'],row['url'],row['created'],'；'.join(row['warnings']) or '文件齐全']
                writer.writerow(["'"+x if isinstance(x,str) and x.startswith(('=','+','-','@','\t','\r')) else x for x in values])
            bundle.writestr('分类目录.csv',text.getvalue().encode('utf-8-sig'))
            bundle.writestr('未完成与校验问题.json',json.dumps({'problems':problems,'pending':pending,'pending_scope':metadata['pending_scope']},ensure_ascii=False,indent=2))
            bundle.writestr('阅读说明.txt','学校 / 招生年份 / 用途 / 院系 / 标题__编号 / 原件、正文、来源。\n分类为本地规则推导；年份不明保留待核实。未调用 AI。\n仅打包已在本机保存的材料，本次没有联网抓取。公示匹配只参考标题，不保证识别所有名单或截止日期。\nHTML 原件以 .download.txt 保存，可用文本编辑器阅读；字节保持原样。\n请先检查来源索引和未完成清单；缺失或校验异常会显式标出。中科院网页也不保证永久可用。\n名单可能含个人信息，请留在本机，仅用于个人升学准备。\n此 ZIP 为资料快照，不含完整数据库、笔记及私密配置，不能用于恢复整个应用。\n')
        result = dict(path=str(path),name=path.name,count=len(index),warnings=len(problems),pending=len(pending),bytes=path.stat().st_size,created=datetime.now().astimezone().isoformat())
        store.execute('INSERT OR REPLACE INTO settings VALUES (?,?)',('snapshot_last',json.dumps(result,ensure_ascii=False)))
        return result
    except Exception:
        path.unlink(missing_ok=True)
        raise


class SnapshotJobs:
    def __init__(self, store):
        self.store, self.lock = store, threading.Lock()
        self.state = dict(running=False,done=0,total=0,message='尚未手动打包',result=None,error='')

    def status(self):
        with self.lock:
            return {**self.state,'directory':str(destination(self.store)),'last':self.store.settings().get('snapshot_last')}

    def start(self, payload):
        with self.lock:
            if self.state['running']:
                raise ValueError('已有快照正在打包，请等待完成')
            self.state.update(running=True,done=0,total=0,message='正在读取本地原件',result=None,error='')
        def update(**kw):
            with self.lock:
                self.state.update(kw)
        def worker():
            try:
                result = export_snapshot(self.store,payload,update)
                update(result=result,message='已保存；存在缺失或校验问题，请查看清单' if result['warnings'] else '快照已保存')
            except Exception as exc:
                update(error=str(exc),message='本次快照未完成')
            finally:
                update(running=False)
        threading.Thread(target=worker,daemon=True).start()
        return {'ok':True}
