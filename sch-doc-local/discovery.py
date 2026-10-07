"""Discover candidates, prove a repeatable rule, then persist only a confirmed preview."""
import base64
import hashlib
import json
import re
import secrets
import threading
import time
import urllib.request
import urllib.error
from urllib.parse import parse_qs, quote, urlsplit
from network import Client, decode
from sources.parser import Tree, canonical, clean, published_date
from storage import now

NAV = re.compile('通知|公告|招生|研究生|硕士|推免')
TYPES = ['学院官网', '研究院/研究所', '学校研招网', '监管机构', '其他']


def metadata(name):
    match = re.search(r'^(.+?大学)', name)
    school = match[1] if match else name.split(' · ')[0]
    kind = ('监管机构' if re.search('教育部|教育厅', name) else
            '研究院/研究所' if re.search('研究所|研究院', name) else
            '学院官网' if '学院' in name else '学校研招网')
    return {'school': school, 'source_type': kind}


def signature(node):
    return {'tag': node.tag, 'id': node.attrs.get('id', ''),
            'classes': sorted(c for c in node.attrs.get('class', '').split()
                              if not re.search(r'\d|active|first|last|odd|even', c))}


def ancestry(node):
    result = []
    while node and node.tag not in {'root', 'html', 'body'}:
        result.append(signature(node))
        if node.attrs.get('id') or len(result) >= 4:
            break
        node = node.parent
    return result


def matches(node, path):
    for spec in path:
        if node is None or node.tag != spec['tag']:
            return False
        if spec.get('id') and node.attrs.get('id') != spec['id']:
            return False
        if not set(spec.get('classes', [])).issubset(node.attrs.get('class', '').split()):
            return False
        node = node.parent
    return True


def parse_rule(html, base, rule):
    if rule.get('version') != 1 or not rule.get('anchor_path'):
        raise ValueError('解析规则无效，请重新试抓')
    items = {}
    for node in Tree(html).root.walk():
        if node.tag != 'a' or not matches(node, rule['anchor_path']):
            continue
        url = canonical(node.attrs.get('href', ''), base)
        title = clean(node.attrs.get('title') or node.text())
        date = published_date(node)
        if url and url != base and len(title) >= 7 and date:
            items[url] = dict(url=url, title=title, published=date)
    return list(items.values())


def infer(html, base):
    groups = {}
    for node in Tree(html).root.walk():
        if node.tag != 'a' or not published_date(node):
            continue
        if len(clean(node.attrs.get('title') or node.text())) < 7:
            continue
        path = ancestry(node)
        key = json.dumps(path, sort_keys=True)
        groups.setdefault(key, {'version': 1, 'anchor_path': path})
    ranked = []
    for rule in groups.values():
        items = parse_rule(html, base, rule)
        if len(items) >= 2:
            ranked.append((len(items), sum(bool(NAV.search(i['title'])) for i in items), rule, items))
    if not ranked:
        return None, []
    _, _, rule, items = max(ranked, key=lambda x: (x[1] > 0, x[0], x[1]))
    return rule, items


def navigation(html, base):
    host = urlsplit(base).hostname
    # Campus subdomains are candidates, never silently adopted.
    domain = '.'.join(host.split('.')[-3:]) if host.endswith('.edu.cn') else host
    found = {}
    for node in Tree(html).root.walk():
        if node.tag != 'a':
            continue
        title = clean(node.text())
        url = canonical(node.attrs.get('href', ''), base)
        target = urlsplit(url).hostname or ''
        if (url and url != base and NAV.search(title) and len(title) < 50
                and (target == domain or target.endswith('.' + domain))):
            found[url] = dict(title=title, url=url, via='官网导航，待试抓')
    return list(found.values())[:16]


