#!/usr/bin/env python3
"""Build the self-contained SI research page from versioned inputs (stdlib only)."""
import json, html, re, hashlib, shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INPUT = ROOT / 'research'
def read(name): return json.loads((INPUT / name).read_text())
core = read('core.json')
ai = read('ai_people.json')
laws = read('states_noncompete_2026-11-05.json')
esc = lambda x: html.escape(str(x if x is not None else ''), quote=True)
sources = core['sources'] + ai['sources']
for s in sources:
    s.pop('ref', None); s.pop('wordlim', None)
for state in laws['states']:
    for n,s in enumerate(state['sources'], 1):
        s.pop('ref',None)
        s['id'] = f"L{state['code']}{n}"
        source_type='州法／政府说明／原始判例'
        if s.get('kind')=='primary_mirror': source_type='法条或判决正文镜像'
        if 'law.justia.com' in s.get('url',''): source_type='原始法条／判决的第三方转载'
        sources.append(dict(s,type=source_type, date='发布日期见标题；核验 '+state['verified_date']))
sources.append({'id':'U01','title':'用户提供的 Cat / Tibo 截图','url':'','type':'用户提供的一手材料','date':'2026-11-05 接收','notes':'截图不公开转载；原 X 链接见 S02，抓取受限。'})
source_ids = {x['id'] for x in sources}
def refs(ids):
    return ' '.join(f'<a class="ref" href="#{esc(i if i != "user_screenshot" else "U01")}">[{esc(i if i != "user_screenshot" else "U01")}]</a>' for i in ids)
def table(heads, rows, attrs=''):
    return '<div class="table-scroll"><table '+attrs+'><thead><tr>'+''.join('<th>'+h+'</th>' for h in heads)+'</tr></thead><tbody>'+''.join(rows)+'</tbody></table></div>'
def row(cells, attrs=''):
    return '<tr '+attrs+'>'+''.join('<td>'+c+'</td>' for c in cells)+'</tr>'
chapters = (INPUT/'chapters.html').read_text()
parts={m.group(1):m.group(0) for m in re.finditer(r'<section id="([^"]+)">.*?</section>',chapters,re.S)}

state_rows=[]
aliases={'CA':'加州 加利福尼亚州','NY':'纽约州 纽约','MA':'麻省 马萨诸塞州','FL':'佛州 佛罗里达州','TX':'德州 得州 德克萨斯州 得克萨斯州','WA':'华州 华盛顿州','DC':'华盛顿特区 华府','PA':'宾州 宾夕法尼亚州','NJ':'新泽西州 新州','IL':'伊州 伊利诺伊州','VA':'弗州 弗吉尼亚州','MD':'马州 马里兰州','CO':'科州 科罗拉多州','MN':'明州 明尼苏达州'}
for s in laws['states']:
    s['aliases']=aliases.get(s['code'],'')
    text=' '.join([s['code'],s['state_en'],s['state_zh'],s['aliases'],s['rule'],s['caveat']]).lower()
    state_rows.append(row([f'<b>{esc(s["code"])}</b><br>{esc(s["state_zh"])}<small>{esc(s["state_en"])}</small>',f'<span class="badge {s["category"]}">{esc(laws["categories"][s["category"]])}</span><p>{esc(s["rule"])}</p>',f'{esc(s["caveat"])}<small>核验 {esc(s["verified_date"])} · {refs([x["id"] for x in s["sources"]])}</small>'],f'id="state-{s["code"]}" data-category="{s["category"]}" data-search="{esc(text)}"'))
