from .parser import parse_list

def parse(html,url):
    return parse_list(html,url,r'/20\d{2}/\d{4}/[^/]+/page\.htm')
