"""Check snapshot coverage, evidence, public fields, local URLs and source hashes."""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import unquote, urlsplit
import csv
import hashlib
import json
import os
import re

PROJECT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get('SC_ARCHIVE_ROOT', str(PROJECT.parent))).resolve()
OUT = PROJECT / 'dist/sc'
data = json.loads((OUT / 'downloads/research-data.json').read_text('utf-8'))
assert data['counts'] == {'scholars': 3, 'records': 293, 'uniquePapers': 287, 'firstAuthor': 50, 'reading': 15, 'evidence': {'A': 52, 'B': 127, 'C': 114}}
assert len({p['doi'] for p in data['papers']}) == len(data['papers']) == 287
assert sum(len(p['members']) for p in data['papers']) == 293
private = {'个人笔记', 'PDF本地路径', '阅读日期', '阅读状态', '下载状态', '补充信息状态'}
for paper in data['papers']:
    assert paper['id'] == paper['doi'] == paper['doi'].lower()
    assert paper['url'].startswith('https://doi.org/')
    assert set(paper['members']) == set(paper['records'])
    assert paper['authorDetails'], paper['doi']
    for row in paper['records'].values():
        assert not private.intersection(row)
        assert re.fullmatch(r'\d{4}(-\d{2})?(-\d{2})?', row['排序日期'])
        assert row['归属证据'][0] in 'ABC'
for scholar in data['scholars']:
    original = json.loads((ROOT / scholar['id'] / '整理结果_2026-10-21/档案数据.json').read_text('utf-8-sig'))
    public = [p for p in data['papers'] if scholar['id'] in p['members']]
    assert len(public) == scholar['papers'] == len(original['tables']['papers'])
    assert {p['doi'] for p in public} == {p['DOI'].lower() for p in original['tables']['papers']}
    assert len(scholar['bio']) == len(original['tables']['bio'])
    assert len(scholar['downloads']) == 12
    assert len(scholar['reading']) == 5
    assert all(r['DOI'].lower() in {p['doi'] for p in public} for r in scholar['reading'])
    for file in scholar['downloads']:
        rows = list(csv.DictReader((OUT / file['href']).open(encoding='utf-8-sig')))
        assert len(rows) == file['rows']
        assert all(not private.intersection(r) for r in rows)
for item in data['provenance']:
    assert hashlib.sha256((ROOT / item['source']).read_bytes()).hexdigest() == item['source_sha256'], item['source']
    assert hashlib.sha256((OUT / item['public']).read_bytes()).hexdigest() == item['public_sha256'], item['public']

class Links(HTMLParser):
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        for attr in ['href', 'src']:
            url = attrs.get(attr, '')
            if not url or url.startswith(('#', 'http:', 'https:', 'mailto:', 'data:')):
                continue
            target = OUT / unquote(urlsplit(url).path)
            assert target.is_file(), (tag, url)

index = (OUT / 'index.html').read_text('utf-8')
Links().feed(index)
assert '<!-- DATA_SCRIPTS -->' not in index
assert '<meta name="viewport"' in index and 'lang="zh-CN"' in index
author_count = 0
for file in (OUT / 'assets').glob('authors-*.json'):
    for doi, rows in json.loads(file.read_text('utf-8')).items():
        assert doi in {p['doi'] for p in data['papers']}
        author_count += len(rows)
assert author_count == 2209
contact = re.compile(r'[\w.%+\-]+@[\w.\-]+\.[A-Za-z]{2,}|(?:fax|tel(?:ephone)?|phone|mobile|传真|电话)\s*[.:：]?\s*\+?\d[\d\s().\-]{5,}\d', re.I)
for file in OUT.rglob('*'):
    if file.is_file():
        assert not contact.search(file.read_text('utf-8-sig')), 'Contact data in ' + str(file)
report = {'result': 'passed', 'snapshot': data['asOf'], 'counts': data['counts'], 'source_hashes_verified': len(data['provenance']), 'csv_downloads_verified': 36, 'author_records': author_count, 'contact_data_scan': 'passed: no email, labelled phone or fax', 'local_resources': 'all present', 'browser_verification': 'not performed: no approved host browser capability was exposed'}
(PROJECT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(report, ensure_ascii=False))
