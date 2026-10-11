'use strict';
// Two workspaces over the same original records; switching never fetches a school.
const admissionsModes={recommendation:{name:'保研',en:'RECOMMENDATION',lead:'把每一次申请，准备得更从容。',copy:'从本校推荐资格，到夏令营与预推免。按院校整理入口、通知和材料，让每一步都有依据。',topics:['夏令营','推免接收','推荐资格','简章与目录','复试与录取']},examination:{name:'考研',en:'POSTGRADUATE EXAM',lead:'先看清目标，再走好每一步。',copy:'从院校与专业选择，到初试、复试和调剂。把招生目录、考试资料和历年通知放进同一个窗口。',topics:['简章与目录','初试与参考书','分数与成绩','复试与录取','调剂','报名与确认']}};
let admissionsMode=pref('admissions-mode','recommendation');
if(!admissionsModes[admissionsMode])admissionsMode='recommendation';
const admissionsStates={};
function readAdmissionsState(mode){
 let saved={};try{saved=JSON.parse(pref('admissions-'+mode,'{}'))}catch{}
 if(!saved||typeof saved!=='object'||Array.isArray(saved))saved={};
 const state={tab:titles[saved.tab]?saved.tab:'overview',query:'',province:'',direction:'',tier:'',sort:'default',page:1,topic:'',legacy:{}};
 for(const key of ['query','province','direction','tier','sort','topic'])if(typeof saved[key]==='string')state[key]=saved[key].slice(0,200);
 if(saved.legacy&&typeof saved.legacy==='object'&&!Array.isArray(saved.legacy))state.legacy=saved.legacy;
 return state;
}
for(const mode of Object.keys(admissionsModes))admissionsStates[mode]=readAdmissionsState(mode);
let admissionsRaw=null,admissionsIndex=null,admissionsView=null;
const admissionsLegacyRender=render,admissionsLegacyHome=renderHome;
const admissionsLegacyEdit=edit;
edit=(mode,obj={})=>{if(mode==='note'&&!obj.id&&!obj.category)obj={...obj,category:admissionsMode==='recommendation'?'保研准备':'考研准备'};return admissionsLegacyEdit(mode,obj)};
hasUpdate=source=>admissionsView?.updateSources.has(source.id)||false;
const admissionsLegacyResearch=openResearch;
openResearch=unit=>{admissionsLegacyResearch(unit);if(!isPublicRuntime)$('#research-query').value=(unit?unit.school+' ':'')+data.settings.target_year+' '+(admissionsMode==='recommendation'?'推免 夏令营':'硕士 统考 初试 复试')+' 化学 化工'};
const admissionsDetail={unit:null,query:'',year:'',department:'',format:'',topic:'',saved:false,page:1,record:null,version:null};
const admissionsTextCache=new Map();
let admissionsSearchTimer,admissionsDetailTimer;
const admissionsSize=12;
const admissionIcon=(name)=>uiIcon(name);
const admissionsSave=()=>remember('admissions-'+admissionsMode,JSON.stringify(admissionsStates[admissionsMode]));
const admissionYear=y=>/^20\d{2}$/.test(y)?y+' 年':y==='待核实'?'年份待核实':y;
const admissionsSelect=(id,label,values,current)=>`<label><span>${label}</span><select id="${id}" aria-label="${label}"><option value="">全部${label}</option>${[...new Set(values)].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh')).map(v=>`<option value="${esc(v)}" ${current===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
const admissionsPager=(page,pages,prefix)=>`<div class="admissions-pager"><button data-${prefix}-page="${page-1}" ${page<=1?'disabled':''}>${admissionIcon('left')}上一页</button><span>第 ${page} / ${pages} 页</span><button data-${prefix}-page="${page+1}" ${page>=pages?'disabled':''}>下一页${admissionIcon('right')}</button></div>`;

document.documentElement.dataset.admissionsMode=admissionsMode;
$('header').insertAdjacentHTML('beforeend',`<div class="admissions-switch" role="group" aria-label="切换升学工作台"><span class="admissions-switch-thumb" aria-hidden="true"></span><button data-admissions-mode="recommendation" aria-pressed="true">保研<span>推免申请</span></button><button data-admissions-mode="examination" aria-pressed="false">考研<span>统考升学</span></button></div>`);
$('header').insertAdjacentHTML('afterend','<p id="admissions-context" class="admissions-context" role="status"></p>');
$('#overview').insertAdjacentHTML('afterbegin','<div id="admissions-overview"></div>');
$('#directory').insertAdjacentHTML('afterbegin',`<div id="admissions-directory"><div class="admissions-directory-head"><div><span class="eyebrow" id="admissions-directory-eyebrow"></span><h2>找到适合你的院校</h2><p>先选校院，再核对当年的招生要求。</p></div><button data-a-favorites>${admissionIcon('star')}我的关注</button></div><div class="admissions-searchbar"><label><span class="sr-only">搜索院校、省份、专业方向</span><input id="a-school-query" type="search" placeholder="搜索院校、省份、专业方向…" autocomplete="off"></label><button data-a-reset>重置</button></div><div class="admissions-filters" id="admissions-filters"></div><div id="admissions-topics" class="admissions-topics" role="group" aria-label="按资料主题找院校"></div><div class="admissions-resultbar"><span id="admissions-result-count" role="status" aria-live="polite"></span><label>排序<select id="a-school-sort" aria-label="院校排序"><option value="default">关注优先</option><option value="saved">原件数量</option><option value="name">院校名称</option></select></label></div><div id="admissions-school-grid" class="admissions-school-grid"></div><div id="admissions-school-pager"></div><p class="admissions-footnote">目录范围沿用现有候选院校；专业方向用于筛选，招生资格与科目以当年官方目录为准。通用招生资料在两个工作台共用。</p></div>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="admissions-school-dialog" aria-labelledby="admissions-school-title"><div class="admissions-dialog-top"><div><span id="admissions-school-kicker" class="eyebrow"></span><h2 id="admissions-school-title"></h2><p id="admissions-school-subtitle"></p></div><button data-a-close aria-label="关闭院校详情">${admissionIcon('close')}</button></div><div class="admissions-detail-tabs" role="group" aria-label="院校资料主题"></div><div id="admissions-detail-search"><div class="admissions-searchbar"><label><span class="sr-only">在这所院校搜索标题、院系或专业代码</span><input id="a-detail-query" type="search" placeholder="搜索标题、院系或专业代码…" autocomplete="off"></label></div><div class="admissions-filters" id="admissions-detail-filters"></div><label class="admissions-saved-toggle"><input id="a-detail-saved" type="checkbox">仅看已保存原件</label><div id="admissions-detail-count" class="admissions-detail-count" role="status" aria-live="polite"></div><div id="admissions-detail-list"></div><div id="admissions-detail-pager"></div></div><div id="admissions-detail-reader" hidden></div><details id="admissions-official-entries"><summary>官方校院入口 <span></span>${admissionIcon('down')}</summary><div id="admissions-official-list"></div></details></dialog>`);

function prepareAdmissionsData(){
 if(!data)return false;
 if(data!==admissionsView?.data){admissionsRaw=data;admissionsIndex=AdmissionsModel.build(data)}
 admissionsView=admissionsIndex.view(admissionsMode);data=admissionsView.data;return true;
}
function updateAdmissionsChrome(){
 const mode=admissionsModes[admissionsMode];
 document.documentElement.dataset.admissionsMode=admissionsMode;
 $$('[data-admissions-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.admissionsMode===admissionsMode)));
 $('#page-title').textContent=mode.name+' · '+(activeTab==='home'&&admissionsMode==='examination'?'备考':titles[activeTab]);
 $('#admissions-context').textContent=admissionsMode==='recommendation'?'保研工作台 · 推荐资格 / 夏令营 / 推免接收':'考研工作台 · 择校 / 初试 / 复试 / 调剂';
 for(const b of $$('aside [data-tab="home"],#mobile-menu [data-menu-go="home"]')){const label=admissionsMode==='examination'?'备考':'本校',text=b.querySelector('.nav-text');if(text)text.textContent=label;else b.textContent=label;b.setAttribute('aria-label',label);b.title=label}
 $('#unread').textContent=data.events.filter(e=>e.unread&&e.filing?.relevant).length||'';
 $('#side-year').textContent=data.settings.target_year;
 const heroYear=$('#hero-year');if(heroYear)heroYear.textContent=data.settings.target_year;
 $('#check-all').disabled=!isPublicRuntime&&data.job.running;
 $('#check-all').textContent=isPublicRuntime?'刷新资料':data.job.running?'检查进行中…':'检查来源';
 $('#job').textContent=isPublicRuntime?`已发布资料 · ${stamp(data.meta?.published_at)} · 个人笔记保存在当前浏览器`:(data.job.running?'正在运行 · ':'')+data.job.message+(data.job.finished?' · '+stamp(data.job.finished):'');
 if(isPublicRuntime){$('.local-pill').innerHTML='<span class="dot"></span> 已发布快照';$('#storage-path').textContent=''}
 else $('#storage-path').textContent=data.root;
}
function renderAdmissionsOverview(){
 const mode=admissionsModes[admissionsMode],units=[...admissionsView.units.values()],records=admissionsView.records;
 const favorites=new Set(data.settings.favorites||[]),saved=records.filter(r=>r.versions.length).length;
 const recentUrls=new Set();
 const recent=records.filter(r=>r.unitId&&r.kind!=='list'&&r.topic!=='其他通知'&&r.published&&!recentUrls.has(r.url)&&recentUrls.add(r.url)).slice(0,4);
 const routes=admissionsMode==='recommendation'?[['01','本校推荐','确认资格、排名与推荐办法','home'],['02','夏令营','查看院校通知与申请材料','夏令营'],['03','推免接收','整理预推免与接收要求','推免接收'],['04','材料归档','保留原件、版本和申请依据','archives']]:[['01','选校与专业','对照目录，确认专业与方向','directory'],['02','初试资料','核对科目、大纲与参考书','初试与参考书'],['03','复试与录取','查历年复试通知与名单','复试与录取'],['04','调剂信息','查看条件与官方公告','调剂']];
 $('#admissions-overview').innerHTML=`<div class="admissions-hero"><div class="admissions-hero-copy"><span class="admissions-kicker"><i></i>${mode.en} / ${data.settings.target_year} 入学</span><h2>${mode.lead}</h2><p>${mode.copy}</p><div class="admissions-hero-actions"><button class="primary" data-go="directory">浏览${mode.name}院校${admissionIcon('right')}</button><button data-a-favorites>${admissionIcon('star')}我的目标院校</button></div><div class="admissions-hero-tags">${(admissionsMode==='recommendation'?['本校推荐','夏令营','预推免']:['择校','初试','复试与调剂']).map(t=>`<span>${t}</span>`).join('')}</div></div><div class="admissions-hero-art" aria-hidden="true"><div class="admissions-orbit orbit-one"></div><div class="admissions-orbit orbit-two"></div><span class="admissions-art-number">${admissionsMode==='recommendation'?'01':'02'}</span><div class="admissions-art-caption">${mode.name}<small>YOUR NEXT CHAPTER</small></div></div></div><div class="admissions-metrics">${[['候选院校',units.length],['可查资料',records.length],['已有原件',saved],['关注院校',favorites.size]].map(([label,n])=>`<div><span>${label}</span><b>${n.toLocaleString()}</b></div>`).join('')}</div><div class="admissions-section-heading"><div><span class="eyebrow">YOUR PATH</span><h3>${mode.name}准备，从这里开始</h3></div><span>按院校查资料，按阶段做准备</span></div><div class="admissions-path">${routes.map(([n,title,copy,destination])=>`<button data-a-path="${destination}"><small>${n}</small><strong>${title}</strong><span>${copy}</span>${admissionIcon('right')}</button>`).join('')}</div><div class="admissions-section-heading"><div><span class="eyebrow">RECENT RECORDS</span><h3>最近收录的${mode.name}资料</h3></div><button data-go="directory">全部院校${admissionIcon('right')}</button></div><div class="admissions-recent">${recent.map(r=>`<button data-a-open-record="${esc(r.key)}"><span class="admissions-recent-date">${esc(r.published||'日期未标注')}</span><span><strong>${esc(r.title)}</strong><small>${esc(r.filing.school)} · ${esc(r.topic)}${r.route==='shared'?' · 通用资料':''}</small></span>${admissionIcon('right')}</button>`).join('')||empty('还没有匹配资料，可以先从院校官方入口开始。')}</div><p class="admissions-footnote">这里展示现有收录资料，发布日期与保存日期分开记录；没有收录结果不代表院校没有发布公告。</p>`;
}
function renderAdmissionsDirectory(){
 if(!prepareAdmissionsData())return;
 const focusId=document.activeElement?.id;
 const state=admissionsStates[admissionsMode],mode=admissionsModes[admissionsMode],favorites=new Set(data.settings.favorites||[]),all=[...admissionsView.units.values()];
 $('#admissions-directory-eyebrow').textContent=mode.en+' / INSTITUTIONS';
 $('#a-school-query').value=state.query;
 $('#admissions-filters').innerHTML=admissionsSelect('a-school-province','省份',all.map(u=>u.province),state.province)+admissionsSelect('a-school-direction','专业方向',all.flatMap(u=>u.directions||[]),state.direction)+admissionsSelect('a-school-tier','院校类型',all.map(u=>u.tier),state.tier);
 const q=state.query.trim().toLowerCase();
 let rows=all.filter(u=>(!q||[u.school,u.province,...(u.aliases||[]),...(u.directions||[])].join(' ').toLowerCase().includes(q))&&(!state.province||u.province===state.province)&&(!state.direction||u.directions?.includes(state.direction))&&(!state.tier||(state.tier==='favorites'?favorites.has(u.id):u.tier===state.tier))&&(!state.topic||u.records.some(r=>r.topic===state.topic)));
 rows.sort((a,b)=>state.sort==='name'?a.school.localeCompare(b.school,'zh'):state.sort==='saved'?b.saved-a.saved:Number(favorites.has(b.id))-Number(favorites.has(a.id))||Number(a.fit!=='核心')-Number(b.fit!=='核心'));
 const pages=Math.max(1,Math.ceil(rows.length/admissionsSize));state.page=Math.max(1,Math.min(state.page,pages));
 $('#a-school-sort').value=state.sort;
 $('#admissions-topics').innerHTML=['',...mode.topics].map(t=>`<button data-a-topic="${t}" aria-pressed="${state.topic===t}" class="${state.topic===t?'active':''}">${t||'全部主题'}</button>`).join('');
 $('#admissions-result-count').textContent=`${rows.length} 所匹配 · ${state.topic||mode.name+'院校'}${state.tier==='favorites'?' · 我的关注':''}`;
 $('#admissions-school-grid').innerHTML=rows.slice((state.page-1)*admissionsSize,state.page*admissionsSize).map(u=>{
  const topics=mode.topics.map(t=>[t,u.records.filter(r=>r.topic===t).length]);
  return `<article class="admissions-school-card" data-a-school="${esc(u.id)}"><div class="admissions-card-identity"><span class="admissions-emblem">${u.tier==='研究所'?'CAS':u.tier==='985'?'985':'UNI'}</span><div><h3>${esc(u.school)}</h3><span>${esc(u.province||'地区待核实')} · ${esc(u.fit||u.tier)}</span></div><button data-favorite="${esc(u.id)}" class="admissions-favorite ${favorites.has(u.id)?'selected':''}" aria-label="${favorites.has(u.id)?'取消关注':'关注'} ${esc(u.school)}" aria-pressed="${favorites.has(u.id)}">${admissionIcon('star')}</button></div><div class="admissions-direction-tags">${(u.directions||[]).slice(0,4).map(d=>`<span>${esc(d)}</span>`).join('')}</div><div class="admissions-card-counts"><div><b>${u.records.length}</b><span>可查资料</span></div><div><b>${u.saved}</b><span>已有原件</span></div><div><b>${u.entries.length}</b><span>官方入口</span></div></div><div class="admissions-card-topics">${topics.slice(0,3).map(([t,n])=>`<button data-a-school-open="${esc(u.id)}" data-a-start-topic="${t}"><span>${t}</span><small>${n||'待收录'}</small>${admissionIcon('right')}</button>`).join('')}</div><div class="admissions-card-footer"><button class="primary" data-a-school-open="${esc(u.id)}">进入院校${admissionIcon('right')}</button>${link(u.url,'官网')}</div></article>`;
 }).join('')||`<div class="admissions-empty"><h3>暂时没有匹配的院校</h3><p>${state.topic?'这个主题尚未收录匹配资料。可清空主题，从官方入口继续查看。':'试试院校全称、专业方向，或减少筛选条件。'}</p><button data-a-reset>清空筛选</button></div>`;
 $('#admissions-school-pager').innerHTML=admissionsPager(state.page,pages,'a-school');
 if(focusId?.startsWith('a-school-')&&document.activeElement?.id!==focusId)$('#'+focusId)?.focus({preventScroll:true});
 admissionsSave();
}
renderDirectory=renderAdmissionsDirectory;
function renderAdmissionsHome(){
 if(admissionsMode==='recommendation')return admissionsLegacyHome();
 $('#home-content').innerHTML=`<div class="page-intro"><span class="eyebrow">YOUR STUDY DESK</span><h2>把目标拆成可执行的准备。</h2><p>先确认目标院校的专业代码和考试科目，再安排复习与材料。目标入学年份：${data.settings.target_year}。</p></div><div class="two-col"><article class="panel"><h2>院校与科目核对</h2><p>在院校详情中查看当年的目录、初试科目和参考资料；未收录的内容通过官方校院入口核对。</p><button data-a-path="初试与参考书">查看初试资料${admissionIcon('right')}</button></article><article class="panel"><h2>我的备考笔记</h2><p>记录院校、专业、参考书和待确认事项，把每个数值与原文来源放在一起。</p><button data-go="notes">打开考研笔记${admissionIcon('right')}</button></article></div>`;
}
renderHome=renderAdmissionsHome;
render=()=>{
 if(!prepareAdmissionsData())return;
 updateAdmissionsChrome();
 if(activeTab==='overview')renderAdmissionsOverview();
 else if(activeTab==='directory')renderAdmissionsDirectory();
 else admissionsLegacyRender();
 updateAdmissionsChrome();
 document.body.classList.toggle('admissions-own-view',['overview','directory'].includes(activeTab));
 if($('#admissions-school-dialog').open)renderAdmissionsDetail();
};

const admissionsLegacyGo=go;
go=tab=>{admissionsStates[admissionsMode].tab=titles[tab]?tab:'overview';admissionsLegacyGo(tab);admissionsSave()};
const admissionsLegacyControls=()=>$$('#sources .source-filters input,#sources .source-filters select,#archives .toolbar input,#archives .toolbar select,#archives .archive-filters input,#archives .archive-filters select,#updates .toolbar input,#updates .toolbar select,#notes .toolbar input,#notes .toolbar select,#policy .toolbar select');
function rememberAdmissionsControls(){const state=admissionsStates[admissionsMode];state.legacy=Object.fromEntries(admissionsLegacyControls().map(el=>[el.id,el.type==='checkbox'?el.checked:el.value]));admissionsSave()}
function restoreAdmissionsControls(){const saved=admissionsStates[admissionsMode].legacy;for(const el of admissionsLegacyControls()){if(el.type==='checkbox')el.checked=typeof saved[el.id]==='boolean'?saved[el.id]:el.id==='archive-latest';else el.value=typeof saved[el.id]==='string'?saved[el.id]:el.tagName==='SELECT'?el.options[0]?.value||'':''}}
function switchAdmissionsMode(mode){
 if(!admissionsModes[mode]||mode===admissionsMode)return;
 clearTimeout(admissionsSearchTimer);clearTimeout(admissionsDetailTimer);rememberAdmissionsControls();
 $('#admissions-school-dialog').close();$('#research-dialog').close();$('#ai-dialog').close();closeMobileFilters();
 admissionsMode=mode;remember('admissions-mode',mode);
 if(admissionsIndex){admissionsView=admissionsIndex.view(mode);data=admissionsView.data}
 Object.assign(cardBrowse,{unit:null,year:null,record:null,version:null});
 selectedArchives.clear();archivePage=1;monitorPrefs.page=1;monitorPrefs.signature='';monitorPrefs.open.clear();tabTrail.length=0;trailCursor=-1;
 restoreAdmissionsControls();go(admissionsStates[mode].tab);restoreAdmissionsControls();render();
}
function openAdmissionsSchool(id,topic='',record=null){
 const unit=admissionsView?.units.get(id);if(!unit)return;
 clearTimeout(admissionsDetailTimer);
 Object.assign(admissionsDetail,{unit:id,query:'',year:'',department:'',format:'',topic,saved:false,page:1,record,version:null});
 $('#a-detail-query').value='';$('#a-detail-saved').checked=false;
 renderAdmissionsDetail();$('#admissions-school-dialog').showModal();
 if(!record)$('#a-detail-query').focus();
}
function renderAdmissionsDetail(){
 const unit=admissionsView?.units.get(admissionsDetail.unit);if(!unit)return;
 const focusId=document.activeElement?.id;
 const d=admissionsDetail,mode=admissionsModes[admissionsMode],rows=unit.records;
 $('#admissions-school-title').textContent=unit.school;
 $('#admissions-school-kicker').textContent=mode.name+'院校 / '+(unit.province||'');
 $('#admissions-school-subtitle').textContent=`${(unit.directions||[]).join(' · ')} · ${rows.length} 条资料 · ${unit.saved} 条已有原件`;
 $('.admissions-detail-tabs').innerHTML=['',...mode.topics].map(t=>`<button data-a-detail-topic="${t}" aria-pressed="${d.topic===t}" class="${d.topic===t?'active':''}">${t||'全部资料'}${t?`<small>${rows.filter(r=>r.topic===t).length}</small>`:''}</button>`).join('');
 $('#admissions-detail-filters').innerHTML=admissionsSelect('a-detail-year','年份',rows.map(r=>r.year),d.year)+admissionsSelect('a-detail-department','院系',rows.map(r=>r.filing.department),d.department)+admissionsSelect('a-detail-format','文件类型',rows.map(r=>r.format),d.format);
 const q=d.query.trim().toLowerCase(),matched=rows.filter(r=>(!q||r.searchText.includes(q))&&(!d.year||r.year===d.year)&&(!d.department||r.filing.department===d.department)&&(!d.format||r.format===d.format)&&(!d.topic||r.topic===d.topic)&&(!d.saved||r.versions.length));
 const pages=Math.max(1,Math.ceil(matched.length/admissionsSize));d.page=Math.max(1,Math.min(d.page,pages));
 $('#admissions-detail-count').textContent=`${matched.length} 条匹配 / ${rows.length} 条院校资料 · ${d.topic||'全部主题'}`;
 $('#admissions-detail-list').innerHTML=matched.slice((d.page-1)*admissionsSize,d.page*admissionsSize).map(r=>`<button class="admissions-record" data-a-record="${esc(r.key)}"><span class="admissions-record-format">${r.format}</span><span class="admissions-record-copy"><strong>${esc(r.title)}</strong><small>${esc(admissionYear(r.year))} · ${esc(r.filing.department||'院系未标注')} · ${esc(r.topic)}${r.route==='shared'?' · 通用资料':''}</small><small>发布：${esc(r.published||'未标注')}<span class="admissions-mobile-state"> · ${r.versions.length?'已有原件':'通知索引'}</span></small></span><span class="admissions-record-state ${r.versions.length?'saved':''}">${r.versions.length?'已有原件':'通知索引'}</span>${admissionIcon('right')}</button>`).join('')||`<div class="admissions-empty"><h3>这个条件下还没有收录资料</h3><p>可清空筛选，或展开下方官方入口核对最新通知。</p><button data-a-detail-reset>清空筛选</button></div>`;
 $('#admissions-detail-pager').innerHTML=admissionsPager(d.page,pages,'a-detail');
 $('#admissions-official-entries summary span').textContent=unit.entries.length+' 个';
 $('#admissions-official-list').innerHTML=groupedEntries(unit)+(!isPublicRuntime?`<div class="actions"><button data-research-unit="${esc(unit.id)}">联网补充这所院校</button></div>`:'');
 $('#admissions-detail-search').hidden=!!d.record;$('.admissions-detail-tabs').hidden=!!d.record;
 $('#admissions-detail-reader').hidden=!d.record;
 if(d.record)renderAdmissionsReader();
 else if(focusId?.startsWith('a-detail-')&&document.activeElement?.id!==focusId)$('#'+focusId)?.focus({preventScroll:true});
}
function renderAdmissionsReader(){
 const d=admissionsDetail,r=admissionsView.recordByKey.get(d.record);if(!r)return;
 const snapshot=r.versions.find(v=>v.id===d.version)||r.versions[0];d.version=snapshot?.id||null;
 $('#admissions-detail-reader').innerHTML=`<button class="admissions-reader-back" data-a-reader-back>${admissionIcon('left')}返回搜索结果</button><h3 tabindex="-1">${esc(r.title)}</h3><div class="admissions-reader-meta">${esc(admissionYear(r.year))} · ${esc(r.filing.department||'院系未标注')} · ${esc(r.topic)}<br>发布 ${esc(r.published||'未标注')}${snapshot?' · 保存 '+esc(stamp(snapshot.created)):''}</div><div class="admissions-reader-actions">${link(r.url,'官方原文')}${snapshot?`<a class="button" href="${esc(cardArchiveUrl(snapshot,'raw'))}" download>下载 ${r.format} 原件${admissionIcon('download')}</a>${r.versions.length>1?`<label>历史版本<select id="a-reader-version" aria-label="原件历史版本">${r.versions.map(v=>`<option value="${v.id}" ${v.id===snapshot.id?'selected':''}>${esc(stamp(v.created))}</option>`).join('')}</select></label>`:''}<a class="button" href="${esc(cardArchiveUrl(snapshot,'manifest'))}" target="_blank" rel="noopener">来源与校验</a>${!isPublicRuntime||data.ai_summaries?.[snapshot.id]?`<button data-ai-summary="${snapshot.id}">AI 辅助摘要</button>`:''}`:''}</div>${snapshot?`<p class="hint">已保存正文；PDF、表格和图片的完整排版请下载原件查看。</p><pre id="admissions-reader-text" data-snapshot="${snapshot.id}" aria-live="polite">正在读取已保存正文…</pre>`:'<div class="admissions-empty"><h3>这条通知尚未保存原件</h3><p>目前可以查看通知索引与官方原文链接。</p></div>'}`;
 if(snapshot)loadAdmissionsText(snapshot,$('#admissions-reader-text'));
}
async function loadAdmissionsText(snapshot,target){
 const url=cardArchiveUrl(snapshot,'text');
 try{
  if(!admissionsTextCache.has(url)){
   if(admissionsTextCache.size>=8)admissionsTextCache.delete(admissionsTextCache.keys().next().value);
   admissionsTextCache.set(url,fetch(url).then(r=>{if(!r.ok)throw Error('HTTP '+r.status);return r.text()}));
  }
  const text=await admissionsTextCache.get(url);
  if(target.isConnected)target.textContent=text.trim()||'这个原件没有可用的文本提取结果，请下载原件查看。';
 }catch(error){admissionsTextCache.delete(url);if(target.isConnected)target.textContent='正文暂时读取失败：'+error.message+'。可下载原件或稍后重试。'}
}
function admissionsRecordOwner(key){return admissionsView.recordByKey.get(key)?.unitId}
function admissionsPath(destination){
 if(titles[destination])return go(destination);
 Object.assign(admissionsStates[admissionsMode],{topic:destination,page:1});go('directory');
}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;const d=b.dataset;
 if(d.admissionsMode)return switchAdmissionsMode(d.admissionsMode);
 if(!data)return;
 if(b.hasAttribute('data-a-favorites')){Object.assign(admissionsStates[admissionsMode],{tier:'favorites',page:1,topic:''});go('directory')}
 if(d.aPath)admissionsPath(d.aPath);
 if(b.hasAttribute('data-a-reset')){Object.assign(admissionsStates[admissionsMode],{query:'',province:'',direction:'',tier:'',topic:'',page:1});renderAdmissionsDirectory();$('#a-school-query').focus()}
 if(b.hasAttribute('data-a-topic')){Object.assign(admissionsStates[admissionsMode],{topic:d.aTopic,page:1});renderAdmissionsDirectory()}
 if(d.aSchoolPage){admissionsStates[admissionsMode].page=Number(d.aSchoolPage);renderAdmissionsDirectory();$('#admissions-directory').scrollIntoView({block:'start'})}
 if(d.aSchoolOpen)openAdmissionsSchool(d.aSchoolOpen,d.aStartTopic||'');
 if(d.aOpenRecord)openAdmissionsSchool(admissionsRecordOwner(d.aOpenRecord),'',d.aOpenRecord);
 if(b.hasAttribute('data-a-close'))$('#admissions-school-dialog').close();
 if(b.hasAttribute('data-a-detail-topic')){Object.assign(admissionsDetail,{topic:d.aDetailTopic,page:1});renderAdmissionsDetail()}
 if(b.hasAttribute('data-a-detail-reset')){Object.assign(admissionsDetail,{query:'',year:'',department:'',format:'',topic:'',saved:false,page:1});$('#a-detail-query').value='';$('#a-detail-saved').checked=false;renderAdmissionsDetail()}
 if(d.aDetailPage){admissionsDetail.page=Number(d.aDetailPage);renderAdmissionsDetail();$('#admissions-detail-count').scrollIntoView({block:'nearest'})}
 if(d.aRecord){clearTimeout(admissionsDetailTimer);admissionsDetail.record=d.aRecord;admissionsDetail.version=null;renderAdmissionsDetail();$('#admissions-detail-reader h3').focus({preventScroll:true});$('#admissions-school-dialog').scrollTop=0}
 if(b.hasAttribute('data-a-reader-back')){const key=admissionsDetail.record;admissionsDetail.record=null;renderAdmissionsDetail();$$('[data-a-record]').find(el=>el.dataset.aRecord===key)?.focus({preventScroll:true})}
});
$('#a-school-query').addEventListener('input',e=>{admissionsStates[admissionsMode].query=e.target.value;admissionsStates[admissionsMode].page=1;clearTimeout(admissionsSearchTimer);admissionsSearchTimer=setTimeout(renderAdmissionsDirectory,140)});
$('#a-detail-query').addEventListener('input',e=>{admissionsDetail.query=e.target.value;admissionsDetail.page=1;clearTimeout(admissionsDetailTimer);admissionsDetailTimer=setTimeout(renderAdmissionsDetail,140)});
document.addEventListener('change',e=>{
 const id=e.target.id;
 const directoryFields={'a-school-province':'province','a-school-direction':'direction','a-school-tier':'tier','a-school-sort':'sort'};
 const detailFields={'a-detail-year':'year','a-detail-department':'department','a-detail-format':'format','a-detail-saved':'saved'};
 if(directoryFields[id]){admissionsStates[admissionsMode][directoryFields[id]]=e.target.value;admissionsStates[admissionsMode].page=1;renderAdmissionsDirectory()}
 if(detailFields[id]){admissionsDetail[detailFields[id]]=id==='a-detail-saved'?e.target.checked:e.target.value;admissionsDetail.page=1;renderAdmissionsDetail()}
 if(id==='a-reader-version'){admissionsDetail.version=Number(e.target.value);renderAdmissionsReader()}
});
$('.admissions-switch').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const mode=e.key==='ArrowLeft'||e.key==='Home'?'recommendation':'examination';switchAdmissionsMode(mode);$(`[data-admissions-mode="${mode}"]`).focus()});
$('#admissions-school-dialog').addEventListener('click',e=>{if(e.target!==e.currentTarget)return;const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.currentTarget.close()});