counts={k:sum(s['category']==k for s in laws['states']) for k in laws['categories']}
law_html='<section id="states"><div class="kicker">04 / 50 STATES + DC</div><h2>逐州检索：同一个职位，规则可能完全不同</h2><p>以下是普通雇员离职后竞业的研究入口。分类按主要制度特征整理：<strong>“主要合理性审查”也可能有成文法及特定职业限制；四类不是官方法律评级。</strong>原文链接在每行末尾。DC 是联邦特区，单独计入。</p>'
law_html+='<div class="stats mini">'+''.join(f'<div><b>{counts[k]}</b><span>{esc(v)}</span></div>' for k,v in laws['categories'].items())+'</div>'
law_html+='<div class="callout amber"><b>先看日期，再看结论</b><p>WA 的广泛禁令已签署，但 2027-06-30 才生效；IL 的收入门槛 2027 年上调；TN 与 VA 在 2026 年有新法。WY 对管理层等的重要例外使其不能简单等同于加州。具体见各州行。</p></div>'
law_html+='<div class="filterbar"><label>查州、术语或金额<input id="state-search" type="search" placeholder="例如：California、加州、商业秘密、126,858"></label><label>制度类型<select id="state-category"><option value="all">全部类型</option>'+''.join(f'<option value="{k}">{esc(v)}</option>' for k,v in laws['categories'].items())+'</select></label><button id="state-reset" class="secondary">重置</button><p id="state-count" role="status" aria-live="polite">51 / 51 个司法辖区</p></div>'
law_html+='<details class="jump"><summary>展开州缩写索引（按英文州名排序）</summary><div class="state-index">'+''.join(f'<a href="#state-{s["code"]}" title="{esc(s["state_zh"])}" data-state="{s["code"]}">{s["code"]}</a>' for s in laws['states'])+'</div></details>'
law_html+=table(['州／特区','普通雇员规则','例外、边界与依据'],state_rows,'id="states-table"')+'<p id="state-empty" hidden role="status">没有匹配项。试试州名、英文名或缩写，或重置类型。</p>'
law_html+='<details><summary>加州奖金返还的新变化：不要沿用旧的 2026 起点</summary><p>AB692 原规则后经 2026 年 AB1697 修订。州长 2026-09-30 的签署清单与 Chapter 889 正文显示，BPC §16608 的相关合同适用起点改到 2027-01-01，并有特定奖金等例外。这是 stay-or-pay 规则，不能混同于早已存在的普通竞业禁令。'+refs(['CA26A','CA26B'])+'</p></details></section>'

# The California update is independently dated and kept separate from general noncompetes.
sources.extend([
 {'id':'CA26A','title':'加州州长 2026-09-30 签署清单（含 AB1697）','url':'https://www.gov.ca.gov/2026/09/30/governor-newsom-issues-legislative-update-9-30-2026/','type':'州政府签署确认','date':'2026-09-30'},
 {'id':'CA26B','title':'AB1697 Chapter 889 正文镜像','url':'https://legiscan.com/CA/text/AB1697/id/3461237','type':'已签署州法正文镜像','date':'2026-09-30','notes':'与州长签署清单交叉核对；将 §16608 合同日期修改至 2027-01-01。'}
])
source_ids.update(['CA26A','CA26B'])

case=ai['case']
people_html='<section id="people"><div class="kicker">07 / PEOPLE & GOVERNANCE</div><h2>OpenAI 与 Anthropic：公开人员快照</h2><p>'+esc(ai['scope_note'])+'</p><div class="company-grid"><article class="company"><span>OPENAI</span><h3>治理层与管理层分开看</h3><p>'+esc(ai['openai']['governance'])+' '+refs(['S04'])+'</p></article><article class="company"><span>ANTHROPIC</span><h3>公益公司也有商业与产品团队</h3><p>'+esc(ai['anthropic']['governance'])+' '+refs(['S21'])+'</p></article></div><p class="note">“公开在任”表示本次可核验的公开信息；旧公告单独标注年份，不能据其推断完整现行汇报关系。未公开部门人数不估算，不以领导名单代表全部员工。</p>'
people_rows=[]
for company in ['openai','anthropic']:
    for p in ai[company]['people']:
        evidence=p.get('evidence',[ai[company].get('leadership_source','S04')])
        status=p.get('status','当前官方领导页列示（2026-11-05 核验）')
        people_rows.append(row([('OpenAI' if company=='openai' else 'Anthropic'),'<b>'+esc(p['name'])+'</b>',esc(p['role']),esc(status)+'<br>'+refs(evidence)],f'data-company="{company}"'))
