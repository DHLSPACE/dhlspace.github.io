'use strict';
// V4: one home institution, distinct target/recommendation records and honest coverage.
const titles={overview:'总览',directory:'院校',home:'本校',sources:'监控',updates:'动态',archives:'资料',notes:'笔记',policy:'政策',apply:'报名',settings:'设置'};
addPage('home','本校','⌂','<div id="home-content"></div>');
addPage('policy','政策','▤','<div class="page-intro"><span class="eyebrow">POLICY DESK</span><h2>规则与通知，单独收好。</h2><p>国家政策与地方教育厅、考试院分别整理。报考地规定以当年公告为准。</p></div><div class="toolbar"><select id="policy-group" aria-label="政策层级"><option value="">全部层级</option><option>国家政策</option><option>地方政策</option></select><select id="policy-province" aria-label="政策省份"><option value="">全部省份</option></select></div><div id="policy-content"></div>');
addPage('apply','报名','↗','<div class="page-intro"><span class="eyebrow">APPLICATION GATEWAYS</span><h2>申请的下一步，从这里出发。</h2><p>这里提供官方入口。系统是否开放、申请条件和截止日期，请查看当年通知。</p></div><div id="apply-content" class="portal-grid"></div>');
const nav=$('nav');
for(const [tab,label] of Object.entries(titles)){
  const b=$(`nav [data-tab="${tab}"]`);b.title=label;b.setAttribute('aria-label',label);b.querySelector('.nav-text').textContent=label;nav.append(b);
}
$('nav [data-tab="updates"] .nav-text').insertAdjacentHTML('beforeend',' <span id="unread"></span>');
$('nav [data-tab="settings"]').innerHTML='<span class="nav-text">设置</span>';
$('nav [data-tab="settings"]').classList.add('settings-gear');
$('aside').append($('nav [data-tab="settings"]'));
$('aside').setAttribute('aria-label','主导航');
$('.brand').innerHTML='<svg class="atlas-crown" viewBox="0 0 48 40" aria-hidden="true" focusable="false"><path d="M8 13 13 29H35L40 13 31 22 24 7 17 22Z" fill="currentColor"/><circle cx="7" cy="11" r="3" fill="currentColor"/><circle cx="16" cy="9" r="2.5" fill="currentColor"/><circle cx="24" cy="5" r="3" fill="currentColor"/><circle cx="32" cy="9" r="2.5" fill="currentColor"/><circle cx="41" cy="11" r="3" fill="currentColor"/><path d="M14 34h20" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg><div>Graduate Atlas</div>';
$$('aside .nav-icon').forEach(el=>el.remove());
$('.eyebrow').textContent='南昌大学 · 化工相关方向';
document.body.classList.remove('collapsed');
const previousGo=go;
go=tab=>{if(!titles[tab])tab='overview';activeTab=tab;$$('.page').forEach(n=>n.classList.toggle('active',n.id===tab));$$('aside [data-tab]').forEach(n=>n.classList.toggle('active',n.dataset.tab===tab));$('#page-title').textContent=titles[tab];render();remember('lastTab',tab);$('aside').classList.remove('nav-hidden');if(tab!=='settings')$(`aside [data-tab="${tab}"]`).scrollIntoView({inline:'center',block:'nearest'});window.scrollTo({top:0,behavior:'instant'})};
let lastY=window.scrollY,accumulated=0,scrollDirection=0;
window.addEventListener('scroll',()=>{const y=window.scrollY,delta=y-lastY,direction=Math.sign(delta);if(direction!==scrollDirection)accumulated=0;accumulated+=Math.abs(delta);if(y<50)$('aside').classList.remove('nav-hidden');else if(accumulated>12&&!$('aside :focus-visible'))$('aside').classList.toggle('nav-hidden',delta>0);scrollDirection=direction;lastY=y},{passive:true});
$('aside').addEventListener('focusin',()=>$('aside').classList.remove('nav-hidden'));

