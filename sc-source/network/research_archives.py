"""Publish source-bounded research records, excluding private annotations by construction."""
import csv
import html
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PAPER_FIELDS = 'paper_id title doi journal published_date date_precision year author_position evidence_grade attribution_note metadata_status fulltext_status'.split()

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def pick(value, fields):
    return {key: value[key] for key in fields if key in value}

def urls(values):
    return [v for v in values if isinstance(v, str) and v.startswith(('https://', 'http://'))]

def public_archive(archive):
    out = pick(archive, ['scope_note', 'report_url'])
    out['downloads'] = pick(archive.get('downloads', {}), ['papers_csv', 'first_author_csv', 'bibtex'])
    out['papers'] = []
    for paper in archive.get('papers', []):
        p = pick(paper, PAPER_FIELDS)
        p['authors'] = [a for a in paper.get('authors', []) if isinstance(a, str)]
        p['source_urls'] = urls(paper.get('source_urls', []))
        out['papers'].append(p)
    out['timeline'] = []
    for event in archive.get('timeline', []):
        row = pick(event, ['start', 'end', 'title', 'detail'])
        row['source_urls'] = urls(event.get('source_urls', []))
        out['timeline'].append(row)
    out['reading_queue'] = [pick(r, ['paper_id', 'reason', 'order']) for r in archive.get('reading_queue', [])]
    summary = archive.get('summary', {})
    out['summary'] = pick(summary, ['overview', 'reading_strategy'])
    out['summary']['open_questions'] = [x for x in summary.get('open_questions', []) if isinstance(x, str)]
    out['summary']['phases'] = [{**pick(x, ['period', 'summary']), 'source_urls': urls(x.get('source_urls', []))} for x in summary.get('phases', [])]
    return out

def load_archive(person):
    folder = ROOT / 'people' / person['person_id']
    paper_file = folder / 'papers.json'
    if not paper_file.is_file():
        return None
    records = read(paper_file)
    if not records.get('papers') or person.get('legacy_archive'):
        return None
    timeline = read(folder / 'timeline.json') if (folder / 'timeline.json').exists() else {}
    queue = read(folder / 'reading-queue.json') if (folder / 'reading-queue.json').exists() else {}
    summary = read(folder / 'research-summary.json') if (folder / 'research-summary.json').exists() else {}
    sid = person['person_id']
    return public_archive({
        'scope_note': records.get('scope_note', '官网成果列表与可核验公开来源形成的论文清单，未宣称完整全集；未完成全文与SI精读。'),
        'papers': records['papers'], 'timeline': timeline.get('events', []),
        'reading_queue': queue.get('items', []), 'summary': summary,
        'report_url': f'research/{sid}.html',
        'downloads': {'papers_csv': f'downloads/physics/{sid}-papers.csv', 'first_author_csv': f'downloads/physics/{sid}-first-author.csv', 'bibtex': f'downloads/physics/{sid}.bib'},
    })

def csv_text(rows, fields):
    import io
    out = io.StringIO(newline='')
    w = csv.DictWriter(out, fieldnames=fields, extrasaction='ignore')
    w.writeheader()
    for row in rows:
        values = {k: '; '.join(row[k]) if isinstance(row.get(k), list) else row.get(k) for k in fields}
        # Keep spreadsheet import from interpreting source strings as formulas.
        w.writerow({k: "'" + v if isinstance(v, str) and v.startswith(('=', '+', '-', '@')) else v for k, v in values.items()})
    return '\ufeff' + out.getvalue()

def bibtex(papers):
    def clean(value):
        return str(value or '').replace('\\', '\\textbackslash{}').replace('{', '\\{').replace('}', '\\}').replace('\n', ' ')
    blocks = []
    for p in papers:
        fields = {'title': p['title'], 'author': ' and '.join(p.get('authors', [])), 'journal': p.get('journal'), 'year': str(p.get('published_date') or p.get('year') or '')[:4], 'doi': p.get('doi'), 'url': 'https://doi.org/' + p['doi'] if p.get('doi') else next(iter(p.get('source_urls', [])), ''), 'note': 'Source-bounded bibliography; author attribution and metadata verification recorded separately.'}
        blocks.append('@article{' + p['paper_id'] + ',\n' + ',\n'.join('  ' + k + ' = {' + clean(v) + '}' for k, v in fields.items() if v) + '\n}')
    return '\n\n'.join(blocks) + '\n'

