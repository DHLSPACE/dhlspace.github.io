"""仅使用 Python 标准库；解析静态页面，不运行网站脚本。"""
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, urlunsplit

DATE = re.compile(r'(?<!\d)(20\d{2})\s*[-./年]\s*(\d{1,2})\s*[-./月]\s*(\d{1,2})(?:日)?')
VOID = {'area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'}
FILE = re.compile(r'\.(pdf|docx?|xlsx?|csv|zip|rar|png|jpe?g)(?:$|[?#])', re.I)

class Node:
    def __init__(self, tag='', attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def text(self):
        if self.tag in {'script','style','noscript'}:
            return ''
        return ' '.join(x if isinstance(x,str) else x.text() for x in self.children)

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child,Node):
                yield from child.walk()

class Tree(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Node('root')
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        # HTML 的省略结束标签通常只出现在这些同级元素中。
        if tag in {'li','tr','td','p'} and self.current.tag == tag:
            self.current = self.current.parent
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag,attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, value):
        self.current.children.append(value)

def clean(value):
    return re.sub(r'\s+',' ',value).strip()

def canonical(url, base=''):
    parts = urlsplit(urljoin(base,url.strip()))
    if parts.scheme not in {'http','https'} or not parts.hostname or parts.username or parts.password:
        return ''
    return urlunsplit((parts.scheme,parts.netloc,parts.path or '/',parts.query,''))

def published_date(node):
    """优先取链接之外的日期，防止把标题中的历史事件日期当发布日期。"""
    parent = node.parent
    for _ in range(4):
        if parent is None or parent.tag in {'body','html','root'}:
            break
        anchors = [n for n in parent.walk() if n.tag == 'a']
        if len(anchors) > 4:
            break
        candidates = [clean(n.text()) for n in parent.walk() if n.tag in {'span','time','em','i','small'} and n is not node]
        candidates.append(clean(parent.text()).replace(clean(node.text()), ''))
        for text in candidates:
            match = DATE.search(text)
            if match:
                y,m,d = map(int,match.groups())
                try:
                    return __import__('datetime').date(y,m,d).isoformat()
                except ValueError:
                    pass
        parent = parent.parent
    return ''

def parse_list(html, base, pattern=''):
    tree = Tree(html)
    items = {}
    for node in tree.root.walk():
        if node.tag != 'a':
            continue
        url = canonical(node.attrs.get('href',''),base)
        title = clean(node.attrs.get('title') or node.text())
        if not url or len(title) < 7 or title.startswith(('上一条','下一条','当前位置')):
            continue
        date = published_date(node)
        if pattern and not re.search(pattern,url,re.I):
            continue
        # 首批官网列表均显示发布日期。没有日期时宁可要求维护，避免把导航当通知。
        if not date:
            continue
        items[url] = {'url':url,'title':title,'published':date}
    return list(items.values())

def next_page(html, base):
    for node in Tree(html).root.walk():
        if node.tag == 'a' and clean(node.text()) in {'下页','下一页','下一页>>','下页>','下一页 >','下一页 > >'}:
            url = canonical(node.attrs.get('href',''),base)
            if url and urlsplit(url).hostname == urlsplit(base).hostname and url != base:
                return url
    return ''

def article(html, base):
    tree = Tree(html)
    roots = [n for n in tree.root.walk() if any(t in (n.attrs.get('id','')+' '+n.attrs.get('class','')).split() for t in ['v_news_content','wp_articlecontent','TRS_Editor','article-content','article_content','contentstyle'])]
    root = max(roots,key=lambda n:len(n.text())) if roots else tree.root
    text = clean(root.text())
    text = re.sub(r'(浏览次数|访问量|点击次数|点击量)\s*[:：]?\s*\d*','',text)
    assets = {}
    for node in tree.root.walk():
        for attr in ['href','src','data','value','pdfsrc']:
            raw = node.attrs.get(attr,'')
            if not raw or not FILE.search(raw):
                continue
            is_image = bool(re.search(r'\.(png|jpe?g)(?:$|[?#])',raw,re.I))
            if is_image and (not roots or node not in list(root.walk())):
                continue
            url = canonical(raw,base)
            if url:
                assets[url] = clean(node.attrs.get('title') or node.attrs.get('alt') or node.text()) or ('正文图片' if is_image else '附件')
    # 高校 PDF 阅读器常将地址写在普通字符串参数中；只提取静态文件地址。
    for raw in re.findall(r'''["']([^"'<>\s]+\.(?:pdf|docx?|xlsx?)(?:\?[^"'<>\s]*)?)["']''',html,re.I):
        url = canonical(raw,base)
        if url:
            assets.setdefault(url,'嵌入附件')
    return text, [{'url':u,'title':t} for u,t in assets.items()]