class Discovery:
    def __init__(self, store, client=None):
        self.store = store
        self.client = client
        self.previews = {}
        self.lock = threading.Lock()

    def network(self):
        return self.client or Client(timeout=15, proxy=self.store.settings().get('proxy', ''))

    def search(self, query):
        query = clean(query)[:120]
        if not query:
            raise ValueError('请输入校名、学院名或网址')
        catalog_path = self.store.root/'sources'/'catalog.json'
        catalog = json.loads(catalog_path.read_text('utf-8')) if catalog_path.exists() else []
        candidates = []
        for row in catalog:
            names = [row['school']] + row.get('aliases', [])
            if any(n in query or query in n for n in names):
                candidates.append(dict(title=row['name'], url=row['url'], school=row['school'],
                                       source_type=row['source_type'], via='已整理官网入口，仍须实时试抓'))
        search_url = 'https://www.bing.com/search?q=' + quote(query + ' 研究生招生 通知公告')
        from library import institutions
        for row in institutions(self.store):
            if any(n in query or query in n for n in [row['school']]+row.get('aliases',[])):
                for entry in row.get('entries',[]):
                    candidates.append(dict(title=row['school']+' · '+entry['label'],url=entry['url'],school=row['school'],source_type='学院官网' if entry.get('kind')=='院系' else '研究院/研究所' if row['tier']=='研究所' else '学校研招网',via=entry.get('status','待核验')))
                candidates.append(dict(title=row['school']+' · 官网入口',url=row['url'],school=row['school'],
                    source_type='研究院/研究所' if row['tier']=='研究所' else '学校研招网',via=row['entry_status']))
        if candidates:
            return dict(kind='candidates',candidates=list({x['url']:x for x in candidates}.values()),
                warning='已找到本地目录入口，无需搜索 API。请选择具体栏目试抓核验。',search_url=search_url)
        warning = ''
        key = self.store.settings().get('search_api_key', '')
        if key:
            try:
                candidates += self.search_api(query, key)
                if not any(x['via'].startswith('Brave') for x in candidates):
                    warning = '联网搜索已返回，但没有符合官网域名条件的候选入口。'
            except Exception as exc:
                warning = '搜索 API 不可用：' + str(exc) + '。请检查设置中的搜索密钥与网络，或打开浏览器搜索。'
            return dict(kind='candidates', candidates=list({x['url']:x for x in candidates}.values())[:16],warning=warning,search_url=search_url)
        try:
            response = self.network().get(search_url)
            tree = Tree(decode(response['body'], response['type']))
            for node in tree.root.walk():
                if node.tag != 'a' or not node.parent or node.parent.tag != 'h2':
                    continue
                url = canonical(node.attrs.get('href', ''), response['url'])
                if '/ck/a' in url and (urlsplit(url).hostname or '').endswith('bing.com'):
                    value = parse_qs(urlsplit(url).query).get('u', [''])[0]
                    if value.startswith('a1'):
                        try:
                            url = canonical(base64.urlsafe_b64decode(value[2:] + '=' * (-len(value[2:]) % 4)).decode())
                        except (ValueError, UnicodeError):
                            continue
                host = urlsplit(url).hostname or ''
                if host.endswith(('.edu.cn', '.ac.cn', '.gov.cn')):
                    candidates.append(dict(title=clean(node.text()), url=url, via='Bing 实时搜索，待试抓'))
            if not any(x['via'].startswith('Bing') for x in candidates):
                warning = '搜索引擎未返回可解析的官网结果（可能受限或无结果）；已整理入口并非实时搜索结果。可打开搜索后粘贴官网网址。'
        except Exception as exc:
            warning = '实时搜索不可用：' + str(exc) + '。可在设置中配置 Brave Search API 密钥，或打开搜索后粘贴官网网址。'
        unique = {x['url']: x for x in candidates}
        return dict(kind='candidates', candidates=list(unique.values())[:16], warning=warning, search_url=search_url)

    def search_api(self, query, key):
        """Documented search API. Key stays in the local DB and never follows redirects."""
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            handler_order=100
            def redirect_request(self,req,fp,code,msg,headers,newurl):
                raise ValueError('搜索 API 返回非预期重定向，已停止')
        client=self.network()
        client.opener.add_handler(NoRedirect())
        request=urllib.request.Request('https://api.search.brave.com/res/v1/web/search?count=10&q='+quote(query+' 研究生招生 通知公告'),headers={'Accept':'application/json','X-Subscription-Token':key})
        with client.opener.open(request,timeout=15) as response:
            body=response.read(2*1024*1024+1)
            if len(body)>2*1024*1024:
                raise ValueError('搜索结果超过读取上限')
            result=json.loads(body)
        candidates=[]
        for row in result.get('web',{}).get('results',[]):
            url=canonical(str(row.get('url','')))
            if (urlsplit(url).hostname or '').endswith(('.edu.cn','.ac.cn','.gov.cn')):
                candidates.append(dict(title=str(row.get('title','')),url=url,via='Brave Search API 实时搜索，待试抓'))
        return candidates

    def preview(self, url, kind='list', rule=None):
        url = canonical(url)
        if not url:
            raise ValueError('请输入有效的 HTTP/HTTPS 网址')
        if kind not in {'list', 'page', 'file'}:
            raise ValueError('页面用途无效')
        response = self.network().get(url)
        html = decode(response['body'], response['type']) if kind != 'file' else ''
        if re.search(r'/login|sso\.|cas_login', response['url'], re.I) or re.search('验证码|access denied|checking your browser', html, re.I):
            raise ValueError('网站要求登录或验证，不能确认为可监控来源')
        title = next((clean(n.text()) for n in Tree(html).root.walk() if n.tag == 'title'), '')
        if kind == 'list':
            if urlsplit(response['url']).path in {'/', '/index.html', '/index.htm', '/main.htm'}:
                candidates = navigation(html, response['url'])
                if candidates:
                    return dict(kind='candidates', candidates=candidates,
                                warning='这是门户入口，请选择具体通知或招生栏目后继续试抓。', search_url='')
            if rule:
                items = parse_rule(html, response['url'], rule)
            else:
                rule, items = infer(html, response['url'])
            if len(items) < 2:
                candidates = navigation(html, response['url'])
                return dict(kind='candidates', candidates=candidates, warning='未识别出至少两条重复结构的标题、日期和链接。请选择栏目继续试抓；动态页面或结构不规则时暂不添加。', search_url='')
        elif kind == 'page':
            from sources.parser import article
            text, _ = article(html, response['url'])
            if len(text) < 80 or 'html' not in response['type'].lower():
                raise ValueError('没有识别到有效网页正文')
            items = [dict(title=title or '单篇正文', published='', url=response['url'], excerpt=text[:500])]
        else:
            body = response['body']
            if not (body.startswith((b'%PDF', b'PK\x03\x04', b'\xd0\xcf\x11\xe0'))):
                raise ValueError('未识别为 PDF、Office 或 ZIP 文件，暂不添加')
            items = [dict(title=urlsplit(url).path.split('/')[-1], published='', url=response['url'])]
        token = secrets.token_urlsafe(24)
        result = dict(kind='preview', preview_token=token, url=url, final_url=response['url'],
                      title=title, page_kind=kind, rule=rule or {}, items=items, count=len(items),
                      verified_at=now(), sha256=hashlib.sha256(response['body']).hexdigest())
        with self.lock:
            self.previews = {k:v for k,v in self.previews.items() if v[0] > time.time()}
            if len(self.previews) >= 100:
                self.previews.pop(next(iter(self.previews)))
            self.previews[token] = (time.time()+900, result)
        return result

    def confirmed(self, token, url, kind):
        with self.lock:
            entry = self.previews.get(token)
            if not entry or entry[0] < time.time():
                raise ValueError('请先试抓并核对结果；预览有效期15分钟')
            result = entry[1]
            if result['url'] != url or result['page_kind'] != kind:
                raise ValueError('网址或用途已改变，请重新试抓')
            return result
