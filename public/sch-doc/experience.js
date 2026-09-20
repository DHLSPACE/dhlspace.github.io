'use strict';
// Shared desktop/mobile interactions. Works with both local and published data.
const moreDots='<span class="more-dots" aria-hidden="true"><i></i><i></i><i></i></span>';
document.body.insertAdjacentHTML('afterbegin','<a class="skip-link" href="#main-content">跳到主要内容</a>');
$('main').id='main-content';$('main').tabIndex=-1;
document.body.insertAdjacentHTML('beforeend',`<nav id="mobile-dock" aria-label="手机主导航">${['overview','directory','archives','updates'].map(id=>`<button data-mobile-go="${id}">${titles[id]}</button>`).join('')}<button id="mobile-more" aria-label="更多栏目" aria-haspopup="dialog" aria-controls="mobile-menu" aria-expanded="false">${moreDots}</button></nav><dialog id="mobile-menu" aria-labelledby="mobile-menu-title"><div class="sheet-handle"></div><div class="section-head"><div><span class="eyebrow">YOUR WORKSPACE</span><h2 id="mobile-menu-title">你的工作台</h2></div><button id="close-mobile-menu" aria-label="关闭栏目菜单">${uiIcon('close')}</button></div><div class="mobile-menu-grid">${Object.entries(titles).map(([id,name])=>`<button data-menu-go="${id}">${name}</button>`).join('')}</div><p class="hint">选择栏目。资料来源、保存状态和个人笔记各有自己的位置。</p></dialog><button id="capsule-backdrop" aria-label="关闭筛选面板" hidden tabindex="-1"></button>`);
$('aside nav').insertAdjacentHTML('beforeend',`<button id="desktop-more" aria-label="更多栏目" aria-haspopup="dialog" aria-controls="mobile-menu" aria-expanded="false">${moreDots}</button>`);
const menuTriggers=[$('#mobile-more'),$('#desktop-more')];
menuTriggers.forEach(b=>b.onclick=()=>{menuTriggers.forEach(x=>x.setAttribute('aria-expanded','true'));$('#mobile-menu').showModal()});
$('#mobile-menu').addEventListener('close',()=>menuTriggers.forEach(x=>x.setAttribute('aria-expanded','false')));
$('#close-mobile-menu').onclick=()=>$('#mobile-menu').close();
$('#mobile-menu').addEventListener('click',e=>{if(e.target===$('#mobile-menu')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close()}});
document.addEventListener('click',e=>{const b=e.target.closest('[data-mobile-go],[data-menu-go]');if(!b)return;$('#mobile-menu').close();closeMobileFilters();go(b.dataset.mobileGo||b.dataset.menuGo)});
const mobileQuery=matchMedia('(max-width:760px)');
if(mobileQuery.matches){capsuleMini=true;$('#mini-capsule').checked=true}
function closeMobileFilters(){if(mobileQuery.matches&&!capsuleMini){$('#mini-capsule').checked=true;setCapsule()}}
$('#capsule-backdrop').onclick=closeMobileFilters;
function updateMobileFilters(){
  const open=mobileQuery.matches&&capsuleEnabled&&!capsuleMini;
  $('#capsule-backdrop').hidden=!open;
  document.body.classList.toggle('filter-sheet-open',open);
  capsule.setAttribute('role',open?'dialog':'region');
  if(open)capsule.setAttribute('aria-modal','true');else capsule.removeAttribute('aria-modal');
  for(const node of [$('main'),$('body>aside'),$('#mobile-dock')])node.inert=open;
}
mobileQuery.addEventListener('change',()=>{if(mobileQuery.matches){$('#mini-capsule').checked=true;capsuleMini=true}renderCapsule()});
capsule.addEventListener('keydown',e=>{if(e.key==='Tab'&&mobileQuery.matches&&!capsuleMini){const items=[...capsule.querySelectorAll('button,input,a')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}});

let facetSearch='';
let lastFacet='';
const originalCapsule=renderCapsule;
renderCapsule=()=>{
  const focused=document.activeElement;
  const focusId=capsule.contains(focused)?focused.id:'';
  originalCapsule();
  if(!data)return;
  if(lastFacet!==capsuleStage){facetSearch='';lastFacet=capsuleStage}
  if(!capsuleMini){
    const optionsEl=capsule.querySelector('.capsule-options');
    if(optionsEl&&optionsEl.children.length>9){
      optionsEl.insertAdjacentHTML('beforebegin',`<label class="facet-search"><span class="sr-only">搜索当前分类选项</span><input id="facet-search" type="search" placeholder="搜索选项…" value="${esc(facetSearch)}" autocomplete="off"></label><p id="facet-search-empty" class="hint" hidden>没有匹配选项，请换个关键词。</p>`);
      $('#facet-search').oninput=e=>{facetSearch=e.target.value;filterFacetOptions()};filterFacetOptions();
    }
    const total=activeTab==='directory'?directoryRows().length:activeTab==='archives'?filteredArchiveRows().length:null;
    if(total!==null)capsule.querySelector('.capsule-foot').insertAdjacentHTML('beforebegin',`<button id="capsule-results" class="capsule-results">查看 ${total} ${activeTab==='directory'?'个单位':'份资料'}<span aria-hidden="true">↗</span></button>`);
  }else{
    $('#capsule-expand').innerHTML=`${uiIcon('filter')}<small>筛选${capsuleFields().some(([id])=>facetValue(id)&&facetValue(id)!=='all')?' · 已选':''}</small>`;
  }
  if(focusId&&$('#'+focusId)&&focusId!=='facet-search')$('#'+focusId).focus({preventScroll:true});
  updateMobileFilters();
};
function filterFacetOptions(){const q=facetSearch.trim().toLocaleLowerCase();const buttons=[...capsule.querySelectorAll('[data-capsule-value]')];buttons.forEach(b=>b.hidden=!!q&&!b.textContent.toLocaleLowerCase().includes(q));if($('#facet-search-empty'))$('#facet-search-empty').hidden=buttons.some(b=>!b.hidden)}
capsule.addEventListener('click',e=>{
  if(e.target.closest('#capsule-results')){closeMobileFilters();const target=activeTab==='directory'?$('#directory-count'):$('#archive-count');target?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});target?.setAttribute('tabindex','-1');target?.focus({preventScroll:true})}
  if(e.target.closest('[data-capsule-stage]'))($('#facet-search')||$('#capsule-back')||$('#capsule-minimize'))?.focus({preventScroll:true});
});

