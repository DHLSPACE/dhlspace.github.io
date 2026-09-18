"""Chemistry-oriented views. Classification is derived, never source evidence."""
import json
import csv
import re
from pathlib import Path

FIELDS = {
    '化工': r'化工|化学工程|过程工程|过程强化|分离|煤炭化学|盐湖',
    '化学': r'化学|催化|理化',
    '材料': r'材料|高分子|金属|陶瓷|硅酸盐|纳米',
    '电化学': r'电化学|电池|储能|燃料电池',
    '生物化学': r'生物化学|生化|生物技术|生物工程|生物制造|微生物|生物物理|药物|生物能源',
    '半导体': r'半导体|微电子|微系统|集成电路|光电材料',
    '分析化学': r'分析化学|分析测试|精密测量|色谱|光谱',
    '有机合成': r'有机|合成|药物|天然产物',
    '能源环境': r'能源|环境|生态|煤|绿色|海洋化学',
}
UNRELATED = re.compile(r'美术|艺术|音乐|舞蹈|体育|马克思|法学院|法学专业|新闻|外国语学院|经济管理|商学院|建筑城规|建筑学|人文学院|公共管理|教育学院|历史学院|哲学|文学与|MBA|MPA|会计|工商管理|法律硕士|旅游管理|考古|天文')
ADMISSION = re.compile(r'研究生|硕士|推免|免试|保研|复试|招生|录取|夏令营|暑期学校|报名|推荐资格|名额')


def fields(text):
    return [name for name, pattern in FIELDS.items() if re.search(pattern, text)]


def relevant(title, source=None):
    """Mixed institute lists are allowed; explicit unrelated departments are not."""
    if UNRELATED.search(title):
        return False
    if re.search(r'高考|中考|自考|成人高|专升本|高职|中职|幼儿|中小学|普通高校招生|本科招生|教师资格', title) and not re.search(r'硕士|研究生|推免',title):
        return False
    if re.search(r'博士|博后|博士后', title) and not re.search(r'硕士|硕博|直博|推免|免试', title):
        return False
    if re.search(r'招聘|岗位|干部任免|党建|党员',title) and not re.search(r'招生|招收',title):
        return False
    return bool(ADMISSION.search(title) or re.search(r'专业介绍|导师介绍|研究方向|培养方案|考试大纲|参考书|学科介绍|综合排名|推荐资格',title))


def classify(source, title='', published='', url=''):
    name = source.get('name', '')
    school = source.get('school', '') or name.split(' · ')[0]
    school = school.replace('中科院', '中国科学院')
    if school.startswith('南昌大学'):
        school = '南昌大学'
    text = title or name
    policy = source.get('source_type')=='监管机构' or bool(re.search(r'教育部|教育厅|教育考试院|招生考试院|教育委员会|招生考试之窗', school))
    home = school == '南昌大学' and bool(re.search(r'教务|推荐资格|推荐优秀应届|推荐免试|推免资格|推免名额|综合排名|加分|遴选|保研', text + ' ' + name)) and not re.search(r'接收|招收', text)
    scope = '政策' if policy else '本校' if home else '目标'
    level = '国家政策' if policy and '教育部' in school else '地方政策' if policy else '研究所' if re.search(r'研究所|中国科学院', school) else '院系' if '学院' in name or re.search(r'学院|系(?:20|\s)', title) else '校级'
    # Avoid interpreting the word 科学院 as a faculty and prefer explicit faculty names.
    department_pattern=r'((?:化学|化工|材料|生命|生物|食品|能源|资源|环境|微电子|半导体|电子|电气)[\u4e00-\u9fff]{0,16}学院)'
    match = re.search(department_pattern, name) or re.search(department_pattern, text)
    department = ('研究生招生' if level=='研究所' else level if policy else match[1] if match else
                  '教务处' if '教务' in name else '校院汇总' if re.search('各学院|各院系',text) else level)
    years = sorted(set(re.findall(r'(?<!\d)(20\d{2})(?!\d)', title)))
    year = years[0] if len(years) == 1 else '跨年' if years else '待核实'
    year_basis = '标题明确年份' if len(years) == 1 else '标题包含多个年份' if years else '未从标题确定招生年份'
    return dict(school=school, scope=scope, level=level, department=department,
                year=year, year_basis=year_basis, publication_year=published[:4] if published else '',
                directions=fields(title+' '+name), relevant=relevant(text, source),
                classification_basis='按来源和标题自动整理，可核对；年份未用抓取时间代替')


def enrich(data, root):
    sources = {s['id']: s for s in data['sources']}
    items = {(r['source_id'], r['url']): r for r in data['items']}
    resources = {(r['source_id'], r['url']): r for r in data['resources']}
    for source in data['sources']:
        source['filing'] = classify(source)
    for table in ['items', 'events', 'notes', 'resources', 'snapshots']:
        for row in data[table]:
            source = sources.get(row.get('source_id'), {'school': row.get('school', ''), 'name': row.get('school', '')})
            item = items.get((row.get('source_id'), row.get('url')), {})
            resource = resources.get((row.get('source_id'), row.get('url')), {})
            title = row.get('title') or resource.get('title') or item.get('title') or source.get('name', '')
            row['display_title'] = title
            row['filing'] = classify(source, title, row.get('published') or item.get('published', ''), row.get('url', ''))
            if table == 'snapshots' and row.get('kind') == 'list':
                row['filing'].update(year='跨年', year_basis='栏目列表快照，可能含多个招生年份', relevant=True)
            if table == 'snapshots' and row.get('kind') == '异常页面':
                row['filing'].update(relevant=False, classification_basis='失败响应留档，不计为成功保存的招生资料')
            if table == 'notes' and re.fullmatch(r'20\d{2}', row.get('year') or ''):
                row['filing'].update(year=row['year'], year_basis='笔记手动填写年份')
            if '本轮审计暂停' in source.get('note',''):
                row['filing'].update(relevant=False, classification_basis='来源归属待复核，已退出默认相关资料视图')
    for key, filename in [('portals', 'portals.json'), ('coverage', 'coverage.json'), ('excluded_institutions', 'excluded-institutions.json')]:
        path = Path(root)/'sources'/filename
        data[key] = json.loads(path.read_text('utf-8')) if path.exists() else []
    data['profile'] = dict(home_school='南昌大学', strengths=['物理化学', '化工原理', '英语'], directions=list(FIELDS), target_year=data['settings'].get('target_year', 2028))
    return data


def export_filing(store):
    data={t:store.query('SELECT * FROM '+t+' ORDER BY id DESC') for t in ['sources','items','events','notes','snapshots','resources']}
    data['settings']=store.settings()
    enrich(data,store.root)
    rows=[]
    for x in data['snapshots']:
        f=x['filing']
        rows.append(dict(id=x['id'],用途=f['scope'],招生年份=f['year'],年份依据=f['year_basis'],学校=f['school'],层级=f['level'],院系=f['department'],标题=x['display_title'],相关=f['relevant'],原网址=x['url'],保存时间=x['created'],原件=x['raw_path'],文本=x['text_path'],来源记录=x['manifest_path'],SHA256=x['sha256']))
    folder=store.data/'exports';folder.mkdir(exist_ok=True)
    (folder/'分类目录.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n','utf-8')
    if rows:
        with (folder/'分类目录.csv').open('w',encoding='utf-8-sig',newline='') as stream:
            writer=csv.DictWriter(stream,fieldnames=list(rows[0]));writer.writeheader()
            writer.writerows({k:("'"+v if isinstance(v,str) and v.startswith(('=','+','-','@')) else v) for k,v in row.items()} for row in rows)
    return rows
