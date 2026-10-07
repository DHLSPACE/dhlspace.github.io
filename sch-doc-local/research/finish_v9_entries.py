"""Reconcile hierarchy with actual archives, leaving unverifiable departments explicit."""
import json
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from research.refine_entry_coverage import STORE,OUT,classify,out_of_scope,write
from focus import relevant

def main():
    units=json.loads((STORE.root/'sources/institutions.json').read_text('utf-8'))
    before=json.loads((OUT/'institutions-before.json').read_text('utf-8'))
    original={u['id']:{e['url'] for e in u['entries']} for u in before}
    added=[]
    for unit in units:
        kept=[]
        for e in unit['entries']:
            reason=out_of_scope(e['label']) if e['url'] not in original[unit['id']] else ''
            if reason:
                e['scope_note']=reason;unit.setdefault('additional_entries',[]).append(e)
                continue
            e['group']=classify(e,unit);kept.append(e)
        unit['entries']=kept
        if not any(e['group']=='通知与附件直链' for e in kept):
            snapshots=STORE.query("SELECT snapshots.*,resources.title,sources.note FROM snapshots JOIN sources ON sources.id=snapshots.source_id LEFT JOIN resources ON resources.source_id=snapshots.source_id AND resources.url=snapshots.url WHERE sources.school=? AND snapshots.kind NOT IN ('list','异常页面') ORDER BY snapshots.created DESC",(unit['school'],))
            for row in snapshots:
                title=row['title'] or ''
                if not relevant(title) or out_of_scope(title) or '[非目标资料]' in row['note']:continue
                if not (STORE.root/row['raw_path']).is_file():continue
                if row['url'] in {e['url'] for e in kept}:continue
                e={'label':title,'url':row['url'],'kind':'原文','group':'通知与附件直链','mode':'单篇归档','status':'原件已保存','verified_at':row['created'],'source_id':row['source_id'],'snapshot_id':row['id'],'via':'本机已保存原件','sha256':row['sha256']}
                kept.append(e);added.append({'school':unit['school'],'snapshot_id':row['id'],'url':row['url']})
                if sum(e['group']=='通知与附件直链' for e in kept)>=3:break
        groups=['学校与研究所官网','研究生院与招生','化学与化工院系','相关院系与研究方向','通知与附件直链']
        unit['category_coverage']=[{'label':g,'count':sum(e['group']==g for e in kept),'status':'已整理入口，见逐项状态' if any(e['group']==g for e in kept) else '研究所按研究方向归类' if unit['tier']=='研究所' and g==groups[2] else '已检索，尚未确认独立入口'} for g in groups]
    for s in STORE.query('SELECT * FROM sources WHERE id>215'):
        reason=out_of_scope(s['name'])
        if reason and '[非目标资料]' not in s['note']:STORE.save_source({**s,'enabled':0,'note':'[非目标资料] '+reason+'；保留原件与来源记录。'},s['id'])
    write(STORE.root/'sources/institutions.json',units)
    write(OUT/'direct-links-from-archives.json',added)
    print(json.dumps({'archive_direct_links_added':len(added)},ensure_ascii=True))

if __name__=='__main__':main()