// Advanced controls remain available while the primary screen stays compact.
for(const [selector,title] of [['.directory-toolbar','更多院校筛选'],['.archive-filters','更多资料筛选'],['.source-filters','更多监控筛选']]){
  const group=$(selector);if(!group)continue;
  const details=document.createElement('details');details.className='advanced-filters';details.innerHTML=`<summary>${title}<span>年份、地区与用途可组合</span></summary>`;group.before(details);details.append(group);
}
const enhancedGo=go;
go=tab=>{enhancedGo(tab);for(const b of $$('#mobile-dock [data-mobile-go]')){const active=b.dataset.mobileGo===activeTab;b.classList.toggle('active',active);active?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')}
  for(const b of $$('aside [data-tab]'))b.dataset.tab===activeTab?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current');
  if(location.hash!=='#'+activeTab)history.replaceState(null,'','#'+activeTab);
};
let initialViewApplied=false;
const experienceRender=render;
render=()=>{experienceRender();if(!data)return;
  if(!initialViewApplied){initialViewApplied=true;const tab=location.hash.slice(1);if(tab&&titles[tab]&&tab!==activeTab){go(tab);return}}
  for(const b of $$('#mobile-dock [data-mobile-go]')){b.classList.toggle('active',b.dataset.mobileGo===activeTab);b.dataset.mobileGo===activeTab?b.setAttribute('aria-current','page'):b.removeAttribute('aria-current')}
  $('#check-all').title=isPublicRuntime?'重新读取已发布资料':'手动检查已启用的来源';
  if(activeTab==='archives'){
    $('#download-bundle').textContent=`选中打包${selectedArchives.size?' · '+selectedArchives.size:''}`;
    $('#archives .toolbar [data-open-snapshot]').textContent='保存快照 ↓';
  }
};
window.addEventListener('hashchange',()=>{const tab=location.hash.slice(1);if(titles[tab]&&activeTab!==tab)go(tab)});
// Normalize legacy controls and newly rendered cards using the same SVG family.
const controlGlyphs={'↗':'external','→':'right','›':'right','‹':'left','↓':'download','×':'close','−':'minus','☷':'list','▦':'grid','◉':'focus','☆':'star','★':'star','✓':'check'};
function polishControls(){
  for(const el of $$('button,a,summary,.directory-stats b')){
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),nodes=[];
    while(walker.nextNode())if(/[↗→›‹↓×−☷▦◉☆★✓]/u.test(walker.currentNode.textContent))nodes.push(walker.currentNode);
    for(const node of nodes){
      if(!node.isConnected||node.parentElement.closest('svg,.guide-arrow,.card-record-copy,.outbound-link'))continue;
      const fragment=document.createDocumentFragment();
      for(const part of node.textContent.split(/([↗→›‹↓×−☷▦◉☆★✓])/u)){
        if(!controlGlyphs[part]){fragment.append(document.createTextNode(part));continue}
        const template=document.createElement('template');
        template.innerHTML=/[↗→›‹↓]/u.test(part)?guideArrow(controlGlyphs[part]):uiIcon(controlGlyphs[part]);
        fragment.append(template.content);
      }
      node.replaceWith(fragment);
    }
  }
}
let polishQueued=false;
new MutationObserver(()=>{if(polishQueued)return;polishQueued=true;requestAnimationFrame(()=>{polishQueued=false;polishControls()})}).observe(document.body,{childList:true,subtree:true});
polishControls();
// Keep the compact header reachable while a keyboard user is navigating it.
$('#main-content').addEventListener('focus',()=>closeMobileFilters());
render();