def render_report(person, archive):
    e = lambda v: html.escape(str(v or ''))
    links = lambda values: ' · '.join(f'<a href="{e(u)}">来源 {i + 1}</a>' for i, u in enumerate(urls(values)))
    summary = archive['summary']
    papers = {p['paper_id']: p for p in archive['papers']}
    parts = [f'<h1>{e(person["name_zh"])}：物理与应用物理研究档案</h1>', f'<p>{e(person["institution"])} · 核验日期 2026-10-23 · <a href="{e(person["official_url"])}">官方主页</a></p>', f'<p class="scope">{e(archive["scope_note"])}</p>', f'<p>{e(summary.get("overview") or person["selection_reason"])}</p>', '<h2>研究问题与证据</h2>']
    for d in person['directions']:
        parts += [f'<h3>{e(d["title"])}</h3><p>研究对象：{e("；".join(d["objects"]))}</p><p>阅读问题：{e(d["reading_question"])}</p>', '<p>' + links(['https://doi.org/' + doi for doi in d['anchor_dois']]) + '</p>']
    if summary['phases']:
        parts.append('<h2>研究阶段与阅读线索</h2><p>以下阶段按公开履历和所列论文整理，不把缺失年份解释为没有研究。</p>')
        parts += [f'<h3>{e(x.get("period"))}</h3><p>{e(x.get("summary"))}</p><p>{links(x.get("source_urls", []))}</p>' for x in summary['phases']]
    parts.append('<h2>学术时间线</h2>')
    parts += [f'<p><strong>{e(x.get("start"))}—{e(x.get("end"))} {e(x.get("title"))}</strong><br>{e(x.get("detail"))}<br>{links(x.get("source_urls", []))}</p>' for x in archive['timeline']]
    parts += ['<h2>建议阅读顺序</h2>', f'<p>{e(summary.get("reading_strategy"))}</p>', '<p>下列次序为阅读建议；未标记为已经读过全文。</p><ol>']
    for r in archive['reading_queue']:
        p = papers[r['paper_id']]
        href = 'https://doi.org/' + p['doi'] if p.get('doi') else next(iter(p.get('source_urls', [])), '')
        parts += [f'<li><a href="{e(href)}">{e(p["title"])}</a> ({e(p.get("published_date") or p.get("year"))})<p>{e(r["reason"])}</p></li>']
    parts.append('</ol><h2>待解决的问题</h2><ul>')
    parts += [f'<li>{e(x)}</li>' for x in summary['open_questions']]
    parts.append('</ul><h2>论文清单</h2><p>第一署名按作者位置 1 统计。共同一作、通讯作者和个人贡献需另核正文声明。A/B 表示归属证据状态，不评价学术质量。</p><div class="scroll"><table><thead><tr><th>发表日期</th><th>论文 / 期刊</th><th>作者位置 / 归属</th><th>证据</th></tr></thead><tbody>')
    for p in archive['papers']:
        doi = f'<a href="https://doi.org/{e(p["doi"])}">{e(p["doi"])}</a>' if p.get('doi') else 'DOI 未核定'
        parts.append(f'<tr><td>{e(p.get("published_date") or p.get("year"))}<br>{e(p.get("date_precision"))}</td><td>{e(p["title"])}<br>{e(p.get("journal"))}<br>{doi}<details><summary>作者</summary>{e("; ".join(p.get("authors", [])))}</details></td><td>{e(p.get("author_position") or "待核")} / {e(p.get("evidence_grade"))}<br>{e(p.get("attribution_note"))}</td><td>{links(p.get("source_urls", []))}<br>{e(p.get("metadata_status"))}</td></tr>')
    parts.append('</tbody></table></div>')
    return '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + e(person['name_zh']) + '研究档案</title><style>body{font:16px/1.75 system-ui,"Microsoft YaHei",sans-serif;margin:0;color:#172f37;background:#f3f5f1}main{max-width:1050px;margin:auto;padding:30px 22px}a{color:#176e62;overflow-wrap:anywhere}h1{font-size:30px}h2{margin-top:36px}.scope{background:#f6f0e3;padding:16px;border-left:3px solid #8c6521}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;font-size:13px;background:white}th,td{padding:12px;border:1px solid #d4dfda;text-align:left;vertical-align:top}td:nth-child(2){min-width:280px}details{margin-top:8px}@media print{main{max-width:none}.scroll{overflow:visible}tr{break-inside:avoid}}</style><main><a href="../index.html#person=' + e(person['person_id']) + '">返回人物档案</a>' + ''.join(parts) + '</main></html>\n'

def build_archives(people):
    all_rows = []
    fields = ['person_id', 'name_zh'] + PAPER_FIELDS + ['authors', 'source_urls']
    for person in people:
        archive = load_archive(person)
        if not archive:
            continue
        person['research_archive'] = archive
        person['publication_coverage'] = {**person['publication_coverage'], 'status':'source_bounded_representative_list', 'count':len(archive['papers']), 'first_author_count':sum(p.get('author_position') == 1 for p in archive['papers']), 'snapshot_date':'2026-10-23', 'complete':False}
        rows = [{'person_id': person['person_id'], 'name_zh': person['name_zh'], **p} for p in archive['papers']]
        all_rows += rows
        generated = {
            archive['report_url']: render_report(person, archive),
            archive['downloads']['papers_csv']: csv_text(rows, fields),
            archive['downloads']['first_author_csv']: csv_text([p for p in rows if p.get('author_position') == 1], fields),
            archive['downloads']['bibtex']: bibtex(archive['papers']),
        }
        for relative, value in generated.items():
            for base in [ROOT, ROOT / 'site']:
                target = base / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(value, encoding='utf-8')
    for base in [ROOT / 'exports', ROOT / 'site/downloads', ROOT / 'downloads']:
        base.mkdir(parents=True, exist_ok=True)
        (base / 'physics-papers.csv').write_text(csv_text(all_rows, fields), encoding='utf-8')
        (base / 'physics-first-author.csv').write_text(csv_text([p for p in all_rows if p.get('author_position') == 1], fields), encoding='utf-8')
    return all_rows
