'use strict';
// Public snapshot adapter. No collection API, credentials, or personal database notes.
let publicSnapshot=null;
const browserKey='sch-doc.focus-personal.v1';
function readPersonal(){try{const p=JSON.parse(localStorage.getItem(browserKey)||'{}');if(!p||typeof p!=='object'||Array.isArray(p))return {};return {...p,notes:Array.isArray(p.notes)?p.notes:[],favorites:Array.isArray(p.favorites)?p.favorites:[],read:Array.isArray(p.read)?p.read:[]}}catch{return {}}}
let personal=readPersonal();
function savePersonal(){localStorage.setItem(browserKey,JSON.stringify(personal))}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000)}
function publicPath(path){if(!/^archive\/\d+\/[a-z]+\.[a-z0-9.]+$/i.test(path||''))throw Error('资料路径无效');return './'+path}
function currentState(){data=structuredClone(publicSnapshot);data.settings.favorites=personal.favorites||[];data.settings.target_year=personal.target_year||data.settings.target_year;data.notes=[...(personal.notes||[]),...data.notes.filter(n=>!(personal.notes||[]).some(p=>p.id===n.id))];for(const e of data.events)if((personal.read||[]).includes(e.id))e.unread=0;render()}
load=async()=>{try{if(!publicSnapshot){const r=await fetch('./data.json',{cache:'no-cache'});if(!r.ok)throw Error('资料快照读取失败');publicSnapshot=await r.json()}currentState()}catch(e){$('#job').textContent='读取失败：'+e.message}};
post=async(path,p)=>{if(path==='favorite'){const s=new Set(personal.favorites||[]);p.favorite?s.add(p.id):s.delete(p.id);personal.favorites=[...s]}
else if(path==='note'){personal.notes||=[];p.id=p.id||Date.now();const index=personal.notes.findIndex(n=>n.id===p.id),old=data.notes.find(n=>n.id===p.id)||{};const n={...old,...p,created:old.created||new Date().toISOString(),updated:new Date().toISOString()};index<0?personal.notes.unshift(n):personal.notes.splice(index,1,n)}
else if(path==='read'){personal.read=[...new Set([...(personal.read||[]),...(p.id?[p.id]:data.events.map(e=>e.id))])]}
else if(path==='settings'){const year=Number(p.target_year);if(year<2020||year>2050)throw Error('年份应在 2020–2050 之间');personal.target_year=year}
else throw Error('请在本机程序中执行采集并重新发布。');savePersonal();return {ok:true}};
const localPublicRender=render;
render=()=>{localPublicRender();if(!data)return;$('#check-all').textContent='刷新';$('#check-all').disabled=false;$('#job').textContent=`已发布快照 · ${stamp(data.meta.published_at)} · 浏览器不自动采集官网`;$('#storage-path').textContent='';$('footer').firstChild.textContent='化工研途 · 公开官网资料 / 个人笔记仅保存在此浏览器 ';
$('.local-pill').innerHTML='<span class="dot"></span> 已发布快照';
$$('#source-list .source-facts span:last-child').forEach(el=>el.textContent='本机采集来源');
$$('a[href^="/api/"],a[href^="./api/"]').forEach(a=>{const href=a.getAttribute('href');if(href.includes('notes.csv')){a.href='#';a.textContent='导出个人笔记';a.onclick=e=>{e.preventDefault();exportPersonal()}}else if(href.includes('filing.csv')){a.href='./filing.json';a.textContent='分类索引 JSON';a.download='分类索引.json'}else if(href.includes('/export')){a.href='./data.json';a.download='公开资料.json'}else {a.href=href.includes('snapshot-guide')?'./snapshot-guide.html':'./help.html';a.target='_blank'}});
if(activeTab==='overview'){$$('#overview .panel .hint').forEach(p=>{if(p.textContent.includes('更新由'))p.textContent='这是最近一次发布的采集结果。新增资料需在本机采集后重新发布；当前未启用云端定时采集。'})}
};
$('#check-all').onclick=async()=>{publicSnapshot=null;await load()};
$('#settings-form h2').textContent='个人偏好';
$('#settings .two-col>.panel:last-child').innerHTML='<h2>数据</h2><p>公开资料可下载；关注、已读和个人笔记保存在当前浏览器，换设备不会自动同步。</p><div class="actions"><a class="button" href="./data.json" download>公开数据</a><a class="button" href="./filing.json" download>分类索引</a><button id="export-personal">备份笔记</button><button id="import-personal">导入笔记</button></div><p><a href="https://github.com/DHLSPACE/dhlspace.github.io/tree/main/sch-doc-local" target="_blank" rel="noopener">下载本机采集程序 ↗</a></p><p class="hint">采集和发布是两个步骤；公开站点不会调用电脑里的服务。</p>';
$('#notes .hint').textContent='官网研究笔记与个人补充并列展示。你新增或修改的内容只保存在当前浏览器，请在设置中备份。';
function exportPersonal(){download(new Blob([JSON.stringify({format:browserKey,...personal,notes:personal.notes||[],favorites:personal.favorites||[]},null,2)],{type:'application/json'}),'研招个人笔记.json')}
$('#export-personal').onclick=exportPersonal;
$('#import-personal').onclick=()=>{const input=document.createElement('input');input.type='file';input.accept='.json';input.onchange=async()=>{try{const obj=JSON.parse(await input.files[0].text());if(!Array.isArray(obj.notes)||!obj.notes.every(n=>typeof n.title==='string'&&typeof n.body==='string'))throw Error('笔记格式无效');const existing=new Map((personal.notes||[]).map(n=>[n.id,n]));for(const n of obj.notes)existing.set(n.id||Date.now()+existing.size,n);personal.notes=[...existing.values()];if(Array.isArray(obj.favorites))personal.favorites=obj.favorites.filter(id=>data.institutions.some(u=>u.id===id));savePersonal();currentState();toast('已导入到当前浏览器')}catch(e){toast(e.message)}};input.click()};
// Migrate the prior public site's browser notes once, preserving the original storage key.
if(!personal.migrated){try{const old=JSON.parse(localStorage.getItem('sch-doc.personal.v1')||'[]'),notes=Array.isArray(old)?old:old.notes;if(Array.isArray(notes))personal.notes=[...(personal.notes||[]),...notes.map((n,i)=>({school:n.school||'个人',year:n.year||'',category:n.category||'其他',title:n.title||'个人笔记',body:n.body||n.content||'',url:n.url||'',verified:n.verified||'待核实',...n,id:Date.now()+i}))];personal.migrated=true;savePersonal()}catch{}}
archiveRow=x=>`<article class="row archive-row"><label class="archive-pick"><input type="checkbox" data-archive-select="${x.id}" aria-label="选择 ${esc(archiveTitle(x))}" ${selectedArchives.has(x.id)?'checked':''}></label><div><div class="meta"><span class="file-tag">${fileFormat(x)}</span> ${esc(x.filing.level)} · ${esc(x.filing.year)} · ${esc(x.filing.year_basis)}</div><h3>${esc(archiveTitle(x))}</h3><p class="hint">保存于 ${stamp(x.created)} · ${esc(x.kind)}</p><div class="actions"><a href="${publicPath(x.raw_path)}" download>原件 ↓</a><a href="${publicPath(x.text_path)}" target="_blank" rel="noopener">文本</a><a href="${publicPath(x.manifest_path)}" target="_blank" rel="noopener">来源记录</a>${link(x.url,'官网')}</div></div></article>`;
const originalFormat=fileFormat;fileFormat=x=>originalFormat({...x,raw_path:x.raw_path.replace('.download.txt','')});
// ZIP export is provided by the dedicated web-snapshot worker adapter.
load();