people_html+='<div class="filterbar"><label>筛选公司<select id="people-company"><option value="all">两家公司</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label><p id="people-count" role="status"></p></div>'
people_html+=table(['公司','人物','公开职衔／职能','证据与时间边界'],people_rows,'id="people-table"')
people_html+='<details><summary>旧资料易错的头衔与补充人物</summary><ul>'
for p in ai['openai']['historical_corrections']:
    people_html+='<li><b>'+esc(p['name'])+'</b>：'+esc(p['correction'])+' '+refs(p['evidence'])+'</li>'
for p in ai['anthropic']['other_public_roles']:
    people_html+='<li><b>'+esc(p['name'])+'</b>：'+esc(p['role'])+'；'+esc(p['note'])+' '+refs(p['evidence'])+'</li>'
people_html+='</ul></details><div class="callout"><b>CPO 这个缩写有歧义</b><p>Chief Product Officer 是首席产品官；Chief People Officer 是人力负责人。Anthropic 的 Ami Vora 与 OpenAI 的 Arvind KC 虽都可能缩写为 CPO，职责完全不同。CEO of Applications 也不是 OpenAI 总 CEO 的同义词。</p></div></section>'

function_html='<section id="functions"><div class="kicker">08 / FUNCTIONS & SERVICES</div><h2>这些公司里，究竟有哪些工作？</h2><p>以下按公开招聘与公司资料归纳职能，便于理解人才构成。它是职能地图，<strong>不声称这些名称都是正式部门，更不绘制未经证实的上下级关系</strong>。</p><div class="function-grid">'
for i,f in enumerate(ai['function_map'],1):
    function_html+=f'<article><span class="num">{i:02}</span><h3>{esc(f["function"])}</h3><p>{esc(f["work"])}</p><p class="note">{esc(f["note"])} {refs(f["evidence"])}</p></article>'
function_html+='</div><h3>“服务部”至少要区分三类</h3>'+table(['职能','服务对象','典型工作'],[row(['Technical Success / Solutions 技术成功与解决方案','开发团队、企业客户','API 集成、架构建议、部署与技术采用；可能与销售合作。']),row(['Customer Success 客户成功','持续使用的组织客户','推动采用、培训、价值实现与续约协作。']),row(['Support 客户支持','遇到账户或产品问题的用户','排障、工单、计费与账户问题；与研究安全团队不是同一职能。'])])+'<p class="note">这里是职能概念解释；具体合同支持等级、响应时间与团队名称应看公司的当前服务条款。'+refs(['S25','S26','S28'])+'</p><h3>服务和产品入口，和部门也不是一回事</h3>'
function_html+=table(['公司','主要交付方式／入口','理解重点'],[row([esc(p['company']),esc(p['entry']),esc(p['reader_note'])+' '+refs(p['evidence'])]) for p in ai['product_map']])
function_html+='<p>以一次 API 调用为例：产品团队定义体验；研究团队训练模型；基础设施提供推理服务；商业团队签约；技术成功帮助集成；支持处理故障。实际团队会协作和交叉，一名员工的迁移只能说明其中一个位置发生变化。</p></section>'