// All personal appearance controls share the single settings entry.
const settingsAppearance=document.createElement('article');settingsAppearance.className='panel appearance-settings';
settingsAppearance.innerHTML='<h2>外观</h2><p class="hint">玻璃透明度、模糊和配色即时预览，自动保存在当前浏览器。</p><div id="appearance-tools" class="actions"></div><label>导航不透明度 <output id="nav-opacity-value"></output><input id="nav-opacity" type="range" min="25" max="100" step="1"></label><label>卡片不透明度 <output id="surface-opacity-value"></output><input id="surface-opacity" type="range" min="40" max="100" step="1"></label><label>玻璃模糊 <output id="glass-blur-value"></output><input id="glass-blur" type="range" min="0" max="40" step="1"></label><button id="reset-glass">恢复玻璃效果</button><hr><h2>帮助</h2><p>分类规则、抓取状态、年份说明与备份方法。</p><a class="button" href="./help.html" target="_blank" rel="noopener">打开指南 ↗</a>';
$('#settings').prepend(settingsAppearance);$('#appearance-tools').append($('.theme-control'),$('#open-palette'));
const glassDefaults={'nav-opacity':72,'surface-opacity':84,'glass-blur':24};
function setGlass(){for(const [key,fallback] of Object.entries(glassDefaults)){const input=$('#'+key),value=Number(input.value)||0;document.documentElement.style.setProperty('--'+key,key==='glass-blur'?value+'px':value/100);$('#'+key+'-value').textContent=value+(key==='glass-blur'?' px':'%');remember(key,String(value))}}
for(const [key,fallback] of Object.entries(glassDefaults)){$('#'+key).value=pref(key,String(fallback));$('#'+key).oninput=setGlass}setGlass();
$('#reset-glass').onclick=()=>{for(const [key,value] of Object.entries(glassDefaults))$('#'+key).value=value;setGlass()};
const dataPanel=$('#settings .two-col>.panel:last-child');
const dataControls=[$('#prepare-sync'),$('#sync-result'),$('#stop-app')];
dataPanel.innerHTML='<h2>数据与运行</h2><p>原件和笔记保存在本机；完整备份请复制整个项目文件夹。</p><div class="actions"><a class="button" href="/api/export">导出数据</a><a class="button" href="/api/filing.csv">分类索引</a></div><hr><h2>同步</h2><p class="hint">准备文件到现有本机 Git 仓库，完成后可检查差异。</p>';
dataPanel.append(...dataControls);
$('#settings-form h2').textContent='采集';

