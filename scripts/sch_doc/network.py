"""限速、超时、大小上限、robots 检查；不绕过登录和验证码。"""
import codecs
import re
import threading
import time
import urllib.error
import urllib.request
import urllib.robotparser
from urllib.parse import urlsplit
from sources.parser import canonical

USER_AGENT = 'GraduateArchive/1.0 (personal academic information archiving)'

def decode(body, content_type=''):
    guesses = re.findall(r'charset\s*=\s*["\x27]?([\w-]+)',content_type,re.I)
    guesses += re.findall(r'charset\s*=\s*["\x27]?([\w-]+)',body[:4096].decode('ascii','ignore'),re.I)
    for encoding in guesses + ['utf-8-sig','gb18030']:
        try:
            codecs.lookup(encoding)
            return body.decode(encoding)
        except (LookupError,UnicodeError):
            pass
    return body.decode('utf-8','replace')

class Client:
    def __init__(self, timeout=20, proxy=''):
        # 默认使用 urllib / Windows 的公开系统代理设置。可在设置中指定本地代理。
        handlers = []
        if proxy == 'direct':
            handlers.append(urllib.request.ProxyHandler({}))
        elif proxy:
            if not canonical(proxy):
                raise ValueError('代理地址必须为 http(s)://主机:端口')
            handlers.append(urllib.request.ProxyHandler({'http':proxy,'https':proxy}))
        self.opener = urllib.request.build_opener(*handlers)
        self.timeout, self.last, self.robots = timeout, {}, {}
        self.lock = threading.Lock()

    def raw(self,url,limit=25*1024*1024):
        url = canonical(url)
        if not url:
            raise ValueError('只支持公开 HTTP/HTTPS 地址')
        host = urlsplit(url).netloc
        with self.lock:
            time.sleep(max(0,1.0-(time.monotonic()-self.last.get(host,0))))
            self.last[host] = time.monotonic()
        request = urllib.request.Request(url,headers={'User-Agent':USER_AGENT,'Accept':'*/*'})
        with self.opener.open(request,timeout=self.timeout) as response:
            if not canonical(response.url):
                raise ValueError('重定向地址无效')
            body = response.read(limit+1)
            if len(body)>limit:
                raise ValueError('文件超过25MB自动保存上限，请从原网页手动下载')
            return {'body':body,'url':response.url,'status':response.status,'type':response.headers.get('Content-Type',''),'headers':dict(response.headers)}

    def get(self,url):
        parts = urlsplit(url)
        origin = parts.scheme+'://'+parts.netloc
        if origin not in self.robots:
            parser = urllib.robotparser.RobotFileParser()
            try:
                response = self.raw(origin+'/robots.txt',1024*1024)
                parser.parse(decode(response['body'],response['type']).splitlines())
            except urllib.error.HTTPError as exc:
                if exc.code in {404,410}:
                    parser.parse([])
                elif exc.code in {401,403}:
                    parser.parse(['User-agent: *','Disallow: /'])
                else:
                    raise RuntimeError(f'robots.txt 返回 HTTP {exc.code}，本次暂停该站抓取') from exc
            self.robots[origin] = parser
        if not self.robots[origin].can_fetch(USER_AGENT,url):
            raise RuntimeError('网站 robots.txt 不允许自动读取，请手动保存')
        return self.raw(url)

def friendly_error(exc):
    text = str(exc)
    if text.startswith(('HTTPS连接失败；','网络权限被当前运行环境阻止；')):
        return text
    if '10013' in text:
        return '网络权限被当前运行环境阻止；请在本机双击启动后重试。'+text
    if 'SSL' in text or 'EOF' in text:
        return 'HTTPS连接失败；请检查浏览器能否访问、VPN/系统代理或换网络后重试。'+text
    return text
