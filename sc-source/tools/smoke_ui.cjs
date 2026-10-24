/* Node VM smoke checks: route rendering, real data filters and reading persistence.
 * This is not a browser or visual-layout test. No runtime dependencies.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../dist/sc');
const events = {}, windowEvents = {}, els = new Map(), storage = new Map();
class Element {
  constructor(id = '') { this.id = id; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.dataset = {}; this.open = false; this.tagName = 'DIV'; this.isConnected = true; this.classes = new Set(); this.classList = {add: c => this.classes.add(c),remove:c => this.classes.delete(c),toggle:(c,on) => on ? this.classes.add(c) : this.classes.delete(c)}; }
  addEventListener(name, fn) { this[name] = fn; }
  querySelector(selector) { this.children ||= new Map(); if (!this.children.has(selector)) this.children.set(selector,new Element(selector)); return this.children.get(selector); }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; }
  focus() {}
  blur() {}
  append(child) { els.set('#' + child.id, child); }
  scrollIntoView() {}
  remove() {}
  click() {}
}
const main = new Element('main'); els.set('#main', main);
const document = {
  querySelector: selector => {
    if (selector === '#paper-results' && !main.innerHTML.includes('id="paper-results"')) return null;
    if (!els.has(selector)) els.set(selector,new Element(selector));
    return els.get(selector);
  },
  addEventListener: (type, fn) => { (events[type] ||= []).push(fn); },
  createElement: () => new Element(),
  activeElement: new Element(), body: new Element()
};
const context = vm.createContext({document, console,URL,URLSearchParams, Map,Set,Blob, setTimeout:() => 0,clearTimeout(){},localStorage:{getItem:k=>storage.get(k) || null,setItem:(k,v)=>storage.set(k,v)}, location:{hash:'#/'},history:{replaceState:(_,__,url)=>{context.location.hash=url;}},navigator:{clipboard:{writeText:async()=>{}}},window:{addEventListener:(type,fn)=>windowEvents[type]=fn,scrollTo(){},scrollY:0},fetch:async()=>{throw new Error('No browser/network in smoke tests');}});
for (const file of ['catalog.js', 'network-catalog.js', ...fs.readdirSync(path.join(root,'assets')).filter(f=>/^papers-.*\.js$/.test(f)).sort()]) vm.runInContext(fs.readFileSync(path.join(root,'assets',file),'utf8'),context,{filename:file});
vm.runInContext(fs.readFileSync(path.join(root,'network-graph.js'),'utf8'),context,{filename:'network-graph.js'});
vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),context,{filename:'app.js'});
function navigate(hash) { context.location.hash='#'+hash;windowEvents.hashchange(); assert(!main.innerHTML.includes('undefined'),'undefined rendered at '+hash);return main.innerHTML; }
assert(main.innerHTML.includes('循着论文'));
assert(main.innerHTML.includes('href="./network/"'), 'scholar network is reachable from the home page');
const pages = ['/people','/papers','/reading','/network','/sources'];
for (const s of context.SC_DATA.scholars) for (const tab of ['overview','career','papers','people','sources']) pages.push('/people/'+s.id+'/'+tab);
for (const page of pages) assert(navigate(page).length > 100,page);
assert(navigate('/unknown').includes('这份档案还没有建立'));
navigate('/papers'); assert.equal(context.SC.filterPapers().length,320);
for (const s of context.SC_DATA.scholars) {
  navigate('/papers?person='+s.id); assert.equal(context.SC.filterPapers().length,s.papers);
  navigate('/papers?person='+s.id+'&first=1');assert.equal(context.SC.filterPapers().length,s.first_author);
  for (const grade of ['A','B','C']) { navigate('/papers?person='+s.id+'&grade='+grade);assert.equal(context.SC.filterPapers().length,s.evidence[grade]); }
  navigate('/papers?person='+s.id+'&grade=C&first=1');
  assert(context.SC.filterPapers().every(p=>p.records[s.id]['归属证据'].startsWith('C') && p.records[s.id]['是否排名第一']==='是'));
}
navigate('/papers?q='+encodeURIComponent('曾小军'));assert.equal(context.SC.filterPapers().length,62);
navigate('/papers?q='+encodeURIComponent('邓强'));assert.equal(context.SC.filterPapers().length,101);
assert(navigate('/people/dengqiang').includes('2026-10-20'));
assert(navigate('/people/dengqiang/career').includes('湘潭大学'));
assert(navigate('/people/dengqiang/sources').includes('8 张 UTF-8'));
assert(navigate('/reading?person=dengqiang').includes('H⁺–H⁻'));
assert(navigate('/network').includes('id="complete-scholar-graph"'));
assert(document.querySelector('#complete-scholar-graph').innerHTML.includes('href="./network/#person=ncu-deng-qiang"'));
assert.equal((document.querySelector('#complete-scholar-graph').querySelector('[data-graph-stage]').innerHTML.match(/data-graph-person=/g)||[]).length,context.SC_NETWORK.people.length);
assert(!main.innerHTML.includes('背景快照'));
navigate('/papers?q=10.1002%2Fanie.202518909');assert.equal(context.SC.filterPapers().length,1);assert.equal(context.SC.filterPapers()[0].members.length,2);
navigate('/papers?q=%3Cscript%3E');assert.equal(context.SC.filterPapers().length,0);assert(!main.innerHTML.includes('value="<script>'));
navigate('/papers?year=2024');assert(context.SC.filterPapers().every(p=>Object.values(p.records).some(r=>r['排序年份']==='2024')));
navigate('/papers?saved=1');assert.equal(context.SC.filterPapers().length,0);
const id=context.SC_DATA.papers[0].id;
async function click(action, id) { const button = new Element();button.dataset={action,id};await events.click[0]({target:{closest:()=>button}}); }
(async()=>{
  await click('bookmark',id);navigate('/papers?saved=1');assert.equal(context.SC.filterPapers().length,1);assert(storage.get('sc-reading-v1').includes(id));
  await click('open-paper',id);assert(document.querySelector('#paper-dialog').open);assert(document.querySelector('#dialog-content').innerHTML.includes(context.SC_DATA.papers[0].title.replace(/&/g,'&amp;')));
  document.querySelector('#paper-note').value='<script>note</script>';document.querySelector('#dialog-status').value='已读完';await click('save-note',id);
  assert.equal(JSON.parse(storage.get('sc-reading-v1'))[id].status,'已读完');await click('close-dialog');
  assert(!document.querySelector('#paper-dialog').open);
  const checked=context.SC.validateNotes({[id]:{saved:true,status:'invalid',note:'hello'},'unknown':{saved:true}});assert.equal(Object.keys(checked).length,1);assert.equal(checked[id].status,'未开始');
  for (const count of [0, 9, 319]) {
    const fallback = new Element('main');
    const partial = vm.createContext({SC_DATA:{counts:{uniquePapers:320},papers:Array(count)},document:{querySelector:()=>fallback}});
    vm.runInContext(fs.readFileSync(path.join(root,'app.js'),'utf8'),partial);
    assert(fallback.innerHTML.includes('href="./network/"'), 'partial paper data keeps scholar directory reachable');
    assert(fallback.innerHTML.includes('重新加载文献档案'));
  }
  console.log(JSON.stringify({result:'passed',route_checks:pages.length+2,paper_filters:'person, first author, evidence, combined conditions, name, DOI, year, saved, escaped query',reading:'bookmark, note save, local persistence, invalid import keys',browser:false}));
})().catch(err=>{console.error(err);process.exitCode=1;});
