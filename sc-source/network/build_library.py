"""Build human-readable views and portable exports from canonical per-person JSON.

Generated: README/research-map/source-notes, exports, index.html, public site.
Preserved: profile.json, papers.json, timeline.json, tasks.json, notes, fulltext.
No network, API keys, legacy archive mutations, or publishing.
"""
from __future__ import annotations
import csv
import html
import json
from pathlib import Path
import re
import shutil
from research_archives import build_archives, public_archive

ROOT=Path(__file__).resolve().parents[1]
BASIS={'official_statement':'官网方向声明','official_representative':'官网代表成果线索','official_project':'官网项目线索',
       'historical_official':'历史官方资料','official_event':'官方学术报告线索','local_snapshot':'既有档案分析（未重做逐篇核验）'}
PRIORITY={'baseline':'既有基础','P0':'用户点名/明确导师','P1':'第一圈延伸','P2':'扩展比较'}
def read(p):return json.loads(p.read_text(encoding='utf-8'))
def jsonwrite(p,d):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def textwrite(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s.rstrip()+'\n',encoding='utf-8')
def newtext(p,s):
    if not p.exists():textwrite(p,s)
def newjson(p,d):
    if not p.exists():jsonwrite(p,d)
def csvwrite(p,rows,fields):
    p.parent.mkdir(parents=True,exist_ok=True)
    with p.open('w',encoding='utf-8-sig',newline='') as f:
        w=csv.DictWriter(f,fieldnames=fields);w.writeheader();w.writerows(rows)
def esc(s):return str(s if s is not None else '未采集').replace('|','\\|').replace('\n',' ')
def table(headers,rows):return '\n'.join(['| '+' | '.join(headers)+' |','| '+' | '.join(['---']*len(headers))+' |']+['| '+' | '.join(esc(v) for v in row)+' |' for row in rows])

def relation_label(r,person_id):
    if r['type']=='doctoral_adviser':return '其博士生' if r['from_id']==person_id else '博士导师'
    return r['label']

def pick(record,fields):return {k:record[k] for k in fields.split() if k in record}

def public_data(people,tax,relations,waves,sources):
    """Project every nested record; newly added private fields are excluded by default."""
    public_people=[]
    for p in people:
        item=pick(p,'person_id name_zh name_en institution institution_id selection_reason priority source_note stage source_kind official_url area_ids admissions_status')
        item['directions']=[pick(d,'topic_id title objects reading_question evidence_basis direction_id source_ids time_scope anchor_dois research_question_status current_activity_status topic_name area_id area_name evidence_label') for d in p['directions']]
        item['publication_coverage']=pick(p['publication_coverage'],'status complete count first_author_count snapshot_date')
        if p.get('research_archive'):
            item['research_archive']=public_archive(p['research_archive'])
        legacy=p.get('legacy_archive')
        item['archive_url']=f'https://162383.xyz/sc/#/people/{legacy}' if legacy in {'hongwei','wangqun','zengxiaojun','dengqiang'} else p.get('archive_url')
        public_people.append(item)
    public_tax=pick(tax,'schema_version note')
    public_tax['areas']=[pick(a,'id name prerequisites methods_to_check metrics_to_check reading_caution') for a in tax['areas']]
    public_tax['topics']=[pick(t,'id area_id name') for t in tax['topics']]
    return {'as_of':'2026-10-23','people':public_people,'taxonomy':public_tax,
       'relations':[pick(r,'relation_id from_id to_id type label source_ids detail anchor_dois snapshot_common_papers start end status checked_at') for r in relations],
       'waves':pick(waves,'as_of rule wave_1 wave_2 baseline'),'basis':BASIS,'priority':PRIORITY,
       'sources':[pick(s,'source_id title url retrieved_at access_status') for s in sources],
       'counts':{'people':len(people),'new_people':sum(p['stage']=='foundation' for p in people),'existing_people':sum(p['stage']=='existing_snapshot' for p in people),'directions':sum(len(p['directions']) for p in people),'areas':len(tax['areas']),'topics':len(tax['topics']),'sources':len(sources),'relations':len(relations), 'physics_people':sum(bool(p.get('research_archive')) for p in people), 'physics_papers':sum(len(p.get('research_archive',{}).get('papers',[])) for p in people)}}

