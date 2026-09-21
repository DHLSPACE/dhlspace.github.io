"""Verify the complete published UI without using any local collection API."""
import json
import os
import subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
CLI=ROOT/'research/browser-qa/node_modules/agent-browser/bin/agent-browser-win32-x64.exe'
BASE=os.environ.get('ATLAS_PUBLIC_URL','http://127.0.0.1:8772/sch-doc/')
checks=[]
def run(*args):
    p=subprocess.run([str(CLI),'--session','atlas-v9',*args],capture_output=True,text=True,encoding='utf-8',timeout=55)
    if p.returncode:raise RuntimeError(p.stdout+p.stderr)
    return p.stdout.strip()
def ev(code):return run('eval',code)
def check(name,code):
    actual=ev(code)
    if actual!='true':raise AssertionError(name+': '+actual)
    checks.append(name);print(name,flush=True)
def main():
    run('set','viewport','1440','1000');run('open',BASE);run('reload');run('wait','--fn',"typeof data!=='undefined'&&data?.meta?.version===9")
    check('public v9 expanded data',"isPublicRuntime&&data.snapshots.length===2021&&data.institutions.length===85")
    check('public AI evidence available',"Object.keys(data.ai_summaries).length>=12&&Object.values(data.ai_summaries).every(a=>a.sha256&&a.url&&a.basis)")
    ev("go('sources');theme='light';applyTheme();window.scrollTo(0,0)")
    check('monitor groups and pagination',"document.querySelectorAll('.monitor-unit').length===12&&document.querySelector('#monitor-page').max>1")
    check('private controls hidden',"getComputedStyle(document.querySelector('[data-open-research]')).display==='none'&&getComputedStyle(document.querySelector('.monitor-source-settings')).display==='none'")
    run('select','#monitor-size','6');run('select','#monitor-expand','1')
    check('public monitor page controls',"document.querySelectorAll('.monitor-unit').length===6&&document.querySelectorAll('.monitor-unit[open]').length===1")
    ev("document.querySelector('[data-monitor-page=\"2\"]').click()")
    check('second page',"monitorPrefs.page===2")
    ev("go('directory');directoryFilter='all';document.querySelector('#directory-reset').click();renderDirectory();document.querySelector('[data-card-open]').click();document.querySelector('[data-context=next]').click()")
    check('public card hierarchy',"!!cardBrowse.unit&&cardBrowse.year!==null")
    # Select an actual published summary through the same institution hierarchy.
    ev("const summary=Object.values(data.ai_summaries)[0],snapshot=data.snapshots.find(s=>s.id===summary.snapshot_id),source=data.sources.find(s=>s.id===snapshot.source_id),unit=data.institutions.find(u=>ownsSource(u,source));document.querySelector('#directory-search').value=unit.school;directoryPage=1;renderDirectory();document.querySelector('[data-card-open]').click();const record=cardRecords(unit).find(r=>r.versions.some(v=>v.id===summary.snapshot_id));cardBrowse.year=record.year;cardBrowse.record=record.key;cardBrowse.version=summary.snapshot_id;renderCardBrowser();")
    run('wait','[data-ai-summary]');run('click','[data-ai-summary]')
    check('published summary opens without API',"document.querySelector('#ai-dialog').open&&document.querySelector('#ai-answer').textContent.length>100")
    run('screenshot',str(ROOT/'data/v9-public-ai.png'));run('click','[data-close-ai]')
    ev("go('sources');document.querySelector('#monitor-fold').click();window.scrollTo(0,0)")
    run('screenshot',str(ROOT/'data/v9-public-desktop.png'))
    run('set','viewport','390','844');run('scroll','down','450');run('wait','400')
    check('public mobile navigation fades',"document.body.classList.contains('mobile-header-away')")
    run('scroll','up','150');run('wait','400')
    check('public mobile navigation restores',"!document.body.classList.contains('mobile-header-away')")
    check('public mobile no overflow',"document.documentElement.scrollWidth<=innerWidth")
    ev("theme='dark';applyTheme()")
    run('screenshot',str(ROOT/'data/v9-public-mobile.png'))
    check('no localhost collection calls',"!performance.getEntriesByType('resource').some(r=>new URL(r.name).pathname.startsWith('/api/'))")
    check('public secret isolation',"!JSON.stringify(data.settings).includes('api_key')&&data.notes.every(n=>n.id<0)")
    errors=run('errors')
    if errors:raise AssertionError(errors)
    (ROOT/'data/v9-public-browser.json').write_text(json.dumps({'url':BASE,'checks':checks},ensure_ascii=False,indent=2),encoding='utf-8')
    print('PASS '+str(len(checks)))
if __name__=='__main__':main()