$('#directory .directory-hero h2').innerHTML='让专业相近的选择，<br>更容易被看见。';
$('#directory .directory-hero p').textContent='化工与化学为主线，材料、电化学、生物化学、半导体等方向适度拓展。';
$('.directory-total').innerHTML='<b id="target-total">—</b><span>所候选院校与研究所</span><hr><strong id="institute-total">—</strong><span>个相关研究所</span>';
$('.directory-heading p').textContent='省份、专业方向和关联程度可以组合筛选。星标表示你主动关注的目标。';
$('.directory-evidence').innerHTML='<summary>收录与排除说明</summary><div id="scope-explanation"></div>';
$('.library-workflow').innerHTML='<span><b>01</b> 选方向</span><span><b>02</b> 看校院</span><span><b>03</b> 留资料</span><span><b>04</b> 去申请</span>';
$('#directory-region').insertAdjacentHTML('afterend','<select id="directory-direction" aria-label="专业方向"><option value="">全部方向</option></select><select id="directory-fit" aria-label="关联程度"><option value="">全部关联</option><option value="核心">核心相关</option><option value="交叉">交叉拓展</option></select>');
$('.directory-chips').insertAdjacentHTML('beforeend','<button data-directory-filter="相关高校">相关高校</button>');
function options(selector,values,label){const el=$(selector),selected=el.value;el.innerHTML=`<option value="">${label}</option>`+[...new Set(values.filter(Boolean))].sort((a,b)=>b.localeCompare(a,'zh')).map(v=>`<option value="${esc(v)}" ${selected===v?'selected':''}>${esc(v)}</option>`).join('')}
directoryRows=()=>{
  const q=$('#directory-search').value.trim().toLowerCase(),province=$('#directory-region').value,direction=$('#directory-direction').value,fit=$('#directory-fit').value,favorites=new Set(data.settings.favorites||[]);
  const rows=data.institutions.filter(u=>(!q||[u.school,u.province,...u.directions,...(u.aliases||[])].join(' ').toLowerCase().includes(q))&&(!province||u.province===province)&&(!direction||u.directions.includes(direction))&&(!fit||u.fit===fit)&&(directoryFilter==='all'||u.tier===directoryFilter||directoryFilter==='favorites'&&favorites.has(u.id)||directoryFilter==='connected'&&data.sources.some(s=>ownsSource(u,s))));
  const sort=$('#directory-sort').value;return rows.sort((a,b)=>sort==='name'?a.school.localeCompare(b.school,'zh'):sort==='region'?a.province.localeCompare(b.province,'zh'):Number(favorites.has(b.id))-Number(favorites.has(a.id))||Number(a.fit!=='核心')-Number(b.fit!=='核心'));
};
function entryLink(e){return `<div class="entry-link"><div>${link(e.url,e.label)}<small>${esc(e.kind||e.group||'入口')} · ${esc(e.status||'待核验')}${e.mode==='链接'?' · 仅链接':''}</small>${e.error?`<small class="entry-error">${esc(e.error)}</small>`:''}</div>${e.source_id?'<span class="live-mark">已接入</span>':''}</div>`}
renderDirectory=()=>{
  const all=data.institutions,favorites=new Set(data.settings.favorites||[]);
  options('#directory-region',all.map(u=>u.province),'全部省份');options('#directory-direction',data.profile.directions,'全部方向');
  $('#target-total').textContent=all.length;$('#institute-total').textContent=all.filter(u=>u.tier==='研究所').length;
  $('#directory-stats').innerHTML=[['我的关注',favorites.size,'favorites'],['已接入院校',all.filter(u=>data.sources.some(s=>ownsSource(u,s))).length,'connected'],['已保存版本',data.snapshots.filter(s=>s.filing.relevant).length,'archives'],['待查看更新',data.events.filter(e=>e.unread&&e.filing.relevant&&!['首次建档','抓取失败'].includes(e.type)).length,'updates']].map(([label,n,stat])=>`<button data-stat="${stat}"><span>${label}</span><b>${n}<small> ↗</small></b></button>`).join('');
  const rows=directoryRows(),pages=Math.max(1,Math.ceil(rows.length/pageSize));directoryPage=Math.min(directoryPage,pages);
  $('#directory-count').textContent=`${rows.length} 个匹配 / ${all.length} 个候选 · 方向是筛选线索，报考条件以当年目录为准`;
  $('#directory-list').className='institution-grid '+(directoryLayout==='rows'?'institution-rows':'');
  $('#directory-list').innerHTML=rows.slice((directoryPage-1)*pageSize,directoryPage*pageSize).map(u=>{
    const sources=data.sources.filter(s=>ownsSource(u,s)),saved=data.snapshots.filter(x=>sources.some(s=>s.id===x.source_id)&&x.filing.relevant).length;
    const successful=sources.filter(s=>s.checked&&!s.error).length;
    return `<article class="institution-card"><div class="institution-identity"><span class="institution-emblem">${u.tier==='研究所'?'CAS':u.tier==='985'?'985':'UNI'}</span><div class="institution-title"><h3>${esc(u.school)}</h3><span class="meta">${esc(u.province)} · ${esc(u.fit)}</span></div><button class="pin ${favorites.has(u.id)?'selected':''}" data-favorite="${u.id}" aria-label="${favorites.has(u.id)?'取消关注':'关注'} ${esc(u.school)}" aria-pressed="${favorites.has(u.id)}">${uiIcon('star')}</button></div><div class="direction-tags">${u.directions.map(d=>`<span>${esc(d)}</span>`).join('')}</div><div class="institution-meta"><span><b>${successful}<small> / ${sources.length}</small></b>来源检查成功</span><span><b>${saved}</b>相关版本</span></div><p class="entry-status">${esc(u.entry_status)}</p><details class="institution-entries"><summary><span class="entry-label">校院入口 <small>${u.entries.length}</small></span>${guideArrow('right')}</summary>${u.entries.map(entryLink).join('')}<p class="hint">常设入口仅作导航，不自动保存综合新闻；公告是否长期保留尚未确认。</p></details><div class="institution-actions"><button data-school-files="${u.id}" ${saved?'':'disabled'}>查看资料 ${guideArrow('right')}</button><button data-connect="${u.id}">补充来源</button>${link(u.url,'官网')}</div></article>`;
  }).join('')||empty('没有匹配项，试试调整省份、专业方向或关联程度。');
  $('#directory-pager').innerHTML=`<button data-directory-page="${directoryPage-1}" ${directoryPage<=1?'disabled':''}>上一页</button><span>${directoryPage} / ${pages}</span><button data-directory-page="${directoryPage+1}" ${directoryPage>=pages?'disabled':''}>下一页</button>`;
  $$('[data-directory-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.directoryFilter===directoryFilter);b.setAttribute('aria-pressed',String(b.dataset.directoryFilter===directoryFilter))});$$('[data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===directoryLayout));
  $('#scope-explanation').innerHTML=`<p>保留 ${all.filter(u=>u.tier==='研究所').length} 个相关研究所，将 ${data.excluded_institutions.length} 个数学、天文、纯计算机等非优先单位移出候选目录。原目录仍保留，未删除历史资料。交叉方向需要逐项核对导师研究内容和跨专业条件。</p><p>物理化学可衔接催化、电化学、界面与材料；化工原理可衔接分离与过程工程；英语用于文献阅读与面试。这些是准备线索，不是录取概率判断。</p>${link('https://www.cas.cn/zz/jg/ys/yj/','中科院完整名录')}`;
};
for(const id of ['directory-direction','directory-fit'])$('#'+id).onchange=()=>{directoryPage=1;renderDirectory()};
const resetDirectory=$('#directory-reset').onclick;$('#directory-reset').onclick=()=>{$('#directory-direction').value=$('#directory-fit').value='';resetDirectory()};

