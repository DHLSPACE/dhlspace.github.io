from .parser import parse_list

def parse(html,url):
    return parse_list(html,url,r'(?:/info/\d+/\d+\.htm|wbnewsid=|/[^/]+/[a-f0-9]{32}\.htm)')
