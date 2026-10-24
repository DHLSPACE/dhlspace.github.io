/* Geometry and real-data interaction checks; no browser layout claims. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict');
const project = path.resolve(__dirname, '..'), root = path.join(project, 'dist/sc');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'assets/network-catalog.js'),'utf8'),context);
vm.runInContext(fs.readFileSync(path.join(root,'network-graph.js'),'utf8'),context);
const graph = context.SCNetworkGraph, data = context.SC_NETWORK;
const full = JSON.parse(fs.readFileSync(path.join(root,'network/downloads/catalog.json'),'utf8'));
assert.equal(data.people.length,full.people.length);
assert.equal(data.relations.length,full.relations.length);
assert.deepEqual(JSON.parse(JSON.stringify(data.relations)),full.relations);
function checkGeometry(catalog) {
  const result = graph.layout(catalog), ids = new Set();
  assert.equal(result.nodes.length,catalog.people.length);
  for (const n of result.nodes) {
    assert(!ids.has(n.person.person_id)); ids.add(n.person.person_id);
    assert(n.x >= 0 && n.y >= 0 && n.x + n.width <= result.width && n.y + n.height <= result.height, 'card fully inside SVG: '+n.person.person_id);
    const group = result.groups.find(g=>g.key===n.group);
    assert(n.x >= group.x && n.x+n.width <= group.x+group.width);
    assert(n.y+n.height <= result.height-20);
  }
  for (let i=0;i<result.nodes.length;i++) for(let j=i+1;j<result.nodes.length;j++) {
    const a=result.nodes[i],b=result.nodes[j];
    assert(a.x+a.width <= b.x || b.x+b.width <= a.x || a.y+a.height <= b.y || b.y+b.height <= a.y,'cards never overlap');
  }
  return result;
}
const geometry=checkGeometry(data);
checkGeometry({people:[...data.people,...Array.from({length:14},(_,i)=>({...data.people[0],person_id:'ncu-added-'+i}))]});
checkGeometry({people:data.people.filter(p=>p.person_id.startsWith('scut-'))});
checkGeometry({people:[]});
function checkView(state) {
  const view=graph.view(data,{...graph.initialState(),...state});
  assert.equal((view.svg.match(/data-graph-person=/g)||[]).length,data.people.length,'all scholars remain visible in every state');
  for(const person of data.people) assert(view.svg.includes('data-graph-person="'+person.person_id+'"'));
  assert(!view.svg.includes('undefined')); assert(!view.detail.includes('undefined'));
  return view;
}
assert.equal(checkView({}).edgeCount,20);
assert.equal(checkView({type:'doctoral_adviser'}).edgeCount,2);
assert.equal(checkView({type:'coauthor'}).edgeCount,7);
assert.equal(checkView({type:'topic_comparison'}).edgeCount,11);
assert.equal(checkView({query:'江风益'}).matchCount,1);
assert.equal(checkView({query:'华南理工'}).matchCount,data.people.filter(p=>p.institution==='华南理工大学').length);
assert.equal(checkView({query:'__missing__'}).matchCount,0);
assert(checkView({query:'__missing__'}).status.includes('没有匹配'));
assert(checkView({query:'<script>'}).status.includes('没有匹配'));
assert(checkView({selected:'ncu-hong-wei'}).detail.includes('博士导师'));
assert(checkView({selected:'ciac-wang-erkang'}).detail.includes('博士学生'));
for(const person of data.people) checkView({selected:person.person_id});
const isolated=data.people.filter(p=>!data.relations.some(r=>[r.from_id,r.to_id].includes(p.person_id)));
assert(isolated.length>0);
for(const person of isolated) assert(checkView({selected:person.person_id}).detail.includes('暂未登记连线'));
const escaped=JSON.parse(JSON.stringify(data));escaped.people[0].name_zh='<script>alert(1)</script>';
assert(!graph.view(escaped,graph.initialState()).svg.includes('<script>'));
class Element {
  constructor(){this.innerHTML='';this.textContent='';this.value='';this.children=new Map();this.events={};this.classes=new Set();this.classList={add:v=>this.classes.add(v),remove:v=>this.classes.delete(v)};}
  querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
  addEventListener(type,fn){this.events[type]=fn;}
  focus(){}
}
const element=new Element();graph.mount(element,data);
const stage=element.querySelector('[data-graph-stage]');
assert.equal((stage.innerHTML.match(/data-graph-person=/g)||[]).length,data.people.length);
function action(name){element.events.click({target:{closest:selector=>selector==='[data-graph-action]'?{dataset:{graphAction:name}}:null}});}
function input(query){element.events.input({target:{value:query,matches:selector=>selector==='[data-graph-query]'}});}
input('江风益');assert(element.querySelector('[data-graph-status]').textContent.includes('搜索匹配 1 人'));
action('in');assert(stage.innerHTML.includes('width:125%'));
action('fit');assert(stage.classes.has('sg-fit'));assert(stage.innerHTML.includes('width:100%'));
action('reset');assert(!stage.classes.has('sg-fit'));assert(!element.querySelector('[data-graph-status]').textContent.includes('搜索匹配'));
element.events.change({target:{value:'doctoral_adviser',matches:selector=>selector==='[data-graph-type]'}});
assert.equal((stage.innerHTML.match(/data-relation-id=/g)||[]).length,2);
element.events.click({preventDefault(){},target:{closest:selector=>selector==='[data-graph-person]'?{dataset:{graphPerson:'ncu-hong-wei'}}:null}});
assert(element.querySelector('[data-graph-detail]').innerHTML.includes('汪尔康'));
action('clear');assert(element.querySelector('[data-graph-detail]').innerHTML.includes('点选人物'));
const html=fs.readFileSync(path.join(root,'network/index.html'),'utf8');
assert(html.includes('globalThis.SCNetworkGraph ='));
assert(!html.includes('/* NETWORK_GRAPH_APP */'));assert(!html.includes('/* NETWORK_GRAPH_CSS */'));
const report={result:'passed',people:data.people.length,relations:data.relations.length,isolated_people:isolated.map(p=>p.name_zh),geometry:{width:geometry.width,height:geometry.height,overlaps:0,out_of_bounds:0},checks:['public catalog parity','all catalog people visible in all filters and selections','automatic layout with additional scholars','empty and single-institution layouts','name and institution search','relation types','adviser direction','isolated scholars','HTML escaping','zoom, fit and reset','selection and source details','embedded standalone graph'],browser_verification:false,limitation:'Node VM and geometry checks; no actual browser or mobile-device visual test.'};
fs.writeFileSync(path.join(project,'deployment/graph-validation-20261023.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