// Common filing controls: target school is not the home-school recommendation category.
const scopeOptions='<option value="">全部用途</option><option value="目标">目标申请</option><option value="本校">本校推荐</option><option value="政策">教育政策</option>';
$('#archive-school').insertAdjacentHTML('beforebegin',`<select id="archive-scope" aria-label="资料用途">${scopeOptions}</select><select id="archive-year" aria-label="资料年份"><option value="">全部年份</option></select><select id="archive-level" aria-label="校院层级"><option value="">全部层级</option><option>校级</option><option>院系</option><option>研究所</option><option>国家政策</option><option>地方政策</option></select>`);
$('#archive-format').insertAdjacentHTML('afterend','<label class="check-label"><input id="archive-unrelated" type="checkbox"> 显示非相关旧资料</label>');
$('#updates .toolbar').insertAdjacentHTML('afterend',`<div class="toolbar"><select id="update-scope" aria-label="通知用途">${scopeOptions}</select><select id="update-year" aria-label="通知年份"><option value="">全部年份</option></select></div>`);
$('.source-filters').insertAdjacentHTML('afterbegin',`<select id="source-scope" aria-label="监控用途">${scopeOptions}</select>`);
const originalSourceRender=renderSources;
renderSources=()=>{const all=data.sources,scope=$('#source-scope').value;try{if(scope)data.sources=all.filter(s=>s.filing.scope===scope);originalSourceRender()}finally{data.sources=all}};
$('#source-scope').onchange=renderSources;
const originalSourceReset=$('#clear-source-filters').onclick;$('#clear-source-filters').onclick=()=>{$('#source-scope').value='';originalSourceReset()};
view=pref('view-v4','groups');

