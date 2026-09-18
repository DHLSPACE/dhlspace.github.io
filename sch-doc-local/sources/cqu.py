from .parser import parse_list

def parse(html,url):
    return parse_list(html,url,r'(?:/info/\d+/\d+\.htm|/news/20\d{2}-\d{2}/\d+\.html)')