movement_html='<section id="moves"><div class="kicker">09 / TALENT FLOWS</div><h2>从个人跳槽，到团队招聘与创业</h2><div class="case"><span class="badge limited">本次起点 · 2026-11-05</span><h3>Cat Wu：Anthropic → OpenAI</h3><p>'+esc(case['status'])+'。'+refs(case['evidence'])+'</p><p>'+esc(case['limits'])+'</p></div>'
movement_html+=table(['宣布／事件时间','人物与路线','事件性质与证据'],[row([esc(m['date']),'<b>'+esc(m['person'])+'</b><br>'+esc(m['from'])+'<br><span class="route-arrow">↓</span> '+esc(m['to']),'<b>'+esc(m['kind'])+'</b><p>'+esc(m['confidence'])+'</p>'+refs(m['evidence'])]) for m in ai['movement_timeline']])
movement_html+='<h3>如何读这些路线</h3><ul>'+''.join('<li>'+esc(t)+'</li>' for t in ai['interpretation'])+'</ul><p>本表是有证据的案例集，既不完整，也不计算某家公司的人才净流入。研究人员转职、产品负责人转职、创始团队创业、许可交易伴随招聘、股权投资伴随人员加入，应分别记录。</p></section>'

glossary_html='<section id="glossary"><div class="kicker">12 / BILINGUAL GLOSSARY</div><h2>中英术语：以后看到新闻就能对号入座</h2><label class="searchlabel">检索中英文术语<input type="search" id="term-search" placeholder="例如：对价、garden leave、CPO、商业秘密"></label>'+table(['英文','中文','白话解释'],[row([esc(a),esc(b),esc(c)]) for a,b,c in core['glossary']],'id="terms-table"')+'<p id="term-count" role="status"></p></section>'

type_names={'primary':'公司／本人一手资料','primary_current':'当前官方页面','primary_historical':'历史官方资料','reporting':'媒体报道','primary_mirror':'本人公告镜像','reporting_company_response':'媒体引述公司回应','unretrieved_primary':'原址未成功读取'}
source_html='<section id="sources"><div class="kicker">13 / EVIDENCE REGISTER</div><h2>原文与证据索引</h2><p>核验日期不等于法条或公告发布日。动态页面可能变化；历史判例只证明其法律框架，不保证覆盖之后所有新法。标明“镜像”“未成功读取”的材料，不冒充直接读取的官网全文。外部链接需要联网。</p><label class="searchlabel">检索来源<input type="search" id="source-search" placeholder="例如：华盛顿、Anthropic、16600、FTC"></label><p id="source-count" role="status"></p>'
for s in sources:
    stype=type_names.get(s.get('type'),s.get('type','原文来源'))
    source_html+='<article class="source" id="'+esc(s['id'])+'"><span class="source-id">'+esc(s['id'])+'</span><div><h3>'+esc(s['title'])+'</h3><small>'+esc(stype)+' · '+esc(s.get('date') or '未标注发布日期；2026-11-05 核验')+'</small>'
    if s.get('url'): source_html+='<a class="source-url" href="'+esc(s['url'])+'" target="_blank" rel="noopener noreferrer">'+esc(s['url'])+'</a>'
    if s.get('notes'): source_html+='<p>'+esc(s['notes'])+'</p>'
    source_html+='</div></article>'
source_html+='</section>'

