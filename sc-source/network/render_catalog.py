"""Re-render only catalog presentation from the reviewed public JSON snapshot."""
from pathlib import Path
import json

ROOT=Path(__file__).resolve().parents[1]

def textwrite(path, text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf-8')

def render_catalog(payload=None):
    if payload is None:
        payload=json.loads((ROOT/'exports/catalog.json').read_text(encoding='utf-8'))
    template=(ROOT/'tools/catalog.html').read_text(encoding='utf-8')
    app=(ROOT/'tools/catalog.js').read_text(encoding='utf-8')
    data=json.dumps(payload,ensure_ascii=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    assets=ROOT.parent/'sc-site/src'
    template=template.replace('/* NETWORK_GRAPH_CSS */',(assets/'network-graph.css').read_text(encoding='utf-8')).replace('/* NETWORK_GRAPH_APP */',(assets/'network-graph.js').read_text(encoding='utf-8'))
    document=template.replace('/* CATALOG_DATA */',f'const D = {data};').replace('/* CATALOG_APP */',app)
    local_links='<div class="library-links"><a href="https://162383.xyz/sc/">← 四人论文与阅读档案</a><a href="exports/学者与方向索引.xlsx" download>Excel索引 ↓</a><a href="exports/directions.csv" download>方向CSV ↓</a><a href="exports/catalog.json" download>公开JSON ↓</a></div>'
    public_links='<div class="library-links"><a href="../">← 返回SC研究知识库</a><a href="./downloads/scholars-and-directions.xlsx" download>Excel索引 ↓</a><a href="./downloads/directions.csv" download>方向CSV ↓</a><a href="./downloads/catalog.json" download>公开JSON ↓</a></div>'
    if payload['counts'].get('physics_papers'):
        local_links=local_links.replace('<a href="exports/catalog.json"', '<a href="exports/physics-papers.csv" download>物理论文CSV ↓</a><a href="exports/catalog.json"')
        public_links=public_links.replace('<a href="./downloads/catalog.json"', '<a href="./downloads/physics-papers.csv" download>物理论文CSV ↓</a><a href="./downloads/catalog.json"')
    textwrite(ROOT/'index.html',document.replace('<!-- LIBRARY_LINKS -->',local_links))
    textwrite(ROOT/'site/index.html',document.replace('<!-- LIBRARY_LINKS -->',public_links));textwrite(ROOT/'site/.nojekyll','')
    return payload['counts']

if __name__=='__main__':
    print(json.dumps({'mode':'frontend-only',**render_catalog()},ensure_ascii=False))
