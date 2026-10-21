"""Build the public /sc snapshot from the existing, read-only scholar archives.

Python standard library only. Run from any directory; source archives are never edited.
"""
from pathlib import Path
import csv
import hashlib
import html
import io
import json
import os
import re
import shutil

PROJECT = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get('SC_ARCHIVE_ROOT', str(PROJECT.parent))).resolve()
OUT = PROJECT / 'dist' / 'sc'
DATE = '2026-10-21'
CONFIG = {
    'hongwei': {'en': 'Wei Hong', 'field': '电催化与能源转化', 'question': '从纳米结构，到反应与器件', 'tags': ['微纳催化材料', 'CO₂电还原', '水电解'], 'color': 'blue', 'initial': '洪', 'wbid': '6111'},
    'wangqun': {'en': 'Jun Wang', 'field': '多孔材料与气体分离', 'question': '在孔道尺度，理解分子识别', 'tags': ['金属有机框架', '吸附分离', '孔环境工程'], 'color': 'teal', 'initial': '珺', 'wbid': '7231'},
    'zengxiaojun': {'en': 'Xiaojun Zeng', 'field': '有机氟化学与选择性合成', 'question': '用催化与自由基，构建新的化学键', 'tags': ['氟烷基化', '自由基反应', '选择性控制'], 'color': 'violet', 'initial': '曾', 'wbid': '10261'},
}
EMAIL = re.compile(r'[\w.%+\-]+@[\w.\-]+\.[A-Za-z]{2,}')
PHONE = re.compile(r'(?i)(?:fax|tel(?:ephone)?|phone|mobile|传真|电话)\s*[.:：]?\s*\+?\d[\d\s().\-]{5,}\d')
INTERNATIONAL_PHONE = re.compile(r'(?<!\w)\+\d[\d ().\-]{7,}\d')


def sanitize(value):
    """Keep publication evidence but omit incidental contact data from public files."""
    if isinstance(value, str):
        value = EMAIL.sub('[邮箱已省略]', value)
        value = PHONE.sub('[电话或传真已省略]', value)
        return INTERNATIONAL_PHONE.sub('[电话已省略]', value)
    if isinstance(value, list):
        return [sanitize(v) for v in value]
    if isinstance(value, dict):
        return {k: sanitize(v) for k, v in value.items()}
    return value


def inline(text):
    """Escaped Markdown subset used by the archived reports; no raw HTML."""
    text = html.escape(text)
    text = re.sub(r'\[([^\]]+)\]\((https?://[^\s)]+)\)', r'<a href="\2" target="_blank" rel="noopener noreferrer">\1 ↗</a>', text)
    text = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', text)
    text = re.sub(r'`([^`]+)`', r'<code>\1</code>', text)
    return text