ordered=[parts['answer'],parts['contracts'],parts['jurisdiction'],law_html,parts['secrets'],parts['history'],people_html,function_html,movement_html,parts['comparison'],parts['maintenance'],glossary_html,source_html]
nav=[('answer','01','先回答：能否直接跳槽'),('contracts','02','六种不同的合同约束'),('jurisdiction','03','适用法与联邦现状'),('states','04','50 州 + DC 检索'),('secrets','05','技能、秘密与不挖人'),('history','06','硅谷制度与历史'),('people','07','两家公司公开人员'),('functions','08','职能、部门与服务'),('moves','09','人才流动时间线'),('comparison','10','与熟悉的制度对照'),('maintenance','11','长期更新方法'),('glossary','12','中英术语词典'),('sources','13','原文与证据索引')]
css=(ROOT/'style.css').read_text()
js=(ROOT/'app.js').read_text()
sha=__import__('base64').b64encode(hashlib.sha256(js.encode()).digest()).decode()
page='''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1d3533"><meta name="description" content="美国50州与DC竞业限制、协议效力、商业秘密及OpenAI/Anthropic公开人员职能与人才流动的中文长期知识库。2026-11-05核验。"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'sha256-'''+sha+''' '; img-src data:; base-uri 'none'; form-action 'none'"><link rel="canonical" href="https://162383.xyz/si/"><title>SI · 美国竞业限制与 AI 人才流动</title><style>'''+css+'''</style></head><body><a class="skip" href="#main">跳到正文</a><header class="top"><a class="brand" href="/">162383 <span>/</span> SI</a><div class="edition">INSTITUTIONS · PEOPLE · TECHNOLOGY</div><a href="/Business/">Business ↗</a></header><div class="hero"><div class="eyebrow">SILICON INSTITUTIONS / RESEARCH NOTE 001</div><h1>人才为什么<br>能<span>流动？</span></h1><p class="deck">美国竞业限制、硅谷制度<br class="mobile">与 AI 公司组织</p><div class="hero-bottom"><p>从 Cat Wu 加入 OpenAI 的消息出发，<br>理解合同、法律、知识与公司的关系。</p><div class="date"><span>资料核验 / BEIJING DATE</span><b>2026.11.05</b><small>版本 1.0 · 人工核验快照</small></div></div><div class="actions"><a class="button" href="#states">查一个州 <span>↓</span></a><a class="button outline" href="#people">看公司与人物</a><a class="button outline" href="index.html" download="SI-Noncompete-AI-Knowledge.html">保存 HTML</a><button class="button outline" id="print">打印 / 存为 PDF</button></div></div><div class="ribbon"><span><b>51</b> 州／特区条目</span><span><b>29</b> 公开人物条目</span><span><b>9</b> 人才流动案例</span><span><b>'''+str(len(sources))+'''</b> 来源记录</span></div><div class="layout"><aside><div class="navtitle">本页导航 <span>CONTENTS</span></div><nav aria-label="文章章节">'''+''.join(f'<a href="#{id}"><span>{n}</span>{name}</a>' for id,n,name in nav)+'''</nav><div class="side-note">一个判断顺序<br><strong>人在哪里工作？<br>约束的是什么？<br>当时什么法生效？</strong></div><a class="data-link" href="knowledge.json" download>下载结构化研究数据 ↗</a></aside><main id="main">'''+''.join(ordered)+'''</main></div><footer><a class="brand" href="#">162383 / SI</a><p>美国竞业限制与 AI 人才流动 · 2026-11-05 · v1.0<br>独立学习资料；公开证据有限处已标注。此页面不会自动更新。</p><div><a href="https://github.com/DHLSPACE/dhlspace.github.io/tree/main/si">GitHub 源码与历史 ↗</a><a href="/Business/">Business 机构研究 ↗</a><a href="/anthropic/">Anthropic 研究 ↗</a></div></footer><script>'''+js+'''</script></body></html>'''
# Keep the CSP hash source exact; no remote dependencies are required.
page=page.replace("sha256-"+sha+" '","sha256-"+sha+"'")
(ROOT/'index.html').write_text(page)
knowledge={'version':'1.0','verified_on':core['verified_on'],'scope':core['scope'],'core':core,'state_laws':laws,'ai_people':ai,'source_register':sources}
(ROOT/'knowledge.json').write_text(json.dumps(knowledge,ensure_ascii=False,indent=2)+'\n')
assert len(laws['states'])==51 and len({s['code'] for s in laws['states']})==51
assert len({s['id'] for s in sources})==len(sources)
ids=set(re.findall(r'\bid="([^"]+)"',page))
assert len(ids)==len(re.findall(r'\bid="([^"]+)"',page)), 'Duplicate IDs'
broken=set(re.findall(r'href="#([^"]+)"',page))-ids
assert not broken, f'Broken anchors: {broken}'
print(json.dumps({'html_bytes':len(page.encode()),'states':51,'sources':len(sources),'anchors':len(ids),'people':len(people_rows)},ensure_ascii=False))
