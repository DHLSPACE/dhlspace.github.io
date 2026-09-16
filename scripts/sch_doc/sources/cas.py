from .parser import parse_list

def parse(html,url):
    return parse_list(html,url,r'(?:/info/\d+/\d+\.htm|/t20\d{6}_\d+\.html?)')