// Lightweight revision polling replaces repeated multi-megabyte state requests.
if(!isPublicRuntime){
 let stateRequest=null,lastRevision='',pollTimer;
 load=()=>{
  if(stateRequest)return stateRequest;
  stateRequest=(async()=>{try{const response=await fetch('/api/state');if(!response.ok)throw Error('HTTP '+response.status);const next=await response.json();data=next;render()}catch(error){$('#job').textContent='连接中断：'+error.message+'。请启动本机助手后刷新。'}finally{stateRequest=null}})();
  return stateRequest;
 };
 async function pollAdmissions(){
  clearTimeout(pollTimer);
  try{
   if(!document.hidden&&!$('#editor').open&&!$('#discovery').open){
    const response=await fetch('/api/revision');if(!response.ok)throw Error('HTTP '+response.status);
    const next=await response.json();if(next.revision!==lastRevision){lastRevision=next.revision;await load()}
   }
  }catch(error){$('#job').textContent='连接中断：'+error.message+'。请启动本机助手后刷新。'}
  finally{pollTimer=setTimeout(pollAdmissions,data?.job.running?3000:15000)}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)pollAdmissions()});
 pollAdmissions();
}
const initialAdmissionsTab=titles[location.hash.slice(1)]?location.hash.slice(1):admissionsStates[admissionsMode].tab;
// This workspace owns initial routing, including its first legacy-tab transition.
initialViewApplied=true;
restoreAdmissionsControls();go(initialAdmissionsTab);
