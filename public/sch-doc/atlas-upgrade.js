'use strict';
// V9: grouped monitoring, evidence tools, context navigation and touch ergonomics.
const monitorPrefs={page:1,size:Number(pref('monitor-size','12')),expand:Number(pref('monitor-expand','0')),signature:'',open:new Set()};
if(![6,12,24,48].includes(monitorPrefs.size))monitorPrefs.size=12;
if(![0,1,3,6,12,24,48].includes(monitorPrefs.expand))monitorPrefs.expand=0;
const entryGroups=['学校与研究所官网','研究生院与招生','化学与化工院系','相关院系与研究方向','通知与附件直链'];
const previousEntryLink=entryLink;
entryLink=e=>previousEntryLink(e).replace('</small>',`${e.verified_at?' · 核验 '+esc(stamp(e.verified_at)):''}</small>${e.kind==='学科归属'?`<small>${esc(e.note)}</small>`:''}`).replace('<span class="live-mark">已接入</span>',`<span class="live-mark">${esc(e.collection_status||'已接入')}</span>`);
function entryGroup(e){if(e.group)return e.group;const label=e.label||'';if(/20\d{2}|\.pdf|\.doc|\.xls/i.test(label+' '+e.url))return entryGroups[4];if(/化学|化工/.test(label))return entryGroups[2];if(/材料|能源|环境|生物工程|生物化学|高分子|催化/.test(label))return entryGroups[3];if(/研究生|研招|招生|教育处/.test(label))return entryGroups[1];return entryGroups[0]}
function groupedEntries(unit){return entryGroups.map(group=>{const entries=(unit.entries||[]).filter(e=>entryGroup(e)===group);return `<details class="entry-category"><summary>${esc(group)}<small>${entries.length}</small></summary>${entries.map(entryLink).join('')||`<p class="hint">${unit.tier==='研究所'&&group===entryGroups[2]?'研究所以研究方向和招生部门归类。':'本轮未找到可确认入口；可用联网补充继续检索。'}</p>`}</details>`}).join('')}
const entryDirectory=renderDirectory;
renderDirectory=()=>{entryDirectory();for(const card of $$('.institution-card')){const unit=data.institutions.find(u=>u.id===card.dataset.unit);const entries=card.querySelector('.institution-entries,.card-official-entries');if(!unit||!entries)continue;const summary=entries.querySelector('summary').outerHTML;entries.innerHTML=summary+groupedEntries(unit)}refreshNavigator()};
const originalCardBrowser=renderCardBrowser;
renderCardBrowser=(focus=false)=>{originalCardBrowser(focus);const unit=data?.institutions.find(u=>u.id===cardBrowse.unit);const entries=$('.is-browsing .card-official-entries');if(entries&&unit)entries.innerHTML=entries.querySelector('summary').outerHTML+groupedEntries(unit);const actions=$('.card-reading-actions');if(actions&&cardBrowse.version&&(!isPublicRuntime||data.ai_summaries?.[cardBrowse.version]))actions.insertAdjacentHTML('beforeend',`<button data-ai-summary="${cardBrowse.version}">${isPublicRuntime?'查看 AI 辅助摘要':'AI 摘要与待办'}</button>`);refreshNavigator()};

