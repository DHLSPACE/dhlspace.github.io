"""Fill faculty-level gaps and quarantine off-scope search hits without deleting originals."""
import concurrent.futures
import json
import re
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from research.expand_library import STORE,OUT,search,domain,group,write,Client,decode,Tree,clean,article,canonical,now

def out_of_scope(label):
    if re.search('博士|博后|博士后',label) and not re.search('硕士|硕博|直博|推免|免试',label):return '纯博士项目'
    if re.search('本科招生|高考|普通本科|专升本',label) and not re.search('硕士|推免',label):return '本科招生'
    if re.search('国际学生|国际研究生|留学生|来华留学|港澳台|外国留学生|International Graduate',label,re.I):return '其他申请身份'
    if re.search('法学院|商学院|经济学院|马克思主义学院|文学院|外国语学院|艺术学院|体育学院|新闻学院|数学科学学院|数学学院|计算机学院|软件学院|宇航学院|民族学与社会学学院|MBA|MPA',label,re.I):return '非化学相关院系'
    return ''

def classify(e,u):
    if e.get('kind')=='官网' or e['label'] in {'学校官网','研究所官网','官网入口'}:return '学校与研究所官网'
    label=e['label'].replace(u['school'],'')
    for alias in u.get('aliases',[]):label=label.replace(alias,'')
    # Directory names such as yjsjy2016 are not document dates; school names
    # such as Beijing University of Chemical Technology are not faculty names.
    if re.search(r'20\d{2}',label) or re.search(r'\.(pdf|docx?|xlsx?)(?:$|\?)|/t20\d{6}_|/info/\d+/\d+\.htm|/c\d+a\d+/page',e['url'],re.I):return '通知与附件直链'
    if u['tier']=='研究所':
        if re.search('研究生|招生|教育|研招|硕士',label):return '研究生院与招生'
        if urlsplit(e['url']).path in {'','/','/index.html','/index.htm'}:return '学校与研究所官网'
        return '相关院系与研究方向'
    if re.search('化学|化工',label):return '化学与化工院系'
    if re.search('材料|能源|环境|生物工程|生物化学|高分子|催化|实验室|课题组|研究方向',label):return '相关院系与研究方向'
    if re.search('研究生|招生|教育处|研招|硕士|推免',label) or re.match(r'(graduate|grs|yz|yjs)',urlsplit(e['url']).hostname or ''):return '研究生院与招生'
    return '学校与研究所官网'

from urllib.parse import urlsplit
def fill(unit):
    domains={domain(e['url']) for e in unit['entries']}|{domain(unit['url'])}
    suffix=' ('+' OR '.join('site:'+d for d in sorted(domains))+')'
    topics=[('化学与化工院系','化学 化工 学院 官网'),('相关院系与研究方向','材料 能源 环境 学院 官网')] if unit['tier']!='研究所' else [('相关院系与研究方向','研究部门 研究方向 实验室 催化 材料')]
    existing={e['url']:e for e in unit['entries']}
    client=Client(timeout=10,proxy=STORE.settings().get('proxy',''))
    report={'school':unit['school'],'queries':[],'attempts':[]}
    for target,topic in topics:
        # Re-run only categories without a verified, non-document faculty or research entry.
        covered=[e for e in unit['entries'] if classify(e,unit)==target and '失败' not in e.get('status','') and '待' not in e.get('status','') and not re.search(r'20\d{2}',e['label'])]
        if covered:continue
        query=unit['school']+' '+topic+suffix
        try:
            results=search(query);report['queries'].append({'query':query,'results':results})
            candidates=[]
            for row in results:
                url=canonical(row['url']);title=clean(row['title'])
                if not url or domain(url) not in domains or out_of_scope(title):continue
                if re.search(r'20\d{2}|\.pdf|\.doc|\.xls',title+' '+url):continue
                match=re.search('化学|化工',title) if target=='化学与化工院系' else re.search('材料|能源|环境|生物工程|研究方向|研究部门|实验室|催化|课题组',title)
                if not match:continue
                if url not in existing:
                    e={'label':title[:120],'url':url,'kind':'院系','group':target,'mode':'链接','status':'搜索发现，待核验','via':'Brave Search API','found_on':query}
                    unit['entries'].append(e);existing[url]=e
                candidates.append(existing[url])
            for e in candidates[:4]:
                attempt={'url':e['url']}
                try:
                    response=client.get(e['url'])
                    if domain(response['url']) not in domains:raise ValueError('跳转域名不属于当前单位')
                    html=decode(response['body'],response['type']);text,_=article(html,response['url'])
                    title=next((clean(n.text()) for n in Tree(html).root.walk() if n.tag=='title'),'')
                    if len(text)<80 or re.search('404|验证码|not found|access denied',title,re.I):raise ValueError('无可核验正文')
                    e.update(status='链接已核验',verified_at=now(),final_url=response['url'],group=target);e.pop('error',None)
                    attempt.update(status='可访问',title=title)
                except Exception as exc:e.update(status='本轮访问失败',error=str(exc),verified_at=now());attempt.update(status='失败',error=str(exc))
                report['attempts'].append(attempt)
        except Exception as exc:report['queries'].append({'query':query,'error':str(exc)})
    for e in unit['entries']:e['group']=classify(e,unit)
    return report

def main():
    path=STORE.root/'sources/institutions.json';units=json.loads(path.read_text('utf-8'))
    before=json.loads((OUT/'institutions-before.json').read_text('utf-8'))
    old_urls={u['id']:{e['url'] for e in u['entries']} for u in before}
    excluded=[]
    for unit in units:
        retained=[]
        for e in unit['entries']:
            reason=out_of_scope(e['label']) if e['url'] not in old_urls.get(unit['id'],set()) else ''
            if reason:
                e['scope_note']=reason;unit.setdefault('additional_entries',[]).append(e)
                excluded.append({'school':unit['school'],'url':e['url'],'reason':reason,'source_id':e.get('source_id')})
            else:retained.append(e)
        unit['entries']=retained
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:reports=list(pool.map(fill,units))
    for source in STORE.query('SELECT * FROM sources WHERE id>215'):
        reason=out_of_scope(source['name'])
        if reason:
            STORE.save_source({**source,'enabled':0,'note':'[非目标资料] '+reason+'；保留原件和检索证据，不纳入默认监控。'},source['id'])
    groups=['学校与研究所官网','研究生院与招生','化学与化工院系','相关院系与研究方向','通知与附件直链']
    for unit in units:
        unit['category_coverage']=[{'label':g,'count':sum(e['group']==g for e in unit['entries']),'status':'已整理入口，见逐项状态' if any(e['group']==g for e in unit['entries']) else '研究所按研究方向归类' if unit['tier']=='研究所' and g==groups[2] else '未确认，保留缺口'} for g in groups]
    write(path,units);write(OUT/'category-refinement.json',reports);write(OUT/'out-of-scope.json',excluded)
    print(json.dumps({'units':len(units),'additional_queries':sum(len(r['queries']) for r in reports),'off_scope_preserved':len(excluded),'missing_categories':[{'school':u['school'],'missing':[c['label'] for c in u['category_coverage'] if not c['count'] and not(u['tier']=='研究所' and c['label']==groups[2])]} for u in units if any(not c['count'] and not(u['tier']=='研究所' and c['label']==groups[2]) for c in u['category_coverage'])]},ensure_ascii=True))

if __name__=='__main__':main()
