"""Adapt the existing 2026-10-20 Deng Qiang archive without changing its files."""
from collections import Counter, defaultdict
from html.parser import HTMLParser
from pathlib import Path
import csv
import hashlib
import html
import json
import re

SOURCE_DATE = '2026-10-20'
OFFICIAL = 'https://chem.ncu.edu.cn/article.jsp?urltype=news.NewsContentUrl&wbnewsid=11021&wbtreeid=1411'


class PublicHTML(HTMLParser):
    allowed = {'p', 'strong', 'a', 'h2', 'h3', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'ul', 'li', 'br'}

    def __init__(self):
        super().__init__()
        self.parts = []
        self.links = []
        self.anchors = []

    def handle_starttag(self, tag, attrs):
        if tag not in self.allowed:
            return
        if tag == 'a':
            url = dict(attrs).get('href', '')
            valid = bool(re.match(r'https?://', url))
            self.anchors.append(valid)
            if valid:
                self.links.append(url)
                self.parts.append('<a href="' + html.escape(url, quote=True) + '" target="_blank" rel="noopener noreferrer">')
        elif tag == 'table':
            self.parts.append('<div class="table-scroll" tabindex="0" role="region" aria-label="邓强研究资料表格"><table>')
        else:
            self.parts.append('<' + tag + '>')

    def handle_endtag(self, tag):
        if tag not in self.allowed or tag == 'br':
            return
        if tag == 'a':
            if self.anchors and self.anchors.pop():
                self.parts.append('</a>')
        else:
            self.parts.append('</' + tag + '>' + ('</div>' if tag == 'table' else ''))

    def handle_data(self, value):
        self.parts.append(html.escape(value))


def render(value):
    parsed = PublicHTML()
    parsed.feed(value)
    return ''.join(parsed.parts)


