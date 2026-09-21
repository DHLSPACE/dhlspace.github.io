"""Verify alternate faculty affiliations without inventing independent chemistry schools."""
import json
import re
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from storage import Store,now
from network import Client,decode
from sources.parser import article

def main():
    store=Store();path=store.root/'sources/institutions.json';units=json.loads(path.read_text('utf-8'));report=[]
    targets=[('中央民族大学','https://cles.muc.edu.cn/','生命与环境科学学院'),('电子科技大学','http://materials.uestc.edu.cn/','材料与能源学院'),('国防科技大学','https://www.nudt.edu.cn/bkzs/yxzy/xkzyjs/lxy1/index.htm','理学院学科介绍')]
    for school,url,label in targets:
        row={'school':school,'url':url,'label':label,'checked':now()}
        try:
            r=Client(timeout=12,proxy=store.settings().get('proxy','')).get(url);text,_=article(decode(r['body'],r['type']),r['url'])
            contexts=[text[max(0,m.start()-35):m.end()+65] for m in re.finditer('化学|材料',text)]
            row.update(status='可访问',contexts=contexts[:10])
            if '化学' in text and len(text)>200:
                unit=next(u for u in units if u['school']==school)
                e=next((e for e in unit['entries'] if e['url']==url),None)
                if not e:
                    e={'url':url};unit['entries'].append(e)
                e.update(label=label+' · 化学相关学科线索',kind='学科归属',group='化学与化工院系',mode='链接',status='学科页面已核验',verified_at=now(),final_url=r['url'],note='官网页面提及化学；这是学科归属线索，不表示存在独立化学院，也不确认本年度研究生招生资格。',via='Brave定向检索后原站核验')
                for c in unit['category_coverage']:
                    c['count']=sum(x['group']==c['label'] for x in unit['entries']);c['status']='已有学科归属线索，见入口说明' if c['count'] else '已检索，尚未确认独立入口'
        except Exception as exc:row.update(status='未确认',error=str(exc))
        report.append(row)
    path.write_text(json.dumps(units,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (store.data/'expansion-20260921/discipline-affiliations.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(report,ensure_ascii=True))

if __name__=='__main__':main()
