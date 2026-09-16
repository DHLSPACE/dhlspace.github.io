"""GitHub Actions collector and static publisher; no credentials reach the browser."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import urllib.error
import urllib.request
from urllib.parse import urlsplit
import zipfile

from collector import Collector
from storage import Store, now

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parents[1]
BRANCH = 'sch-doc-data'


class GitHub:
    def __init__(self, repo, token):
        self.repo, self.token = repo, token
        self.base = 'https://api.github.com/repos/' + repo

    def call(self, path, payload=None, method=None):
        body = json.dumps(payload).encode() if payload is not None else None
        req = urllib.request.Request(self.base + path, data=body, method=method,
            headers={'Authorization': 'Bearer ' + self.token, 'Accept': 'application/vnd.github+json',
                     'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'sch-doc-archive', 'Content-Type': 'application/json'})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    return json.load(r)
            except urllib.error.HTTPError as exc:
                if exc.code not in {429, 502, 503, 504} or attempt == 2:
                    raise RuntimeError(f'GitHub API {path}: HTTP {exc.code}') from None
            time.sleep(2 ** (attempt + 1))

    def head(self):
        try:
            return self.call('/git/ref/heads/' + BRANCH)['object']['sha']
        except RuntimeError as exc:
            if str(exc).endswith('HTTP 404'):
                return None
            raise

    def restore(self, root, sha):
        if not sha:
            return
        # The data branch is public. Use an unauthenticated archive URL so no token follows redirects.
        url = 'https://codeload.github.com/' + self.repo + '/zip/' + sha
        with urllib.request.urlopen(url, timeout=120) as r:
            payload = r.read(512 * 1024 * 1024 + 1)
        if len(payload) > 512 * 1024 * 1024:
            raise RuntimeError('数据备份超过512MB，需要维护归档容量；没有重建空库。')
        with zipfile.ZipFile(io.BytesIO(payload)) as z:
            if sum(x.file_size for x in z.infolist()) > 1024 * 1024 * 1024:
                raise RuntimeError('解压数据超过1GB，已停止以保留原状态。')
            for entry in z.infolist():
                parts = Path(entry.filename).parts[1:]
                if not parts or parts[0] != 'data' or entry.is_dir():
                    continue
                target = root.joinpath(*parts).resolve()
                if not target.is_relative_to(root.resolve() / 'data'):
                    raise ValueError('备份路径无效')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(z.read(entry))
        if not (root / 'data' / 'records.sqlite3').exists():
            raise RuntimeError('远端备份缺少数据库；已停止，不会覆盖为新库。')

    def persist(self, root, parent):
        entries = []
        previous = {}
        if parent:
            tree = self.call('/git/trees/' + parent + '?recursive=1')
            if tree.get('truncated'):
                raise RuntimeError('备份目录超过GitHub目录接口上限，请维护存储；原分支未覆盖。')
            previous = {e['path']: e['sha'] for e in tree['tree'] if e['type'] == 'blob'}
        for p in sorted((root / 'data').rglob('*')):
            if not p.is_file() or 'exports' in p.parts or p.name.startswith('records.sqlite3-'):
                continue
            name = p.relative_to(root).as_posix()
            body = p.read_bytes()
            sha = hashlib.sha1(b'blob ' + str(len(body)).encode() + b'\0' + body).hexdigest()
            if previous.get(name) != sha:
                sha = self.call('/git/blobs', {'content': base64.b64encode(body).decode(), 'encoding': 'base64'})['sha']
            entries.append({'path': name, 'mode': '100644', 'type': 'blob', 'sha': sha})
        # Preserve any already tracked files even if a future collector omits them locally.
        names = {e['path'] for e in entries}
        entries.extend({'path': p, 'mode': '100644', 'type': 'blob', 'sha': sha} for p, sha in previous.items() if p not in names)
        tree = self.call('/git/trees', {'tree': entries})['sha']
        commit = self.call('/git/commits', {'message': 'sch-doc: archive check ' + now(), 'tree': tree, 'parents': [parent] if parent else []})['sha']
        if parent:
            self.call('/git/refs/heads/' + BRANCH, {'sha': commit, 'force': False}, 'PATCH')
        else:
            self.call('/git/refs', {'ref': 'refs/heads/' + BRANCH, 'sha': commit})
        return commit


def prepare(root):
    (root / 'sources').mkdir(parents=True, exist_ok=True)
    (root / 'research').mkdir(exist_ok=True)
    shutil.copyfile(HERE / 'sources' / 'presets.json', root / 'sources' / 'presets.json')
    shutil.copyfile(HERE / 'seed_notes.json', root / 'research' / '首批核实资料.json')
    store = Store(root)
    store.seed()
    with store.connect() as db:
        db.execute('UPDATE sources SET enabled=0')
        for config in json.loads((HERE / 'sources' / 'presets.json').read_text('utf-8')):
            fields = [k for k in config if k != 'url']
            db.execute('UPDATE sources SET ' + ','.join(k + '=?' for k in fields) + ' WHERE url=?', tuple(config[k] for k in fields) + (config['url'],))
        db.execute("UPDATE settings SET value='\"direct\"' WHERE key='proxy'")
        db.execute("UPDATE settings SET value='25' WHERE key='resource_budget'")
    collector = Collector(store)
    sources = store.query('SELECT * FROM sources WHERE enabled=1')
    for note in json.loads((HERE / 'seed_notes.json').read_text('utf-8')):
        url = note.get('url', '')
        source = next((s for s in sources if urlsplit(s['url']).hostname == urlsplit(url).hostname), None)
        if source and url and note['verified'] != '第三方线索':
            collector.queue(source, url, note['school'] + ' · ' + note['title'], 'file' if urlsplit(url).path.endswith('.pdf') else 'page')
    return store


def publish(store, output, checked_at='', state_commit=''):
    output.mkdir(parents=True, exist_ok=True)
    payload = {t: store.query('SELECT * FROM ' + t + ' ORDER BY id DESC') for t in ['items', 'events', 'snapshots', 'resources']}
    # Only the curated public research set is published. Browser notes never enter the collector.
    payload['notes'] = json.loads((HERE / 'seed_notes.json').read_text('utf-8'))
    payload['sources'] = store.query('SELECT * FROM sources ORDER BY id')
    for row in payload['sources']:
        row.pop('fingerprint', None)
    for snapshot in payload['snapshots']:
        for field in ['raw_path', 'text_path', 'manifest_path']:
            original = (store.root / snapshot[field]).resolve()
            if not original.is_relative_to(store.data.resolve()):
                raise ValueError('归档路径超出资料目录')
            relative = 'archive/' + original.relative_to(store.data).as_posix()
            # Untrusted school HTML is served as inert text, never executable on the user's domain.
            if original.suffix.lower() in {'.html', '.htm'}:
                relative += '.download.txt'
            dest = output / relative
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(original, dest)
            snapshot[field] = relative
    payload['meta'] = {'generated_at': now(), 'checked_at': checked_at, 'target_year': 2028,
        'state_commit': state_commit, 'repository': 'DHLSPACE/dhlspace.github.io', 'version': 1,
        'schedule': '每天北京时间09:23、21:23触发；仅检查到期来源，可能排队延迟',
        'scope': '官网事实、计划和录取结果分别记录。抓取失败不代表没有公告。个人笔记仅存在当前浏览器。'}
    (output / 'data.json').write_text(json.dumps(payload, ensure_ascii=False), encoding='utf-8')
    return payload


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--sync', action='store_true')
    parser.add_argument('--output', type=Path, default=REPO_ROOT / 'public' / 'sch-doc')
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix='sch-doc-cloud-') as tmp:
        root = Path(tmp)
        api = None
        parent = None
        if args.sync:
            api = GitHub(os.environ['GITHUB_REPOSITORY'], os.environ['GH_TOKEN'])
            parent = api.head()
            api.restore(root, parent)
        store = prepare(root)
        checked = ''
        if args.sync:
            Collector(store, progress=lambda msg: print(msg, flush=True)).run(force=os.environ.get('GITHUB_EVENT_NAME') == 'workflow_dispatch')
            checked = now()
            parent = api.persist(root, parent)
        payload = publish(store, args.output, checked, parent or '')
        summary = {'sources': len(payload['sources']), 'items': len(payload['items']), 'snapshots': len(payload['snapshots']),
                   'failed_sources': sum(bool(s['error']) for s in payload['sources']), 'state_commit': parent}
        print(json.dumps(summary, ensure_ascii=False))
        if os.environ.get('GITHUB_STEP_SUMMARY'):
            with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as f:
                f.write('## /sch-doc 本轮结果\n\n```json\n' + json.dumps(summary, ensure_ascii=False, indent=2) + '\n```\n\n来源失败请查看网页来源状态；工作流成功不表示每个官网都抓取成功。\n')


if __name__ == '__main__':
    main()