def load_deng(root):
    source = root / 'dengqiang' / ('整理结果_' + SOURCE_DATE)
    tables = {f.name: list(csv.DictReader(f.open(encoding='utf-8-sig', newline=''))) for f in source.glob('*.csv')}
    stats = json.loads((source / 'tables.json').read_text('utf-8-sig'))['stats']
    original = tables['01_邓强全部论文_按时间.csv']
    raw_authors = tables['03_逐篇全部作者与ORCID.csv']
    first_dois = {r['DOI'].lower() for r in tables['02_邓强第一作者论文_按时间.csv']}
    author_by_doi = defaultdict(list)
    for row in raw_authors:
        author_by_doi[row['DOI'].lower()].append(row)
    papers = []
    for row in original:
        evidence = row['身份归属证据等级']
        # Unit-only evidence is kept in C, not promoted into the ORCID-supported B class.
        grade = 'A' if evidence.startswith('官方') else 'B' if evidence.startswith('Crossref作者ORCID') else 'C'
        target = [r for r in author_by_doi[row['DOI'].lower()] if r['是否目标邓强'] == '是']
        paper = {**row, '期刊或来源': row['期刊'], '成果类型': row['文献类型'], '排序日期依据': row['排序日期来源'], '是否排名第一': '是' if row['DOI'].lower() in first_dois else '否', '本人署名序号': row['邓强作者序号'], '作者人数': row['作者数'], '共同一作核验': row['共同一作声明'], '本人通讯作者状态': row['邓强是否通讯作者'], '本人ORCID_Crossref逐篇': next((r['ORCID_Crossref登记'] for r in target if r['ORCID_Crossref登记']), ''), '本人ORCID_参考身份锚点': 'https://orcid.org/' + row['邓强ORCID'], '本人署名单位_Crossref': ' | '.join(r['单位_Crossref登记'] for r in target if r['单位_Crossref登记']), '本人署名单位_OpenAlex': ' | '.join(r['单位_OpenAlex原始署名候选'] for r in target if r['单位_OpenAlex原始署名候选']), '归属证据': grade + '_' + evidence, '归属仍需复核': '是' if grade == 'C' else '否', '研究主题_题名规则分类': row['研究主题_基于题名分类'], '经历阶段_仅按发表年粗分': '天津大学相关阶段' if int(row['排序年份']) <= 2016 else '南昌大学相关阶段（含访学与合作）', '候选开放PDF链接_可用性未测试': row['开放PDF候选_未验证下载'], '候选开放全文页_可用性未测试': row['开放获取落地页候选'], 'Crossref卷期日期': row['卷期日期_Crossref'], 'OpenAlex或原始日期': row['原始日期'], '差异与限制': row['数据修正与待核事项'], '来源链接': row['核验来源']}
        papers.append(paper)
    papers_by_doi = {p['DOI'].lower(): p for p in papers}
    readings = [
        ('10.1007/s12209-023-00367-w', '先用作者综述建立金属—酸串联催化的概念框架。', '金属位、酸位、位点距离和氢物种应怎样分别理解？', '建立分类表，再回查原始论文与SI；综述不能替代实验细节。', '原档已核元数据与综述入口；归属为C类，正文待系统精读'),
        ('10.1039/c5gc01287b', '从博士阶段一作工作理解孔道限域与酸催化。', 'MOF限域怎样改变环酮自缩合的产物选择性？', '核对孔结构、酸含量、底物尺寸、对照催化剂与燃料物性。', '原档官方代表作归属与元数据已核；方法待全文/SI'),
        ('10.1021/jacs.1c08259', '观察从双功能材料走向反应中形成的酸催化功能。', 'H₂怎样在Co–N受阻路易斯对上触发酸转化？', '比较有无H₂、不同位点与同位素条件；区分氢异裂与普通加氢。', '原档已核Crossref作者ORCID及单位；方法待全文/SI'),
        ('10.1002/anie.202211461', '以排名第一的共同一作论文连接MAX材料与氢物种。', 'H⁺–H⁻对如何被证明，又怎样影响开环选择性？', '核对部分氧化、氢物种证据、材料对照与产物路径；区分首次在线和卷期日期。', '原档已核作者顺序与共同一作；单位支持，归属按C类保留'),
        ('10.1038/s41467-025-60268-5', '用已定向核对的开放代表作比较完整证据链与作者贡献。', '怎样区分酸功能、氢溢流与缩醛反应路径的作用？', '核对催化剂制备、时间依赖产物分布、同位素交换、原位红外、近常压XPS和作者贡献。', '原档定向读取出版社正文、Methods与贡献声明；未宣称逐篇精读全部论文'),
    ]
    reading = []
    for index, (doi, why, question, experiment, depth) in enumerate(readings, 1):
        p = papers_by_doi[doi]
        reading.append({'建议顺序': str(index), '论文ID': p['论文ID'], '排序日期': p['排序日期'], '英文题名': p['英文题名'], '中文题名_辅助译名': p['中文题名_辅助译名'], '期刊或来源': p['期刊或来源'], '为什么先读': why, '核心阅读问题': question, '建议关注的实验与评价_非个人操作证明': experiment, '本次来源阅读深度': depth, 'DOI': doi, '全文入口': p['DOI链接']})
    bio = [{**b, '机构': b['机构或单位'], '身份或活动': b['身份或事项'], '已核导师': '', '已核实信息': b['内容与科研关联'], '来源差异或未知': '开始月份在2026主页为2016-07、2020历史页为2016-09；采用较新页并保留差异。' if b['开始时间'] == '2016-07' else ''} for b in tables['04_教育教学与科研经历.csv']]
    tracker = tables['05_课题组与合作网络追踪.csv']
    people = [{'人物姓名': r['追踪对象'], '英文名': '', '关系类型': r['关系类型'], '值得了解的原因': r['已核实内容'], '仍未知或不应推断': r['限制'], '证据链接': r['入口链接']} for r in tracker if r['关系类型'] not in ['本人', '作者身份', '成果汇集平台', '历史平台署名，不能代替当前组织关系']]
    sources = [{'来源名称': r['入口类型'] + ' · ' + r['追踪对象'], 'URL': r['入口链接'].split(' | ')[0], '支持信息与读取边界': r['已核实内容'] + '；' + r['限制'], '获取日期': SOURCE_DATE} for r in tracker]
    sources.append({'来源名称': 'Crossref逐篇元数据', 'URL': 'https://api.crossref.org/works/{DOI}', '支持信息与读取边界': '逐篇登记及完整作者顺序；具体URL见论文记录，ORCID空白仍保留空白。', '获取日期': SOURCE_DATE})
    sources.append({'来源名称': '原档归属证据的保守映射', 'URL': OFFICIAL, '支持信息与读取边界': '5条官方代表作为A；51条Crossref作者ORCID并有单位/合作链支持为B；9条仅Crossref单位支持和36条OpenAlex单位/合作链支持归入C，原始证据原文逐篇保留。', '获取日期': SOURCE_DATE})
    coauthors = defaultdict(set)
    for a in raw_authors:
        if a['是否目标邓强'] != '是':
            coauthors[a['作者全名_英文']].add(a['DOI'].lower())
    network = []
    for name, dois in sorted(coauthors.items(), key=lambda v: (-len(v[1]), v[0])):
        dates = sorted(papers_by_doi[doi]['排序日期'] for doi in dois)
        network.append({'作者姓名_未全部消歧': name, '共同论文数_本次清单': len(dois), '最早排序日期': dates[0], '最近排序日期': dates[-1], '共同DOI': '; '.join(sorted(dois)), '关系边界': '仅为共同署名，其他合作者同名消歧未全部完成'})
    author_rows = [{**a, '作者姓名': a['作者全名_英文'], '署名序号': a['作者序号']} for a in raw_authors]
    evidence_counts = dict(Counter(p['归属证据'][0] for p in papers))
    summary = {'name': '邓强', 'folder': 'dengqiang', 'input_rows': 279, 'papers': len(papers), 'first_author': len(first_dois), 'authors': len(author_rows), 'evidence': evidence_counts, 'first_date': papers[0]['排序日期'], 'last_date': papers[-1]['排序日期'], 'source_sha256': stats['original_sha256'], 'csv_count': 8, 'as_of': SOURCE_DATE}
    body_file = root / 'dengqiang/report_body.html'
    body = body_file.read_text('utf-8-sig')
    sections = {m.group(1): m.group(2) for m in re.finditer(r'<section id="([^"]+)">(.*?)</section>', body, re.S)}
    embedded = lambda key: render(re.sub(r'<h2>.*?</h2>', '', sections[key], count=1, flags=re.S))
    report = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>邓强研究经历与阅读建议</title><style>body{max-width:1000px;margin:24px auto;padding:20px;font:16px/1.9 sans-serif;color:#19364b}h1{font-size:30px}h2{margin-top:36px}a{color:#296580}.table-scroll{overflow:auto}table{border-collapse:collapse;min-width:600px}th,td{border:1px solid #d4dfe5;padding:12px;text-align:left}th{background:#edf4f7}</style><h1>邓强研究经历与阅读建议</h1><p>原档核验日期：2026-10-20；网站纳入日期：2026-10-21。内容源自既有本地档案，非重新全网检索。</p>' + ''.join(render(sections[k]) for k in ['identity', 'career', 'research', 'experiments', 'group', 'assessment', 'reading', 'limits']) + '</html>'
    template = '# 邓强方向文献精读记录\n\n- DOI：\n- 题名：\n- 实际阅读日期：\n- 正文与SI是否取得：\n\n## 研究问题与底物/产物\n\n## 催化剂、金属位与酸位\n\n## 条件、定量方法与碳平衡\n\n## 关键对照、机理证据与替代解释\n\n## 作者贡献与仍待核实事项\n\n## 我的疑问与下一篇论文\n'
    return {'summary': summary, 'tables': {'papers': papers, 'authors': author_rows, 'bio': bio, 'reading': reading, 'network': network, 'people': people, 'sources': sources, 'annual': tables['08_年度研究主题变化.csv']}, 'source': source, 'intro': '金属—酸协同催化与生物质转化。沿酸催化和孔道形选性，到界面氢活化、氢溢流与串联反应，持续追问怎样让金属与酸位在相邻位置、合适时机协同，控制复杂含氧分子的反应路线。材料从生物炭、MOF、烧绿石拓展到MAX/MXene与COF；主线与普通合著的储能、吸附分离支线分别理解。', 'sections': {'研究方向随经历的变化': embedded('research') + '<h3>怎样评价研究路线</h3>' + embedded('assessment'), '实验经历应怎样理解': embedded('experiments'), '数据消歧与来源差异': embedded('limits')}, 'careerNotes': render(''.join(re.findall(r'<p\b[^>]*>.*?</p>', sections['career'], re.S))), 'report': report, 'template': template, 'reportSource': {'path': 'dengqiang/report_body.html', 'sha256': hashlib.sha256(body_file.read_bytes()).hexdigest()}}
