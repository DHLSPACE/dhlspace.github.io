"""SQLite 防止多进程写坏文件，CSV / JSON 导出便于直接阅读和备份。"""
import csv
import io
import json
import sqlite3
from contextlib import contextmanager
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def now():
    return datetime.now().astimezone().isoformat(timespec='seconds')

class Store:
    def __init__(self,root=ROOT):
        self.root = Path(root)
        self.data = self.root/'data'
        self.data.mkdir(parents=True,exist_ok=True)
        self.db = self.data/'records.sqlite3'
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS sources(id INTEGER PRIMARY KEY,name TEXT NOT NULL,url TEXT UNIQUE NOT NULL,kind TEXT DEFAULT 'list',parser TEXT DEFAULT 'auto',enabled INTEGER DEFAULT 1,interval_hours INTEGER DEFAULT 24,pages INTEGER DEFAULT 2,checked TEXT DEFAULT '',status TEXT DEFAULT '尚未检查',error TEXT DEFAULT '',fingerprint TEXT DEFAULT '',note TEXT DEFAULT '');
            CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,source_id INTEGER,url TEXT,title TEXT,published TEXT,first_seen TEXT,last_seen TEXT, UNIQUE(source_id,url));
            CREATE TABLE IF NOT EXISTS resources(id INTEGER PRIMARY KEY,source_id INTEGER,url TEXT UNIQUE,title TEXT,kind TEXT DEFAULT 'page',checked TEXT DEFAULT '',status TEXT DEFAULT '待归档',error TEXT DEFAULT '',fingerprint TEXT DEFAULT '',snapshot_id INTEGER);
            CREATE TABLE IF NOT EXISTS snapshots(id INTEGER PRIMARY KEY,source_id INTEGER,url TEXT,created TEXT,sha256 TEXT,raw_path TEXT,text_path TEXT,manifest_path TEXT,kind TEXT);
            CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,source_id INTEGER,created TEXT,type TEXT,title TEXT,url TEXT,detail TEXT,unread INTEGER DEFAULT 1);
            CREATE TABLE IF NOT EXISTS notes(id INTEGER PRIMARY KEY,school TEXT,year TEXT,category TEXT,title TEXT,value TEXT,body TEXT,url TEXT,deadline TEXT DEFAULT '',verified TEXT DEFAULT '待核实',source_id INTEGER,item_id INTEGER,created TEXT,updated TEXT);
            CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT);
            CREATE TABLE IF NOT EXISTS leases(name TEXT PRIMARY KEY,owner TEXT,expires REAL);
            ''')
            for k,v in {'target_year':2028,'proxy':'','resource_budget':25}.items():
                db.execute('INSERT OR IGNORE INTO settings VALUES (?,?)',(k,json.dumps(v)))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.db,timeout=30)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def query(self,sql,args=()):
        with self.connect() as db:
            return [dict(r) for r in db.execute(sql,args)]

    def execute(self,sql,args=()):
        with self.connect() as db:
            return db.execute(sql,args).lastrowid

    def settings(self):
        return {r['key']:json.loads(r['value']) for r in self.query('SELECT * FROM settings')}

    def event(self,sid,kind,title,url='',detail=''):
        return self.execute('INSERT INTO events(source_id,created,type,title,url,detail) VALUES (?,?,?,?,?,?)',(sid,now(),kind,title,url,detail))

    def seed(self):
        path=self.root/'sources'/'presets.json'
        if path.exists():
            for s in json.loads(path.read_text(encoding='utf-8')):
                keys=list(s)
                self.execute(f"INSERT OR IGNORE INTO sources({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",tuple(s.values()))
        key=self.query("SELECT value FROM settings WHERE key='seed_notes_v1'")
        notes=self.root/'research'/'首批核实资料.json'
        if not key and notes.exists():
            with self.connect() as db:
                for n in json.loads(notes.read_text(encoding='utf-8')):
                    n.update(created=now(),updated=now())
                    keys=list(n)
                    db.execute(f"INSERT INTO notes({','.join(keys)}) VALUES ({','.join('?' for _ in keys)})",tuple(n.values()))
                db.execute("INSERT INTO settings VALUES ('seed_notes_v1','true')")

    def export(self):
        folder=self.data/'exports'
        folder.mkdir(exist_ok=True)
        tables=['sources','items','resources','snapshots','events','notes','settings']
        payload={t:self.query('SELECT * FROM '+t) for t in tables}
        payload['exported_at']=now()
        dest=folder/'完整数据.json'
        temp=dest.with_suffix('.tmp')
        temp.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
        temp.replace(dest)
        for table in ['sources','items','notes','events']:
            rows=payload[table]
            if rows:
                with (folder/(table+'.csv')).open('w',encoding='utf-8-sig',newline='') as f:
                    writer=csv.DictWriter(f,fieldnames=list(rows[0]))
                    writer.writeheader()
                    # 防止表格软件将手动笔记内容作为公式执行。
                    writer.writerows({k:("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v) for k,v in r.items()} for r in rows)
        return folder
