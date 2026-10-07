"""Follow evidenced deep links missed on first pass and retain the initial audit."""
import concurrent.futures
import json
import re
import sys
import threading
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
import collect_focus as c
from network import decode
from sources.parser import canonical, Tree, clean

def main():
    keeper=c.Collector(c.STORE)
    if not keeper.acquire():raise RuntimeError('已有采集任务')
    stop=threading.Event()
    def pulse():
        while not stop.wait(30):keeper.heartbeat()
    threading.Thread(target=pulse,daemon=True).start()
    try:
        units=json.loads((c.ROOT/'sources/institutions.json').read_text('utf-8'))
        old=json.loads((c.ROOT/'sources/coverage.json').read_text('utf-8'))
        (c.ROOT/'research/focus-first-pass.json').write_text(json.dumps(old,ensure_ascii=False,indent=2),'utf-8')
        c.REPORT.extend(old)
        portals=json.loads((c.ROOT/'sources/portals.json').read_text('utf-8'))
        jobs=[];targets={}
        for u in units:
            report=next((r for r in old if r['id']==u['id']),{})
            # Supplement missing institutes and faculty layers using links in saved official pages.
            entries=[]
            need=not report.get('sources')
            for a in report.get('attempts',[]):
                if not a.get('evidence'):continue
                if not need and not any(e['url']==a['url'] and e.get('kind')=='院系' for e in u['entries']):continue
                for n in Tree(decode((c.ROOT/a['evidence']).read_bytes())).root.walk():
                    label=clean(n.text()) if n.tag=='a' else ''
                    if not 2<=len(label)<=18 or not re.search('硕士|研究生|研考|招生信息|招生简章|招生通知|全国统考|推荐免试',label) or re.search('博士|留学|同等学力',label):continue
                    url=canonical(n.attrs.get('href',''),a.get('final_url',a['url']))
                    if not url or not c.belongs(url,u):continue
                    if any(x['url']==url for x in entries):continue
                    entries.append(dict(label=label,url=url,kind='研究所' if u['tier']=='研究所' else '院系' if not need else '校级',mode='监控',status='待核验',found_on=a['url']))
            entries.sort(key=lambda e:(not bool(re.search('硕士|全国统考|推免|招生信息',e['label'])),len(e['label'])))
            if entries:
                job={**u,'entries':entries[:3]};jobs.append(job);targets[u['id']]=u
        known=[
          ('cas-ibp','硕士招生','https://ibp.cas.cn/2020jyc/zs/sszs/'),
          ('zju','研究生招生','https://www.grs.zju.edu.cn/yjszs/'),
          ('zju','化学工程与生物工程学院','http://che.zju.edu.cn/checn/'),
          ('dlut','化学学院','https://chem.dlut.edu.cn/'),
        ]
        for code,label,url in known:
            u=next(u for u in units if u['id']==code)
            job=next((j for j in jobs if j['id']==code),None)
            e=dict(label=label,url=url,kind='院系' if '学院' in label else '校级',mode='监控',status='待核验',evidence_note='官方搜索结果与校内链接核对')
            if job:job['entries'].insert(0,e)
            else:jobs.append({**u,'entries':[e]});targets[code]=u
        for code,label,url,province in [
          ('bj','北京教育考试院','https://www.bjeea.cn/html/yk/index.html','北京'),
          ('tj','天津市教育招生考试院','http://www.zhaokao.net/ykxk/index.shtml','天津'),
          ('js','江苏省教育考试院','https://www.jseea.cn/webfile/examination/graduateenrollment/','江苏'),
          ('gd','广东省教育考试院','https://eea.gd.gov.cn/yjsks/index.html','广东'),
          ('ln','辽宁招生考试之窗','https://www.lnzsks.com/listinfo/yjs_1.html','辽宁'),
          ('ah','安徽省教育招生考试院','https://www.ahzsks.cn/zhaokao/search.jsp?c=23','安徽'),
          ('jx','江西省教育考试院','https://yz.chsi.com.cn/kyzx/kydt/202510/20251009/2293437645.html','江西'),
        ]:
            e=dict(label=label+' · 研究生考试' if code!='jx' else '江西省2026年硕士报名公告（研招网转载）',url=url,kind='招生栏目',group='地方政策',province=province,mode='监控' if code!='jx' else '单篇归档',status='待核验',note='由本机构官网导航定位的研究生栏目。' if code!='jx' else '江西官网连接失败，保存研招网标注来源为江西省教育考试院的官方转载，2026 年历史参考。')
            portals.append(e);jobs.append(dict(id='policy-deep-'+code,school=label,policy=True,entries=[e]))
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures={pool.submit(c.examine,u):u for u in jobs}
            for f in concurrent.futures.as_completed(futures):
                job=futures[f]
                try:f.result()
                except Exception as exc:print(job['school'],str(exc),flush=True)
                if job['id'] in targets:
                    target=targets[job['id']]
                    urls={e['url'] for e in target['entries']}
                    for e in job['entries']:
                        if e['url'] in urls:
                            next(x for x in target['entries'] if x['url']==e['url']).update(e)
                        else:target['entries'].append(e);urls.add(e['url'])
                    target['verified_at']=c.now()
        # Repair original monitor statuses and refresh their relevant resources.
        for source in c.STORE.query('SELECT * FROM sources WHERE id<=18 AND enabled=1'):
            collector=c.Collector(c.STORE,client=c.CachedClient());collector.check_source(source,pages=2)
        # Prevent cross-institution links from becoming mislabeled monitors.
        audit=[]
        for source in c.STORE.query('SELECT * FROM sources WHERE id>18'):
            u=next((u for u in units if source['school']==u['school']),None)
            if u and not c.belongs(source['url'],u):
                c.STORE.execute('UPDATE sources SET enabled=0,note=? WHERE id=?',('本轮审计暂停：跨校外链需重新核对归属，旧记录保留。',source['id']))
                audit.append(dict(id=source['id'],school=source['school'],url=source['url']))
        (c.ROOT/'research/focus-cross-domain-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2),'utf-8')
        for u in units:
            # Navigation remains compact: root/faculty/list links, not individual news and job ads.
            u['entries']=[e for e in u['entries'] if not e.get('found_on') or e.get('source_id') or len(e['label'])<24 and not re.search(r'20\d{2}|招聘|博士',e['label'])]
            n=c.STORE.query('SELECT COUNT(*) n FROM sources WHERE school=? AND enabled=1',(u['school'],))[0]['n']
            u['entry_status']='已核验并接入招生栏目' if n else '仅官网链接；招生栏目仍待识别或访问受限'
        # Latest report per institution aggregates all attempted pages, not duplicate coverage counts.
        grouped={}
        for row in c.REPORT:
            if row['id'] not in grouped:grouped[row['id']]={**row,'attempts':[],'sources':[]}
            g=grouped[row['id']];g['attempts']+=row.get('attempts',[]);g['sources']=sorted(set(g['sources']+row.get('sources',[])));g['finished']=row.get('finished','')
        c.save_json(c.ROOT/'sources/institutions.json',units);c.save_json(c.ROOT/'sources/portals.json',portals);c.save_json(c.ROOT/'sources/coverage.json',list(grouped.values()))
        # Persist final source states/rules without re-enabling old entries at next startup.
        from storage import SOURCE_FIELDS
        c.save_json(c.ROOT/'sources/custom.json',[{k:r[k] for k in SOURCE_FIELDS} for r in c.STORE.query('SELECT * FROM sources ORDER BY id')])
        c.STORE.export()
    finally:
        stop.set();c.STORE.execute("DELETE FROM leases WHERE name='collector' AND owner=?",(keeper.owner,))

if __name__=='__main__':main()