archiveTitle=x=>x.display_title||'未命名资料';
const openedStacks=new Set();
const stackState=new Map();
function stackRows(rows,renderRow,depth=0,path=''){
  const keys=['scope','year','school','department'];if(depth===keys.length)return rows.map(renderRow).join('');
  const groups=new Map();for(const row of rows){const key=row.filing[keys[depth]]||'待核实';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row)}
  return [...groups].sort((a,b)=>depth===1?b[0].localeCompare(a[0]):a[0].localeCompare(b[0],'zh')).map(([name,items])=>{const key=path+'/'+name;return `<details class="filing-stack depth-${depth}" data-stack="${esc(key)}" ${(stackState.has(key)?stackState.get(key):depth<2)?'open':''}><summary><span>${esc(name==='目标'?'目标申请':name==='本校'?'本校推荐':name)}</span><span class="stack-count">${items.length} 份</span></summary>${stackRows(items,renderRow,depth+1,key)}</details>`}).join('');
}
function archiveRow(x){return `<article class="row archive-row"><label class="archive-pick"><input type="checkbox" data-archive-select="${x.id}" aria-label="选择 ${esc(archiveTitle(x))}" ${selectedArchives.has(x.id)?'checked':''}></label><div><div class="meta"><span class="file-tag">${fileFormat(x)}</span> ${esc(x.filing.level)} · ${esc(x.filing.year)} · ${esc(x.filing.year_basis)}</div><h3>${esc(archiveTitle(x))}</h3><p class="hint">保存于 ${stamp(x.created)} · ${esc(x.kind)}</p><div class="actions"><a href="/api/archive?id=${x.id}&view=raw">原件 ↓</a><a href="/api/archive?id=${x.id}&view=text" target="_blank" rel="noopener">文本</a><a href="/api/archive?id=${x.id}&view=manifest" target="_blank" rel="noopener">来源记录</a>${link(x.url,'官网')}</div></div></article>`}
renderLibrary=()=>{
  options('#archive-school',data.snapshots.map(x=>x.filing.school),'全部学校');options('#archive-year',data.snapshots.map(x=>x.filing.year),'全部年份');
  const rows=filteredArchiveRows();
  const pages=Math.max(1,Math.ceil(rows.length/60));archivePage=Math.min(archivePage,pages);visibleArchives=rows.slice((archivePage-1)*60,archivePage*60);
  $('#archive-list').innerHTML=stackRows(visibleArchives,archiveRow)||empty('没有匹配的已保存文件；可以查看其他年份，或检查采集状态。');
  $$('#archive-list [data-stack]').forEach(el=>el.addEventListener('toggle',()=>{if(el.isConnected)stackState.set(el.dataset.stack,el.open)}));
  $('#archive-count').textContent=`${rows.length} 份匹配 · 已选 ${selectedArchives.size} · 按用途 / 招生年份 / 学校 / 院系折叠`;
  $('#download-bundle').disabled=!selectedArchives.size;$('#download-bundle').textContent=`打包${selectedArchives.size?' ('+selectedArchives.size+')':''}`;
  $('#select-page').checked=visibleArchives.length>0&&visibleArchives.every(x=>selectedArchives.has(x.id));$('#select-page').indeterminate=visibleArchives.some(x=>selectedArchives.has(x.id))&&!$('#select-page').checked;
  $('#archive-pager').innerHTML=`<button data-archive-page="${archivePage-1}" ${archivePage<=1?'disabled':''}>上一页</button><span>${archivePage} / ${pages} · 每页最多 60 份</span><button data-archive-page="${archivePage+1}" ${archivePage>=pages?'disabled':''}>下一页</button>`;
  const pending=data.resources.filter(x=>x.filing.relevant&&x.status!=='已归档');$('#queue-status').textContent=`相关归档 ${data.snapshots.filter(x=>x.filing.relevant).length} 个版本 · ${pending.length} 项待完成（${pending.filter(x=>x.error).length} 项失败）。非相关旧资料保留，可勾选查看。招生年份无法判断的文件放在“待核实”，栏目快照放在“跨年”。`;
  $('#resource-list').innerHTML=pending.slice(0,100).map(x=>`<article class="row">${badge(x.status)} <b>${esc(x.title)}</b><p>${esc(x.error||'等待归档')}</p>${link(x.url)}</article>`).join('')||empty('相关队列已完成。');
};
for(const key of ['scope','year','level','unrelated'])$('#archive-'+key).onchange=()=>{archivePage=1;renderLibrary()};
const oldArchiveReset=$('#archive-reset').onclick;$('#archive-reset').onclick=()=>{for(const key of ['scope','year','level'])$('#archive-'+key).value='';$('#archive-unrelated').checked=false;oldArchiveReset()};
function notificationRow(e){return `<article class="row"><div class="meta">${esc(e.filing.school)} · ${esc(e.filing.department)} · 招生年份 ${esc(e.filing.year)} · 发布 ${esc(e.published||'未标注')}</div><h3>${esc(e.title)}</h3><div class="actions">${link(e.url,'原通知')}<button data-note-item="${e.id}">记笔记</button><button data-save-item="${e.id}">保存</button></div></article>`}
function renderFocusedUpdates(){
  options('#update-year',data.items.map(x=>x.filing.year),'全部年份');const q=$('#item-search').value.toLowerCase(),scope=$('#update-scope').value,year=$('#update-year').value;
  const isItems=$('#update-mode').value==='items';const rows=(isItems?data.items:data.events).filter(x=>x.filing.relevant&&(!scope||x.filing.scope===scope)&&(!year||x.filing.year===year)&&(!q||(x.title+x.filing.school+x.filing.department+(x.detail||'')).toLowerCase().includes(q)));
  $('#updates-list').innerHTML=(isItems?stackRows(rows.slice(0,180),notificationRow):rows.slice(0,180).map(eventRow).join(''))||empty('没有匹配的相关通知。');
  $('#updates .hint').textContent=`${rows.length} 条匹配，当前最多展示 180 条，请通过用途、年份或搜索缩小范围。美术等非相关通知不进入此视图。`;
}
for(const key of ['scope','year'])$('#update-'+key).onchange=renderFocusedUpdates;
function portalCard(p){return `<article class="panel portal-card"><div class="meta">${esc(p.group||p.kind||'官方入口')} ${esc(p.province||'')}</div><h3>${esc(p.label)}</h3><p>${esc(p.note||'常设官方入口，开放时间以当年通知为准。')}</p><p class="hint">${esc(p.status||'链接待核验')}${p.verified_at?' · '+stamp(p.verified_at):''}</p>${link(p.url,'打开官网')}</article>`}
function renderPolicy(){
  options('#policy-province',data.portals.map(p=>p.province),'全部省份');const group=$('#policy-group').value,province=$('#policy-province').value;
  const portals=data.portals.filter(p=>['国家政策','地方政策'].includes(p.group)&&(!group||p.group===group)&&(!province||p.province===province));
  const items=data.items.filter(x=>x.filing.scope==='政策'&&x.filing.relevant&&(!group||x.filing.level===group)&&(!province||portals.some(p=>p.label===x.filing.school)));
  $('#policy-content').innerHTML=`<div class="portal-grid">${portals.map(portalCard).join('')}</div><h2>政策通知 <small>${items.length} 条</small></h2>${stackRows(items.slice(0,120),notificationRow) || empty('当前筛选尚无成功采集的政策通知，入口状态见上方。')}`;
}
$('#policy-group').onchange=$('#policy-province').onchange=renderPolicy;
function renderHome(){
  const u=data.institutions.find(u=>u.id==='ncu'),items=data.items.filter(x=>x.filing.scope==='本校'),sources=data.sources.filter(s=>s.filing.school==='南昌大学');
  $('#home-content').innerHTML=`<div class="page-intro home-intro"><span class="eyebrow">YOUR HOME UNIVERSITY</span><h2>南昌大学<span class="pill neutral">唯一本校</span></h2><p>本校推荐资格、成绩排名、名额与材料准备集中在这里。南昌大学接收硕士、接收推免等招生文件仍归“目标申请”。</p></div><div class="two-col"><article class="panel"><h2>本科阶段 · 推荐与准备</h2><p>确认学院推免办法、计分与名额，保持物理化学和化工原理基础，积累英语文献阅读及面试表达。</p><button data-home-files>本校资料 ↗</button><p class="hint">目前 ${items.length} 条本校通知；标题规则自动分类，遇到口径不清的文件请回看原文。</p></article><article class="panel"><h2>南昌大学 · 作为申请目标</h2><p>校级招生、化学化工学院和其他相关院系按目标申请归档。</p><button data-target-ncu>目标资料 ↗</button></article></div><details class="panel"><summary>本校官方入口与监控（${sources.length} 个来源）</summary>${(u?.entries||[]).map(entryLink).join('')}${sources.filter(s=>/教务/.test(s.name)).map(s=>entryLink({label:s.name,url:s.url,status:s.status,source_id:s.id})).join('')}</details><h2>推荐相关通知</h2>${stackRows(items.slice(0,80),notificationRow)||empty('尚未识别到推荐相关通知，请查看教务和学院入口。')}`;
}
function renderOverview(){
  const active=data.sources.filter(s=>s.enabled),success=active.filter(s=>s.checked&&!s.error),failed=active.filter(s=>s.error),pending=active.filter(s=>!s.checked),favorites=data.institutions.filter(u=>(data.settings.favorites||[]).includes(u.id));
  const checkedUnits=new Set((data.coverage||[]).filter(u=>u.attempts?.length).map(u=>u.id)),connected=data.institutions.filter(u=>data.sources.some(s=>ownsSource(u,s)));
  $('#overview .hero').innerHTML=`<div><span class="pill">南昌大学 → <span id="hero-year">${data.settings.target_year}</span> 年入学</span><h2>每一步准备，<br>都看得见依据。</h2><p>化工 · 化学 · 材料 · 电化学 · 生物化学 · 半导体<br>从本校推荐到目标申请，保留每一年的官方记录。</p><div class="actions"><button class="light" data-go="directory">查看院校 ↗</button><a class="light button" href="./help.html" target="_blank" rel="noopener">使用指南</a></div></div><div class="hero-mark">${String(success.length).padStart(2,'0')}<span>个来源最近检查成功</span><small>${active.length} 个启用来源 · 失败不计作无更新</small></div>`;
  $('#metrics').innerHTML=[['检查成功',success.length],['访问 / 解析失败',failed.length],['待首次检查',pending.length],['相关文件版本',data.snapshots.filter(x=>x.filing.relevant).length]].map(([label,n])=>`<div class="metric"><b>${n}</b><span>${label}</span></div>`).join('');
  $('#overview .two-col').innerHTML=`<article class="panel"><div class="section-head"><h2>现在的目标</h2><span class="pill neutral">${data.settings.target_year} 入学</span></div><p>本校：<b>南昌大学</b> · 优势：物理化学、化工原理、英语。</p><p>${favorites.length?favorites.map(u=>esc(u.school)).join(' · '):'尚未星标目标。先在院校中按方向筛选，再用 ☆ 建立自己的短名单。'}</p><div class="direction-tags"><span>催化与界面</span><span>分离与过程工程</span><span>能源与材料</span></div><p class="hint">方向建议基于你描述的基础，专业要求与初试科目需逐校核实。</p><button data-go="directory">管理目标</button></article><article class="panel"><h2>覆盖与状态</h2><p>候选 ${data.institutions.length} 所 · 本轮已尝试 ${data.institutions.filter(u=>checkedUnits.has(u.id)).length} 所 · 已接入 ${connected.length} 所。</p><p>校院官网、招生栏目和成功归档分开统计。只展示链接的入口不执行自动抓取。</p><p class="hint">更新由本地采集或已有计划任务执行；此页打开不代表后台计划已启用。年份待核实的材料不按抓取年份归类。</p><div class="actions"><button data-go="sources">查看监控</button><a href="./help.html" target="_blank" rel="noopener">项目说明 ↗</a></div></article>`;
  $('#recent').innerHTML=failed.slice(0,4).map(s=>`<article class="row"><div class="meta">需要关注 · ${stamp(s.checked)}</div><h3>${esc(s.name)}</h3><p>${esc(s.error)}</p>${link(s.url,'打开原站')}</article>`).join('')||empty('当前启用来源没有报告抓取失败。');
  $('#recent').closest('article').querySelector('h2').textContent='需要关注';
}
const beforeFocusRender=render;
render=()=>{beforeFocusRender();if(!data||!data.profile)return;$('#unread').textContent=data.events.filter(x=>x.unread&&x.filing.relevant).length||'';if(activeTab==='overview')renderOverview();if(activeTab==='home')renderHome();if(activeTab==='policy')renderPolicy();if(activeTab==='apply')$('#apply-content').innerHTML=data.portals.filter(p=>p.group==='报名').map(portalCard).join('');if(activeTab==='updates')renderFocusedUpdates()};
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.hasAttribute('data-home-files')){go('archives');$('#archive-reset').click();$('#archive-scope').value='本校';renderLibrary()}if(b.hasAttribute('data-target-ncu')){go('archives');$('#archive-reset').click();$('#archive-scope').value='目标';$('#archive-school').value='南昌大学';renderLibrary()}});
go('overview');