view='groups';
$('#sources .workspace-banner h2').textContent='按院校管理监控';
$('#sources .workspace-banner .eyebrow').textContent='INSTITUTIONS / MONITOR';
$('#sources .view-bar').innerHTML='<button data-view="groups">全部院校</button><button data-view="focus">有更新</button>';
$('#source-list').insertAdjacentHTML('beforebegin',`<div class="monitor-controls"><label>每页院校<select id="monitor-size">${[6,12,24,48].map(n=>`<option value="${n}">${n} 所</option>`).join('')}</select></label><label>每页默认展开<select id="monitor-expand">${[0,1,3,6,12,24,48].map(n=>`<option value="${n}">${n?`${n} 所`:'全部收起'}</option>`).join('')}</select></label><button id="monitor-fold">收起本页</button><button data-open-research>联网补充</button></div>`);
$('#source-list').insertAdjacentHTML('afterend','<div id="monitor-pager" class="monitor-pager" aria-label="监控分页"></div>');
$('#monitor-size').value=monitorPrefs.size;$('#monitor-expand').value=monitorPrefs.expand;
function monitorSource(s){return `<article class="monitor-source"><div class="monitor-source-main"><div class="source-tags">${badge(!s.enabled?'已暂停':s.error?'抓取失败':hasUpdate(s)?'有更新':s.checked?'已检查':'待检查')}<span>${esc(s.source_type)}</span></div><h4>${esc(s.name)}</h4><p>${link(s.url,'具体直链')}</p><small>每 ${s.interval_hours} 小时 · 采集 ${s.pages} 页 · 上次 ${esc(stamp(s.checked))}</small>${s.error?`<p class="error-text">${esc(s.error)}</p>`:''}</div><details class="monitor-source-settings" data-setting-id="${s.id}"><summary>设置与操作</summary><p class="hint">${esc(s.note||'调整检查频率、采集页数和启用状态。')}</p><div class="actions"><button data-check="${s.id}" ${data.job.running||!s.enabled?'disabled':''}>检查</button><button data-edit-source="${s.id}">编辑设置</button><button data-backfill="${s.id}" ${data.job.running||!s.enabled?'disabled':''}>补采历史</button><button data-pin="${s.id}" aria-pressed="${!!s.pinned}">${s.pinned?'取消置顶':'置顶'}</button></div></details></article>`}
let visibleMonitorUnits=[];
renderSources=()=>{
 if(!data)return;
 const settingsOpen=new Set($$('#source-list [data-setting-id][open]').map(e=>e.dataset.settingId));
 const categoryOpen=new Set($$('#source-list [data-monitor-unit]').flatMap(e=>[...e.querySelectorAll('.entry-category[open]')].map(c=>e.dataset.monitorUnit+'|'+c.querySelector('summary').textContent)));
 const focusId=document.activeElement?.id;
 const schoolSelect=$('#source-school'),selected=schoolSelect.value;
 schoolSelect.innerHTML='<option value="">全部学校</option>'+[...new Set([...data.institutions.map(u=>u.school),...data.sources.map(s=>s.school||s.name)])].sort((a,b)=>a.localeCompare(b,'zh')).map(s=>`<option ${s===selected?'selected':''}>${esc(s)}</option>`).join('');
 const filter=['source-search','source-school','source-type','source-category','source-status'].map(id=>$('#'+id).value);
 const signature=JSON.stringify([filter,view,sortMode,monitorPrefs.size]);
 if(signature!==monitorPrefs.signature){monitorPrefs.page=1;monitorPrefs.signature=signature;monitorPrefs.open.clear();monitorPrefs.pendingDefaults=true}
 const [query,schoolFilter,type,category,status]=filter,q=query.trim().toLowerCase();
 const categorySources=new Set(category?data.items.filter(i=>categoryOf(i)===category).map(i=>i.source_id):[]);
 const matched=s=>(status==='paused'||!(s.note||'').includes('[非目标资料]'))&&(!type||s.source_type===type)&&(!category||s.category===category||categorySources.has(s.id))&&(!status||stateOf(s)===status)&&(view!=='focus'||hasUpdate(s));
 const seen=new Set();let units=data.institutions.map(u=>{const sources=data.sources.filter(s=>ownsSource(u,s));sources.forEach(s=>seen.add(s.id));return {...u,sources:sources.filter(matched)}});
 for(const s of data.sources.filter(s=>!seen.has(s.id)&&matched(s))){const name=s.school||s.name;let unit=units.find(u=>u.school===name);if(!unit){unit={id:'other-'+s.id,school:name,tier:'机构',entries:[],sources:[]};units.push(unit)}unit.sources.push(s)}
 units=units.filter(u=>(!schoolFilter||u.school===schoolFilter)&&(!q||(u.school+' '+u.entries.map(e=>e.label+' '+e.url).join(' ')+' '+u.sources.map(s=>s.name+' '+s.url).join(' ')).toLowerCase().includes(q))&&(!(type||category||status||view==='focus')||u.sources.length));
 units.sort((a,b)=>sortMode==='school'?a.school.localeCompare(b.school,'zh'):sortMode==='checked'?Math.max(0,...b.sources.map(s=>Date.parse(s.checked)||0))-Math.max(0,...a.sources.map(s=>Date.parse(s.checked)||0)):['985','相关高校','研究所','机构'].indexOf(a.tier)-['985','相关高校','研究所','机构'].indexOf(b.tier));
 const pages=Math.max(1,Math.ceil(units.length/monitorPrefs.size));monitorPrefs.page=Math.max(1,Math.min(pages,monitorPrefs.page));
 visibleMonitorUnits=units.slice((monitorPrefs.page-1)*monitorPrefs.size,monitorPrefs.page*monitorPrefs.size);
 if(monitorPrefs.pendingDefaults!==false){visibleMonitorUnits.slice(0,monitorPrefs.expand).forEach(u=>monitorPrefs.open.add(u.id));monitorPrefs.pendingDefaults=false}
 $('#source-summary').textContent=`${data.institutions.length} 所候选院校 / 研究所 · ${data.sources.length} 个监控来源`;
 $('#source-result-count').textContent=`${units.length} 所匹配 · 第 ${monitorPrefs.page} / ${pages} 页 · 本页 ${visibleMonitorUnits.length} 所`;
 $('#source-list').className='monitor-units';
 $('#source-list').innerHTML=visibleMonitorUnits.map(u=>`<details class="monitor-unit" data-monitor-unit="${esc(u.id)}" ${monitorPrefs.open.has(u.id)?'open':''}><summary><span class="institution-emblem">${u.tier==='研究所'?'CAS':esc(u.tier)}</span><span class="monitor-identity"><strong>${esc(u.school)}</strong><small>${u.sources.length} 个来源 · ${u.entries.length} 个分层入口 · ${u.sources.filter(s=>s.checked&&!s.error).length} 个检查成功</small></span>${guideArrow('right')}</summary><div class="monitor-unit-content"><div class="monitor-unit-toolbar"><span>${esc(u.province||'')} ${esc(u.focus||'')}</span><button data-research-unit="${esc(u.id)}">联网补充</button></div><div class="monitor-entry-groups">${groupedEntries(u)}</div><h3 class="monitor-subheading">已接入的监控 <small>${u.sources.length}</small></h3><div class="monitor-source-grid">${u.sources.map(monitorSource).join('')||'<p class="hint">尚无已接入来源。展开入口查看官网，或联网补充后试抓。</p>'}</div></div></details>`).join('')||empty('没有匹配院校，请调整筛选。');
 $('#monitor-pager').innerHTML=`<button data-monitor-page="${monitorPrefs.page-1}" ${monitorPrefs.page===1?'disabled':''}>上一页</button><label>页数 <input id="monitor-page" type="number" min="1" max="${pages}" value="${monitorPrefs.page}" aria-label="监控页数"> / ${pages}</label><button data-monitor-page="${monitorPrefs.page+1}" ${monitorPrefs.page===pages?'disabled':''}>下一页</button>`;
 for(const node of $$('#source-list [data-monitor-unit]')){node.ontoggle=()=>{node.open?monitorPrefs.open.add(node.dataset.monitorUnit):monitorPrefs.open.delete(node.dataset.monitorUnit);refreshNavigator()};for(const category of node.querySelectorAll('.entry-category'))if(categoryOpen.has(node.dataset.monitorUnit+'|'+category.querySelector('summary').textContent))category.open=true}
 for(const node of $$('#source-list [data-setting-id]'))if(settingsOpen.has(node.dataset.settingId))node.open=true;
 if(focusId&&$('#'+focusId))$('#'+focusId).focus({preventScroll:true});
 $$('#sources [data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
 $('.pending-schools').hidden=true;refreshNavigator();
};
function changeMonitorPage(n){monitorPrefs.page=Math.max(1,n||1);monitorPrefs.open.clear();monitorPrefs.pendingDefaults=true;renderSources();$('#source-result-count').scrollIntoView({block:'start',behavior:'smooth'})}
for(const [id,key] of [['monitor-size','size'],['monitor-expand','expand']])$('#'+id).onchange=e=>{monitorPrefs[key]=Number(e.target.value);remember(id,monitorPrefs[key]);monitorPrefs.pendingDefaults=true;monitorPrefs.open.clear();renderSources()};
$('#monitor-fold').onclick=()=>{monitorPrefs.open.clear();monitorPrefs.pendingDefaults=false;renderSources()};
document.addEventListener('change',e=>{if(e.target.id==='monitor-page')changeMonitorPage(Number(e.target.value))});

// Credentials never enter HTML or localStorage. Only status flags are rendered.
if(!isPublicRuntime){
 $('#settings-form button').insertAdjacentHTML('beforebegin','<hr><h2>Gemini 原文辅助</h2><p class="hint">只将手动选择的已存公开正文发送给 Gemini，生成摘要、日期与待办；结果单独保存在本机。首次生成调用 API，再次查看读取缓存。</p><label>Gemini 密钥（留空保留）<input type="password" name="gemini_api_key" autocomplete="new-password"></label><label><input type="checkbox" name="clear_gemini_key" value="1"> 清除 Gemini 密钥</label>');
 $('#settings-form').insertAdjacentHTML('afterend','<div class="provider-checks"><button data-provider-test="brave">测试 Brave</button><button data-provider-test="gemini">测试 Gemini</button><p id="provider-status" role="status"></p></div>');
 const previousSave=$('#settings-form').onsubmit;$('#settings-form').onsubmit=async e=>{await previousSave(e);e.target.elements.gemini_api_key.value='';e.target.elements.clear_gemini_key.checked=false};
}
document.body.insertAdjacentHTML('beforeend','<dialog id="research-dialog"><div class="section-head"><h2>联网补充官方资料</h2><button data-close-research aria-label="关闭联网搜索">关闭</button></div><p class="hint">Brave 用于寻找官网栏目、通知和附件。搜索摘要仅是线索；选择后会试抓原站。</p><form id="research-search"><label>学校、院系、年份或文件类型<input id="research-query" required placeholder="南京大学 化学化工学院 2027 推免"></label><button class="primary">搜索官方资料</button></form><p id="research-status" role="status"></p><div id="research-results"></div></dialog><dialog id="ai-dialog"><div class="section-head"><h2>AI 摘要与待办</h2><button data-close-ai>关闭</button></div><p class="hint">AI 辅助内容，请对照原文；未确认字段保留“待核实”。</p><div id="ai-source"></div><pre id="ai-answer" role="status"></pre></dialog>');
function openResearch(unit){if(isPublicRuntime){toast('联网补充在本机程序中使用');return}$('#research-query').value=unit?unit.school+' 研究生 化学 化工 2027 招生':'';$('#research-status').textContent='';$('#research-results').innerHTML='';$('#research-dialog').showModal();$('#research-query').focus()}
$('#research-search').onsubmit=async e=>{e.preventDefault();const button=e.submitter;button.disabled=true;$('#research-status').textContent='Brave 正在搜索…';try{const r=await post('provider-search',{query:$('#research-query').value});const rows=r.results.filter(x=>{try{return /\.(edu\.cn|ac\.cn|cas\.cn|gov\.cn)$/.test(new URL(x.url).hostname)}catch{return false}});$('#research-status').textContent=`找到 ${rows.length} 条官方域名线索，尚未核验原站。`;$('#research-results').innerHTML=rows.map(x=>`<article class="candidate"><h3>${esc(x.title)}</h3>${link(x.url,'官方直链')}<p>${esc(x.description.replace(/<[^>]*>/g,''))}</p><button data-research-preview="${esc(x.url)}">选择并试抓</button></article>`).join('')}catch(error){$('#research-status').textContent=error.message}finally{button.disabled=false}};

// Context actions use the current content hierarchy before falling back to tab history.
document.body.insertAdjacentHTML('beforeend',`<div id="context-navigator" role="region" aria-label="页面快捷操作"><button id="context-collapse" title="收起当前展开内容" hidden>收起</button><div id="context-panel" hidden><button data-context="top">到顶部</button><button data-context="bottom">到底部</button><button id="context-back" data-context="back">上一级</button><button id="context-next" data-context="next">下一级</button></div><button id="context-toggle" aria-expanded="false" aria-controls="context-panel" aria-label="展开页面快捷操作">${uiIcon('right')}<span>导航</span></button></div>`);
const tabTrail=[];let trailCursor=-1,trailNavigation=false;
const contextGo=go;go=tab=>{if(tab!==activeTab&&!trailNavigation){tabTrail.splice(trailCursor+1);if(trailCursor<0)tabTrail.push(activeTab);tabTrail.push(tab);trailCursor=tabTrail.length-1}document.body.classList.remove('mobile-header-away');contextGo(tab);refreshNavigator()};
function expandedInPage(){return $$('.page.active details[open]').filter(e=>e.getClientRects().length&&!e.classList.contains('advanced-filters'))}
function nextContextTarget(){if(activeTab==='directory')return cardBrowse.unit?$('.is-browsing [data-card-year],.is-browsing [data-card-record]'):$('[data-card-open]');return $$('.page.active details:not([open])').find(e=>e.getClientRects().length&&!e.classList.contains('advanced-filters')&&!e.classList.contains('monitor-source-settings'))?.querySelector('summary')}
function refreshNavigator(){const button=$('#context-collapse');if(!button)return;button.hidden=!(activeTab==='directory'&&cardBrowse.unit)&&expandedInPage().length===0;const back=$('#context-back'),next=$('#context-next');const inCard=activeTab==='directory'&&cardBrowse.unit;back.disabled=!inCard&&!expandedInPage().length&&trailCursor<=0;next.disabled=!nextContextTarget()&&!(activeTab==='sources'&&$('#monitor-pager button:last-child:not(:disabled)'))&&trailCursor>=tabTrail.length-1;}
$('#context-toggle').onclick=()=>{const open=$('#context-panel').hidden;$('#context-panel').hidden=!open;$('#context-toggle').setAttribute('aria-expanded',String(open))};
$('#context-collapse').onclick=()=>{if(activeTab==='directory'&&cardBrowse.unit)$('[data-card-close]')?.click();for(const d of expandedInPage())d.open=false;monitorPrefs.open.clear();refreshNavigator()};
document.addEventListener('toggle',e=>{if(e.target.tagName==='DETAILS')refreshNavigator()},true);
document.addEventListener('click',async e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.monitorPage)changeMonitorPage(Number(b.dataset.monitorPage));
 if(b.hasAttribute('data-open-research')||b.dataset.researchUnit)openResearch(data.institutions.find(u=>u.id===b.dataset.researchUnit));
 if(b.hasAttribute('data-close-research'))$('#research-dialog').close();
 if(b.hasAttribute('data-close-ai'))$('#ai-dialog').close();
 if(b.dataset.researchPreview){$('#research-dialog').close();openDiscovery({url:b.dataset.researchPreview});discover(b.dataset.researchPreview)}
 if(b.dataset.providerTest){b.disabled=true;$('#provider-status').textContent='正在测试…';try{const r=await post('provider-test',{provider:b.dataset.providerTest});$('#provider-status').textContent=`${b.dataset.providerTest} ${r.ok?'连接成功':'未返回结果'}${r.model?' · '+r.model:''}`}catch(error){$('#provider-status').textContent=error.message}finally{b.disabled=false}}
 if(b.dataset.aiSummary){$('#ai-dialog').showModal();$('#ai-answer').textContent='正在读取缓存或分析已保存的正文…';$('#ai-source').innerHTML='';try{const r=isPublicRuntime?data.ai_summaries[b.dataset.aiSummary]:await post('ai-summary',{snapshot_id:Number(b.dataset.aiSummary)});$('#ai-answer').textContent=r.text;$('#ai-source').innerHTML=link(r.url,'核对官方原文')+`<p class="hint">${esc(r.model)} · ${esc(r.created)}${r.truncated?' · 仅分析正文前 16000 字符':''}</p>`}catch(error){$('#ai-answer').textContent=error.message}}
 if(b.dataset.context){const action=b.dataset.context;if(action==='top'||action==='bottom')window.scrollTo({top:action==='top'?0:document.documentElement.scrollHeight,behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});else if(activeTab==='directory'&&cardBrowse.unit){if(action==='back'){if(cardBrowse.record)$('[data-card-back="records"]')?.click();else if(cardBrowse.year!==null)$('[data-card-back="years"]')?.click();else $('[data-card-close]')?.click()}else $('.is-browsing [data-card-year],.is-browsing [data-card-record]')?.click()}else if(action==='next'&&nextContextTarget()){const target=nextContextTarget();target.click();target.scrollIntoView({block:'center',behavior:'smooth'})}else if(action==='back'&&expandedInPage().length){expandedInPage().at(-1).open=false}else if(action==='next'&&activeTab==='sources')$('#monitor-pager button:last-child:not(:disabled)')?.click();else{const next=trailCursor+(action==='back'?-1:1);if(next>=0&&next<tabTrail.length){trailCursor=next;trailNavigation=true;go(tabTrail[trailCursor]);trailNavigation=false}}refreshNavigator()}
});
let previousScroll=scrollY,scrollDistance=0;
addEventListener('scroll',()=>{const delta=scrollY-previousScroll;previousScroll=scrollY;if(!mobileQuery.matches)return;scrollDistance=Math.sign(scrollDistance)===Math.sign(delta)?scrollDistance+delta:delta;if(scrollY<70||scrollDistance<-12)document.body.classList.remove('mobile-header-away');else if(scrollDistance>20&&!$('body>aside').contains(document.activeElement))document.body.classList.add('mobile-header-away')},{passive:true});
$('body>aside').addEventListener('focusin',()=>document.body.classList.remove('mobile-header-away'));
// Drag the mini filter vertically; a movement threshold keeps tapping distinct.
let capsuleDrag=null,suppressCapsuleClick=false;
function placeCapsule(top){const h=capsule.getBoundingClientRect().height;const bounded=Math.max(76,Math.min(innerHeight-h-84,top));capsule.style.setProperty('--mini-top',bounded+'px');capsule.classList.add('has-drag-position');return bounded}
capsule.addEventListener('pointerdown',e=>{if(!mobileQuery.matches||!capsule.classList.contains('is-mini')||e.button!==0)return;capsuleDrag={id:e.pointerId,y:e.clientY,top:capsule.getBoundingClientRect().top,moved:false};capsule.setPointerCapture(e.pointerId)});
capsule.addEventListener('pointermove',e=>{if(!capsuleDrag||e.pointerId!==capsuleDrag.id)return;const delta=e.clientY-capsuleDrag.y;if(Math.abs(delta)>7)capsuleDrag.moved=true;if(capsuleDrag.moved){capsule.classList.add('is-dragging');placeCapsule(capsuleDrag.top+delta);e.preventDefault()}});
function endCapsuleDrag(e){if(!capsuleDrag||e.pointerId!==capsuleDrag.id)return;if(capsuleDrag.moved){suppressCapsuleClick=true;remember('mini-position',capsule.getBoundingClientRect().top/innerHeight);setTimeout(()=>suppressCapsuleClick=false,500)}capsule.classList.remove('is-dragging');if(capsule.hasPointerCapture(e.pointerId))capsule.releasePointerCapture(e.pointerId);capsuleDrag=null}
capsule.addEventListener('pointerup',endCapsuleDrag);capsule.addEventListener('pointercancel',endCapsuleDrag);
capsule.addEventListener('click',e=>{if(suppressCapsuleClick){e.preventDefault();e.stopImmediatePropagation();suppressCapsuleClick=false}},true);
addEventListener('resize',()=>{if(mobileQuery.matches&&capsule.classList.contains('has-drag-position'))placeCapsule(Number(pref('mini-position','.7'))*innerHeight);if(!mobileQuery.matches)document.body.classList.remove('mobile-header-away')});
if(mobileQuery.matches&&pref('mini-position',''))placeCapsule(Number(pref('mini-position','.7'))*innerHeight);
const upgradeRender=render;render=()=>{upgradeRender();refreshNavigator()};
if(data)render();