def markdown(text):
    """Render the paragraphs, headings, lists and tables present in our reports."""
    lines, out, idx = text.strip().splitlines(), [], 0
    while idx < len(lines):
        line = lines[idx].strip()
        if not line:
            idx += 1
            continue
        if line.startswith('|'):
            table = []
            while idx < len(lines) and lines[idx].strip().startswith('|'):
                cells = [c.strip() for c in lines[idx].strip().strip('|').split('|')]
                if not all(re.fullmatch(r'[:\- ]+', c) for c in cells):
                    table.append(cells)
                idx += 1
            out.append('<div class="table-scroll" tabindex="0" role="region" aria-label="研究资料表格"><table><thead><tr>' + ''.join('<th>' + inline(c) + '</th>' for c in table[0]) + '</tr></thead><tbody>' + ''.join('<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in row) + '</tr>' for row in table[1:]) + '</tbody></table></div>')
            continue
        if line.startswith('### '):
            out.append('<h3>' + inline(line[4:]) + '</h3>')
        elif line.startswith('- '):
            items = []
            while idx < len(lines) and lines[idx].strip().startswith('- '):
                items.append('<li>' + inline(lines[idx].strip()[2:]) + '</li>')
                idx += 1
            out.append('<ul>' + ''.join(items) + '</ul>')
            continue
        else:
            paragraph = [line]
            idx += 1
            while idx < len(lines) and lines[idx].strip() and not lines[idx].startswith(('|', '### ', '- ')):
                paragraph.append(lines[idx].strip())
                idx += 1
            out.append('<p>' + inline(' '.join(paragraph)) + '</p>')
            continue
        idx += 1
    return '\n'.join(out)


def clean(row):
    # Never publish local paths or personal annotations, including future additions.
    return {k: str(v) if k == '排序年份' else sanitize(v) for k, v in row.items() if k not in {'个人笔记', 'PDF本地路径', '阅读日期', '阅读状态', '下载状态', '补充信息状态'}}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / 'assets').mkdir(exist_ok=True)
    for name in ['index.html', 'styles.css', 'app.js', 'favicon.svg']:
        shutil.copyfile(PROJECT / 'src' / name, OUT / name)
    scholars, merged, manifest = [], {}, []
    for slug, meta in CONFIG.items():
        src = ROOT / slug / ('整理结果_' + DATE)
        raw = json.loads((src / '档案数据.json').read_text('utf-8-sig'))
        tables = raw['tables']
        report = sanitize((src / '人物研究与阅读建议.md').read_text('utf-8-sig'))
        sections = {m.group(1): m.group(2).strip() for m in re.finditer(r'^## ([^\n]+)\n(.*?)(?=^## |\Z)', report, re.M | re.S)}
        scholar = {'id': slug, **meta, **raw['summary'], 'official': 'https://chem.ncu.edu.cn/article.jsp?urltype=news.NewsContentUrl&wbnewsid=' + meta['wbid'] + '&wbtreeid=1411', 'intro': sections['先理解这个人'].split('\n\n')[0], 'sections': {k: markdown(sections[k]) for k in ['研究方向随经历的变化', '实验经历应怎样理解', '数据消歧与来源差异']}, 'bio': tables['bio'], 'people': tables['people'], 'sources': tables['sources'], 'reading': [clean(r) for r in tables['reading']], 'network': tables['network'], 'annual': tables['annual'], 'downloads': []}
        for paper in tables['papers']:
            key = paper['DOI'].lower().strip()
            if key not in merged:
                merged[key] = {'id': key, 'title': paper['英文题名'], 'zh': paper['中文题名_辅助译名'], 'date': paper['排序日期'], 'year': paper['排序年份'], 'journal': paper['期刊或来源'], 'authors': paper['全部作者_按署名顺序'], 'doi': key, 'url': paper['DOI链接'], 'members': [], 'records': {}, 'authorDetails': []}
            entry = merged[key]
            entry['members'].append(slug)
            entry['records'][slug] = clean(paper)
        # Preserve author/ORCID pairing in separate records, not an inferred combined identity.
        for author in tables['authors']:
            doi = author.get('DOI', '').lower().strip()
            if doi in merged:
                merged[doi]['authorDetails'].append({'archive': slug, **author})
        folder = OUT / 'downloads' / slug
        folder.mkdir(parents=True, exist_ok=True)
        for f in sorted(src.glob('*.csv')):
            rows = [clean(r) for r in csv.DictReader(f.open(encoding='utf-8-sig', newline=''))]
            # Keep header-only empty candidate tables valid.
            with f.open(encoding='utf-8-sig', newline='') as handle:
                fields = [k for k in csv.DictReader(handle).fieldnames if k not in {'个人笔记', 'PDF本地路径', '阅读日期', '阅读状态', '下载状态', '补充信息状态'}]
            target = folder / f.name
            with target.open('w', encoding='utf-8-sig', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows(rows)
            scholar['downloads'].append({'name': f.stem, 'href': 'downloads/' + slug + '/' + f.name, 'rows': len(rows)})
            manifest.append({'source': str(f.relative_to(ROOT)).replace('\\', '/'), 'source_sha256': hashlib.sha256(f.read_bytes()).hexdigest(), 'public': str(target.relative_to(OUT)).replace('\\', '/'), 'public_sha256': hashlib.sha256(target.read_bytes()).hexdigest(), 'rows': len(rows)})
        for source_name, public_name in [('人物研究与阅读建议.md', '人物研究与阅读建议.md'), ('阅读笔记/精读模板.md', '精读模板.md')]:
            (folder / public_name).write_text(sanitize((src / source_name).read_text('utf-8-sig')), encoding='utf-8')
        scholar['reportHref'] = 'downloads/' + slug + '/人物研究与阅读建议.md'
        scholar['templateHref'] = 'downloads/' + slug + '/精读模板.md'
        scholars.append(scholar)
    cross = list(csv.DictReader((ROOT / ('三人及邓强_共同论文线索_' + DATE + '.csv')).open(encoding='utf-8-sig')))
    (OUT / 'downloads' / '共同论文线索.csv').write_text(sanitize((ROOT / ('三人及邓强_共同论文线索_' + DATE + '.csv')).read_text('utf-8-sig')), encoding='utf-8-sig')
    data = {'version': 1, 'asOf': DATE, 'scholars': scholars, 'papers': list(merged.values()), 'cross': cross, 'counts': {'scholars': 3, 'records': sum(s['papers'] for s in scholars), 'uniquePapers': len(merged), 'firstAuthor': sum(s['first_author'] for s in scholars), 'reading': sum(len(s['reading']) for s in scholars), 'evidence': {k: sum(s['evidence'].get(k, 0) for s in scholars) for k in 'ABC'}}, 'provenance': manifest}
    data = sanitize(data)
    # Partition data scripts keep initial downloads small and each file reviewable.
    shell = {k: v for k, v in data.items() if k != 'papers'}
    (OUT / 'assets' / 'catalog.js').write_text('globalThis.SC_DATA=' + json.dumps(shell, ensure_ascii=False, separators=(',', ':')) + ';\nSC_DATA.papers=[];\n', encoding='utf-8')
    for idx in range(0, len(data['papers']), 10):
        batch = data['papers'][idx:idx+10]
        authors = {p['id']: p['authorDetails'] for p in batch}
        (OUT / 'assets' / f'authors-{idx//10:02d}.json').write_text(json.dumps(authors, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        public_batch = [{**{k: v for k, v in p.items() if k != 'authorDetails'}, 'authorChunk': f'assets/authors-{idx//10:02d}.json'} for p in batch]
        chunk = json.dumps(public_batch, ensure_ascii=False, separators=(',', ':'))
        (OUT / 'assets' / f'papers-{idx//10:02d}.js').write_text('SC_DATA.papers.push(...' + chunk + ');\n', encoding='utf-8')
    index = (OUT / 'index.html').read_text('utf-8')
    scripts = '<script defer src="./assets/catalog.js"></script>\n' + '\n'.join(f'<script defer src="./assets/papers-{idx:02d}.js"></script>' for idx in range((len(merged)+9)//10))
    (OUT / 'index.html').write_text(index.replace('<!-- DATA_SCRIPTS -->', scripts), encoding='utf-8')
    # Full public JSON remains available without depending on the UI.
    (OUT / 'downloads' / 'research-data.json').write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    (OUT / 'downloads' / 'provenance.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    (OUT / '.nojekyll').write_text('', encoding='utf-8')
    print(json.dumps({'output': str(OUT), **data['counts'], 'files': len(list(OUT.rglob('*.*')))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