def main():
    people=sorted([read(p) for p in (ROOT/'people').glob('*/profile.json')],key=lambda p:(['baseline','P0','P1','P2'].index(p['priority']),p['institution_id'],p['person_id']))
    people_by_id={p['person_id']:p for p in people}
    build_archives(people)
    tax=read(ROOT/'data/taxonomy.json');areas={x['id']:x for x in tax['areas']};topics={x['id']:x for x in tax['topics']}
    sources=read(ROOT/'data/sources.json');src={s['source_id']:s for s in sources}
    relations=read(ROOT/'data/relationships.json');waves=read(ROOT/'data/reading_waves.json')
    person_rows=[];direction_rows=[];source_rows=[];relation_rows=[]
    for s in sources:
        source_rows.append({'来源ID':s['source_id'],'标题':s['title'],'来源网址':s['url'],'访问日期':s['retrieved_at'],
            '读取状态':s['access_status'],'附件网址':' ; '.join(a['url'] for a in s.get('attachments',[])),
            '说明':s.get('note','')})
    for p in people:
        sid=p['person_id'];folder=ROOT/'people'/sid
        person_areas=list(dict.fromkeys(topics[d['topic_id']]['area_id'] for d in p['directions']))
        p['area_ids']=person_areas
        for i,d in enumerate(p['directions'],1):
            d['topic_name']=topics[d['topic_id']]['name'];d['area_id']=topics[d['topic_id']]['area_id']
            d['area_name']=areas[d['area_id']]['name'];d['evidence_label']=BASIS[d['evidence_basis']]
        person_rows.append({'人物ID':sid,'中文姓名':p['name_zh'],'英文检索名':p['name_en'],'机构':p['institution'],
             '研究主类':'；'.join(areas[a]['name'] for a in person_areas),'建库阶段':p['stage'],'研读批次':PRIORITY[p['priority']],
             '纳入原因':p['selection_reason'],'细分方向数':len(p['directions']),'既有论文快照数':p['publication_coverage']['count'],
             '快照日期':p['publication_coverage'].get('snapshot_date',''),'官网':p['official_url'],'时效与边界':p['source_note'],
             '档案路径':f'people/{sid}/README.md'})
        legacy=''
        if p['legacy_archive']:
            legacy=f'\n原档案：[打开原目录](../../../{p["legacy_archive"]}/)。本库只建立索引，不搬迁、改名或重写原资料。\n'
        coverage=p['publication_coverage']
        count_text=f'来源有界论文快照 {coverage["count"]} 条，第一署名 {coverage.get("first_author_count")} 条，快照日期 {coverage.get("snapshot_date")}。不是完整全集。' if coverage['count'] is not None else '尚未系统收集论文；空论文表代表未开始，不代表没有论文。'
        archive_intro=(f'本轮已整理论文元数据、官网履历时间线和建议阅读队列。{p["research_archive"]["scope_note"]}\n\n[打开独立研究报告](../../research/{sid}.html) · [论文CSV](../../downloads/physics/{sid}-papers.csv) · [第一署名CSV](../../downloads/physics/{sid}-first-author.csv) · [BibTeX](../../downloads/physics/{sid}.bib)' if p.get('research_archive') else '已建立官方身份入口、研究方向初筛、来源和后续研究模板。')
        related=[r for r in relations if sid in (r['from_id'],r['to_id'])]
        relation_md=table(['对象','关系','依据与边界'],[
            [f'[{people_by_id[r["to_id"] if sid==r["from_id"] else r["from_id"]]["name_zh"]}](../{r["to_id"] if sid==r["from_id"] else r["from_id"]}/README.md)',relation_label(r,sid),r['detail']] for r in related]) if related else '本批未建立人物关系记录。'
        intro=f'''# {p['name_zh']} · {p['name_en']}

人物ID：`{sid}` · 建库核验：{p['last_reviewed_at']} · {PRIORITY[p['priority']]}

机构：{p['institution']}。{p['unit'] or ''}

纳入原因：{p['selection_reason']}

来源时效：{p['source_note'] or '官方资料已读取；具体方向是否在近五年持续活跃仍待论文核实。'}

[官方入口]({p['official_url']}) · [细分研究方向](research-map.md) · [来源与读取记录](source-notes.md) · [全库导航](../../index.html#person={sid})

## 当前完成到哪里

{archive_intro}

{count_text}

本页英文名用于检索，新增人物的论文署名变体、ORCID及OpenAlex作者集合仍待消歧。

{legacy}
## 方向速览

{table(['主类','细分方向','依据'],[[d['area_name'],d['title'],d['evidence_label']] for d in p['directions']])}

研究问题、方法和评价指标是后续阅读提示。官网团队方向不能证明全部工作由本人独立完成。

## 关系与对照入口

{relation_md}

## 下一轮研究

1. 先核近五年主页、项目与代表作，区分持续主线、历史阶段和普通合作支线。
2. 核定身份后收集完整候选文献，保留日期精度、第一署名、共同一作、通讯作者的区别。
3. 用5篇稳定阅读队列理解基础问题、转折、近期方向、关键方法和对照路线。
4. 阅读全文与SI后更新方向证据；填入时间线和个人笔记。

论文数据写入 `papers.json`，经历写入 `timeline.json`，自己的笔记写入 `notes/`。这些文件不会被视图重建覆盖。

招生状态：{p['admissions_status']}。
'''
        textwrite(folder/'README.md',intro)
        parts=[f'# {p["name_zh"]}：研究方向分解\n',
          '每个方向按照“主类 → 具体对象 → 待回答问题 → 需要检查的方法与指标 → 论文证据”组织。方法与指标来自学科阅读框架，尚未证实该人物逐项使用。\n']
        for d in p['directions']:
            a=areas[d['area_id']]
            refs='；'.join(f'[{src[s]["title"]}]({src[s]["url"]})' for s in d['source_ids'])
            doi='；'.join(f'[{x}](https://doi.org/{x})' for x in d['anchor_dois']) or '待下一轮逐篇定位；不填未经核验的DOI。'
            parts += [f'## {d["title"]}\n',f'- 方向ID：`{d["direction_id"]}`\n- 导航层级：{a["name"]} → {d["topic_name"]}\n- 研究对象：{"；".join(d["objects"])}\n- 来源依据：{d["evidence_label"]}\n- 时段：{d["time_scope"]}\n',
               f'待回答的问题：{d["reading_question"]}\n',f'建议查阅方法：{a["methods_to_check"]}。\n',
               f'建议比较指标：{a["metrics_to_check"]}。\n',f'阅读时需注意：{a["reading_caution"]}\n',
               f'证据入口：{refs}\n\n论文锚点：{doi}\n',
               f'检索组合：`"{p["name_en"]}" + "{p["institution"]}" + "{d["objects"][0]}"`。该组合仅作检索入口，不能替代作者消歧。\n']
            direction_rows.append({'方向ID':d['direction_id'],'人物ID':sid,'姓名':p['name_zh'],'机构':p['institution'],
                '主类':a['name'],'主题ID':d['topic_id'],'主题':d['topic_name'],'细分方向':d['title'],'对象':'；'.join(d['objects']),
                '待回答的问题':d['reading_question'],'依据':d['evidence_label'],'时段':d['time_scope'],
                '方法待检查':a['methods_to_check'],'指标待比较':a['metrics_to_check'],'来源ID':'；'.join(d['source_ids']),
                '来源网址':' ; '.join(src[s]['url'] for s in d['source_ids']),'论文锚点':' ; '.join(d['anchor_dois'])})
        textwrite(folder/'research-map.md','\n'.join(parts))
        source_parts=[f'# {p["name_zh"]}：来源记录\n',f'核验日：{p["last_reviewed_at"]}。{p["source_note"]}\n',
          '下载成功和本次已阅读的范围分别记录。论文锚点来自旧档案时，不能解读为本次已重读全文。\n']
        for sid2 in p['source_ids']:
            s=src[sid2]
            source_parts += [f'## {s["title"]}\n',f'- 来源ID：`{sid2}`\n- [官方网址]({s["url"]})\n- 本次读取：{s["access_status"]}\n- 访问日期：{s["retrieved_at"]}\n']
            for att in s.get('attachments',[]):source_parts.append(f'- [官方附件]({att["url"]})，{att["pages"]} 页。\n')
            for f in s.get('local_files',[]):
                if f['path'].endswith('.txt'):source_parts.append(f'- [本地提取文本](../../{f["path"]})；SHA-256：`{f["sha256"]}`。\n')
            if 'local_archive' in s:source_parts.append(f'- [既有档案目录](../../../{s["local_archive"]}/)，保留原始证据分级与人工记录。\n')
        source_parts.append('\n最新单位、职位、年度招生信息以及完整论文集合仍需独立更新。')
        textwrite(folder/'source-notes.md','\n'.join(source_parts))
        newjson(folder/'papers.json',{'schema_version':'1.0','person_id':p['person_id'],'status':'use_legacy_snapshot' if p['legacy_archive'] else 'not_collected','papers':[]})
        newjson(folder/'timeline.json',{'schema_version':'1.0','person_id':p['person_id'],'events':[]})
        newjson(folder/'tasks.json',{'person_id':p['person_id'],'tasks':[
           {'task':'官方身份与方向初筛','status':'done','checked_at':p['last_reviewed_at']},
           {'task':'近五年活跃方向及身份ID消歧','status':'todo'},
           {'task':'候选全集、作者顺序与归属证据','status':'todo'},
           {'task':'五篇阅读队列与全文/SI精读','status':'todo'},
           {'task':'阶段时间线和方向证据更新','status':'todo'}]})
        newtext(folder/'notes/README.md',f'# {p["name_zh"]}：我的阅读记录\n\n这里保留你自己的问题、阅读状态与笔记；重建脚本不会覆盖。\n\n## 尚未解决的问题\n\n## 已阅读的论文\n\n## 我的理解与下一步\n\n只记录实际阅读和经历。私人内容可写入 private/ 子目录，该目录在发布范围之外。')
        newtext(folder/'fulltext/README.md','# 全文与补充信息\n\n本批尚未下载学术论文全文。取得授权或开放版本后，分别保存主文与SI，用DOI或稳定论文ID命名，并在papers.json记录来源、许可和读取状态。教师简介附件位于全库sources/raw，不等于论文全文。')
        newtext(folder/'research-plan.md',f'# {p["name_zh"]}：下一轮研究任务\n\n'+'\n'.join('- [ ] '+q for q in p['open_questions'])+'\n\n按照 ../../RESEARCH_PROTOCOL.md 执行，保留未解决问题。')
    for r in relations:
        relation_rows.append({'关系ID':r['relation_id'],'起点':people_by_id[r['from_id']]['name_zh'],'终点':people_by_id[r['to_id']]['name_zh'],
            '类型':r['type'],'说明':r['label'],'证据状态':r['status'],'详情':r['detail'],'快照共同论文数':r['snapshot_common_papers'],
            '来源ID':'；'.join(r['source_ids']),'DOI':' ; '.join(r['anchor_dois'])})
    for filename,rows in [('people',person_rows),('directions',direction_rows),('sources',source_rows),('relationships',relation_rows)]:
        csvwrite(ROOT/'exports'/f'{filename}.csv',rows,list(rows[0]))
    matrix=[{'人物ID':p['person_id'],'姓名':p['name_zh'],'机构':p['institution'],**{a['name']:sum(d['area_id']==a['id'] for d in p['directions']) for a in tax['areas']}} for p in people]
    csvwrite(ROOT/'exports/direction_matrix.csv',matrix,list(matrix[0]))
    textwrite(ROOT/'data/taxonomy.md','# 研究方向分类\n\n'+tax['note']+'\n\n'+table(['主类','主题'],[[areas[t['area_id']]['name'],t['name']] for t in tax['topics']])+ '\n\n矩阵数字仅为本批方向条目数，不能用于比较学术能力、成果数量或研究质量。')
    textwrite(ROOT/'data/research_queue.md','# 下一轮逐人研究队列\n\n'+waves['rule']+'\n\n'+table(['批次','顺序','人物','为什么现在研究'],[[wave,i+1,f'[{people_by_id[s]["name_zh"]}](../people/{s}/README.md)',people_by_id[s]['selection_reason']] for wave in ['wave_1','wave_2'] for i,s in enumerate(waves[wave])]))
    # Explicit allowlist: public navigation contains no raw source copies or personal notes.
    payload=public_data(people,tax,relations,waves,sources)
    jsonwrite(ROOT/'exports/catalog.json',payload)
    from render_catalog import render_catalog
    render_catalog(payload)
    downloads=ROOT/'site/downloads';downloads.mkdir(exist_ok=True)
    for local,public in [('学者与方向索引.xlsx','scholars-and-directions.xlsx'),('directions.csv','directions.csv'),('catalog.json','catalog.json')]:
        shutil.copyfile(ROOT/'exports'/local,downloads/public)
    jsonwrite(ROOT/'validation/build_summary.json',payload['counts'])
    print(json.dumps(payload['counts'],ensure_ascii=False))

if __name__=='__main__':main()
