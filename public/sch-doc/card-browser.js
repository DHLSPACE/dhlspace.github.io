'use strict';
// A read-only browser for existing local records. Opening a card never collects a URL.
const cardBrowse={unit:null,year:null,record:null,version:null,query:'',format:'',department:'',category:'',page:1,filtersOpen:false};
const cardTextCache=new Map();
let cardIndexData=null,cardIndex=new Map();
const cardRecordKey=x=>`${x.source_id}|${x.url}`;
const cardYear=x=>String(x.filing?.year||'待核实');
const cardYearLabel=year=>/^20\d{2}$/.test(year)?`${year} 年`:year==='待核实'?'年份待核实':year;
const cardYearSort=(a,b)=>/^20\d{2}$/.test(a)?(/^20\d{2}$/.test(b)?Number(b)-Number(a):-1):/^20\d{2}$/.test(b)?1:a.localeCompare(b,'zh');
function cardCategory(title,kind){
  if(kind==='list')return '栏目快照';
  if(/拟录取|复试|录取名单|调剂/.test(title))return '复试与录取';
  if(/推免|免试|夏令营|暑期学校|推荐资格/.test(title))return '推免与夏令营';
  if(/简章|章程|专业目录|招生目录/.test(title))return '简章与目录';
  if(/考试|参考书|大纲|初试/.test(title))return '考试与参考书';
  return '其他通知';
}
function cardRecords(unit){
  if(cardIndexData!==data){
    const rows=new Map();
    for(const item of data.items){
      if(!item.filing?.relevant)continue;
      const key=cardRecordKey(item);
      rows.set(key,{key,item,versions:[]});
    }
    for(const snapshot of data.snapshots){
      if(!snapshot.filing?.relevant||snapshot.kind==='异常页面')continue;
      const key=cardRecordKey(snapshot);
      if(!rows.has(key))rows.set(key,{key,item:null,versions:[]});
      rows.get(key).versions.push(snapshot);
    }
    cardIndex=new Map();
    for(const record of rows.values()){
      record.versions.sort((a,b)=>String(b.created).localeCompare(String(a.created))||b.id-a.id);
      const latest=record.versions[0],base=record.item||latest;
      Object.assign(record,{sourceId:base.source_id,url:base.url,title:base.display_title||base.title||'未命名资料',filing:base.filing,year:cardYear(base),published:record.item?.published||'',kind:latest?.kind||'notice'});
      record.format=latest?fileFormat(latest):fileFormat({raw_path:new URL(base.url,location.href).pathname});
      record.category=cardCategory(record.title,record.kind);
      if(!cardIndex.has(base.source_id))cardIndex.set(base.source_id,[]);
      cardIndex.get(base.source_id).push(record);
    }
    cardIndexData=data;
  }
  const sourceIds=data.sources.filter(s=>ownsSource(unit,s)).map(s=>s.id);
  return sourceIds.flatMap(id=>cardIndex.get(id)||[]).sort((a,b)=>b.published.localeCompare(a.published)||a.title.localeCompare(b.title,'zh'));
}
function cardScopeRows(rows){return rows.filter(r=>r.year===cardBrowse.year)}
function cardMatching(rows){
  const q=cardBrowse.query.trim().toLocaleLowerCase();
  return rows.filter(r=>(!q||`${r.title} ${r.filing.department} ${r.url}`.toLocaleLowerCase().includes(q))&&(!cardBrowse.format||r.format===cardBrowse.format)&&(!cardBrowse.department||r.filing.department===cardBrowse.department)&&(!cardBrowse.category||r.category===cardBrowse.category));
}
function cardFilterSelect(field,label,values){
  return `<label class="card-filter"><span>${label}</span><select id="card-filter-${field}" data-card-filter="${field}" aria-label="卡片内${label}"><option value="">全部${label}</option>${[...new Set(values)].filter(Boolean).sort((a,b)=>a.localeCompare(b,'zh')).map(v=>`<option value="${esc(v)}" ${cardBrowse[field]===v?'selected':''}>${esc(v)}</option>`).join('')}</select></label>`;
}
function cardArchiveUrl(snapshot,view){
  // Public paths are used only if this feature is explicitly published in a later revision.
  if(isPublicRuntime)return publicPath(snapshot[{text:'text_path',raw:'raw_path',manifest:'manifest_path'}[view]]);
  return `/api/archive?id=${snapshot.id}&view=${view}`;
}
function cardYearView(rows){
  const years=[...new Set(rows.map(r=>r.year))].sort(cardYearSort);
  return `<div class="card-stage-heading"><div><span class="eyebrow">01 / YEAR</span><h4 tabindex="-1">按年份查找</h4><p>${rows.length} 条相关记录 · ${rows.filter(r=>r.versions.length).length} 条已有原件</p></div></div>${years.length?`<div class="card-year-grid">${years.map(year=>{const group=rows.filter(r=>r.year===year),saved=group.filter(r=>r.versions.length).length;return `<button class="card-year" data-card-year="${esc(year)}"><span><strong>${esc(cardYearLabel(year))}</strong><small>${group.length} 条记录 · ${saved} 条已保存</small></span>${guideArrow('right')}</button>`}).join('')}</div>`:'<div class="card-empty">这所单位目前还没有相关通知或已保存资料。可展开下方官方入口；这里不会自动抓取。</div>'}<p class="card-basis">按现有标题中的招生年份整理；跨年栏目和未确定年份的资料单列，不用保存日期代替。</p>`;
}
function cardListView(rows){
  const scoped=cardScopeRows(rows),matched=cardMatching(scoped),pages=Math.max(1,Math.ceil(matched.length/12));
  cardBrowse.page=Math.min(cardBrowse.page,pages);
  return `<div class="card-stage-heading"><div><span class="eyebrow">02 / RECORDS</span><h4 tabindex="-1">${esc(cardYearLabel(cardBrowse.year))} · 通知与文件</h4></div><span class="card-result-count" role="status">${matched.length} / ${scoped.length} 条</span></div><div class="card-find"><label class="card-search"><span class="sr-only">在当前年份搜索</span><input id="card-record-search" type="search" value="${esc(cardBrowse.query)}" placeholder="搜索标题、院系或网址" autocomplete="off"></label><button id="card-filters-toggle" data-card-toggle-filters aria-expanded="${cardBrowse.filtersOpen}" aria-controls="card-refinements">${uiIcon('filter')}筛选${[cardBrowse.format,cardBrowse.department,cardBrowse.category].filter(Boolean).length?' · '+[cardBrowse.format,cardBrowse.department,cardBrowse.category].filter(Boolean).length:''}</button><div id="card-refinements" class="card-refinements ${cardBrowse.filtersOpen?'is-open':''}">${cardFilterSelect('format','文件类型',scoped.map(r=>r.format))}${cardFilterSelect('department','院系',scoped.map(r=>r.filing.department))}${cardFilterSelect('category','资料类别',scoped.map(r=>r.category))}<button data-card-reset>重置</button></div></div><p class="card-basis">类别由标题自动整理；“原件未保存”的记录仅有已有通知信息，类型按链接后缀识别。</p><div class="card-records">${matched.slice((cardBrowse.page-1)*12,cardBrowse.page*12).map(r=>`<button class="card-record" data-card-record="${esc(r.key)}"><span class="card-file-format">${esc(r.format)}</span><span class="card-record-copy"><strong>${esc(r.title)}</strong><small>${esc(r.filing.department)} · ${esc(r.category)} · ${r.published?'发布 '+esc(r.published):'发布日期未标注'}</small></span><span class="card-record-state ${r.versions.length?'is-saved':''}">${r.versions.length?'已保存'+(r.versions.length>1?` · ${r.versions.length} 版`:''):'原件未保存'}</span>${guideArrow('right')}</button>`).join('')||'<div class="card-empty">没有匹配记录。试试清空关键词或减少筛选条件。</div>'}</div>${pages>1?`<div class="card-pagination"><button data-card-page="${cardBrowse.page-1}" ${cardBrowse.page===1?'disabled':''}>上一页</button><span>${cardBrowse.page} / ${pages}</span><button data-card-page="${cardBrowse.page+1}" ${cardBrowse.page===pages?'disabled':''}>下一页</button></div>`:''}`;
}
function cardDetailView(record){
  const snapshot=record.versions.find(x=>x.id===cardBrowse.version)||record.versions[0];
  cardBrowse.version=snapshot?.id||null;
  return `<div class="card-stage-heading"><div><span class="eyebrow">03 / READ</span><h4 tabindex="-1">${esc(record.title)}</h4></div></div><div class="card-reading-meta"><span>${esc(record.filing.department)} · ${esc(record.filing.level)} · ${esc(record.filing.scope)}</span><span>${esc(cardYearLabel(record.year))} · ${esc(record.filing.year_basis)}</span><span>${record.published?'发布 '+esc(record.published):'发布日期未标注'}${snapshot?' · 保存 '+esc(stamp(snapshot.created)):''}</span></div><div class="card-reading-actions">${link(record.url,'官方来源')}${snapshot?`<a class="button" href="${esc(cardArchiveUrl(snapshot,'raw'))}" download>下载 ${esc(fileFormat(snapshot))} 原件 ${guideArrow('download')}</a><button data-card-provenance>来源记录</button>${record.versions.length>1?`<label>保存版本<select id="card-version" aria-label="保存版本">${record.versions.map(v=>`<option value="${v.id}" ${snapshot.id===v.id?'selected':''}>${esc(stamp(v.created))} · #${v.id}</option>`).join('')}</select></label>`:''}`:''}</div>${snapshot?`<div class="card-reader-heading"><b>本地正文</b><small>显示已保存的文本；PDF、Word、表格及图片的版式请下载原件。</small></div><pre class="card-local-text" data-snapshot="${snapshot.id}" aria-live="polite">正在读取本地正文…</pre><details class="card-provenance" hidden><summary>来源与校验记录</summary><pre></pre></details>`:'<div class="card-empty"><strong>正文尚未保存</strong><p>目前只有本地通知索引，无法展示完整内容。本次不会访问原站或自动抓取；可用上方官方来源链接自行查看。</p></div>'}`;
}
function renderCardBrowser(focusHeading=false){
  const card=$$('.institution-card').find(x=>x.dataset.unit===cardBrowse.unit);
  const unit=data.institutions.find(x=>x.id===cardBrowse.unit);
  if(!card||!unit)return;
  const rows=cardRecords(unit),record=rows.find(r=>r.key===cardBrowse.record);
  if(cardBrowse.record&&!record){cardBrowse.record=null;cardBrowse.version=null}
  const identity=card.querySelector('.institution-identity').outerHTML;
  const focused=document.activeElement,restore=card.contains(focused)?focused.id:null,selection=focused.id==='card-record-search'?focused.selectionStart:null;
  card.classList.add('is-browsing');
  card.innerHTML=`<div class="card-browser-header">${identity}<button class="card-close" data-card-close aria-label="收起院校资料">${uiIcon('close')}<span>收起</span></button></div><div class="card-browser-content"><nav class="card-breadcrumb" aria-label="卡片内浏览路径"><button data-card-back="years">${esc(unit.school)}</button>${cardBrowse.year!==null?`${uiIcon('right')}<button data-card-back="records" ${!record?'aria-current="page"':''}>${esc(cardYearLabel(cardBrowse.year))}</button>`:''}${record?`${uiIcon('right')}<span aria-current="page">正文</span>`:''}</nav>${cardBrowse.year===null?cardYearView(rows):record?cardDetailView(record):cardListView(rows)}</div><details class="card-official-entries"><summary>官方校院入口 <small>${unit.entries.length}</small></summary>${unit.entries.map(entryLink).join('')}</details>`;
  const newInput=restore?card.querySelector('#'+restore):null;
  if(newInput){newInput.focus({preventScroll:true});if(selection!==null)newInput.setSelectionRange(selection,selection)}
  else if(focusHeading)card.querySelector('h4')?.focus({preventScroll:true});
  if(focusHeading)card.scrollIntoView({block:'start',behavior:'instant'});
  if(record&&cardBrowse.version)loadCardText(cardBrowse.version,card.querySelector('.card-local-text'));
}
async function loadCardText(id,target){
  try{
    const snapshot=data.snapshots.find(x=>x.id===id);
    if(!cardTextCache.has(id))cardTextCache.set(id,fetch(cardArchiveUrl(snapshot,'text')).then(r=>{if(!r.ok)throw Error(`读取失败（${r.status}）`);return r.text()}));
    const text=await cardTextCache.get(id);
    if(target.isConnected&&target.dataset.snapshot===String(id))target.textContent=text.trim()?text:'该文件没有可用的文本提取结果，请下载原件查看。';
  }catch(error){cardTextCache.delete(id);if(target.isConnected)target.textContent=`本地正文暂时无法读取：${error.message}。可以尝试下载原件；不会转为访问原站。`}
}
function resetCardFilters(){Object.assign(cardBrowse,{query:'',format:'',department:'',category:'',page:1})}
const beforeCardDirectory=renderDirectory;
renderDirectory=()=>{
  beforeCardDirectory();
  for(const card of $$('.institution-card')){
    const button=card.querySelector('[data-school-files]');
    if(!button)continue;
    const id=button.dataset.schoolFiles;
    card.dataset.unit=id;
    button.removeAttribute('data-school-files');button.dataset.cardOpen=id;button.disabled=false;
    button.setAttribute('aria-expanded',String(cardBrowse.unit===id));
    button.innerHTML=`按年份浏览 ${guideArrow('right')}`;
  }
  renderCardBrowser();
};
$('#directory-list').addEventListener('click',async event=>{
  const button=event.target.closest('button');if(!button)return;
  const d=button.dataset;
  if(d.cardOpen){
    Object.assign(cardBrowse,{unit:d.cardOpen,year:null,record:null,version:null,filtersOpen:false});resetCardFilters();
    renderDirectory();
    const card=$('.institution-card.is-browsing');card?.scrollIntoView({block:'start',behavior:'instant'});card?.querySelector('h4')?.focus({preventScroll:true});return;
  }
  if(button.hasAttribute('data-card-close')){
    const id=cardBrowse.unit;cardBrowse.unit=null;renderDirectory();
    const trigger=$$('[data-card-open]').find(b=>b.dataset.cardOpen===id);trigger?.focus({preventScroll:true});trigger?.scrollIntoView({block:'center'});return;
  }
  if(d.cardYear){cardBrowse.year=d.cardYear;cardBrowse.record=null;resetCardFilters();renderCardBrowser(true)}
  if(d.cardRecord){cardBrowse.record=d.cardRecord;cardBrowse.version=null;renderCardBrowser(true)}
  if(d.cardBack){cardBrowse.record=null;cardBrowse.version=null;if(d.cardBack==='years')cardBrowse.year=null;renderCardBrowser(true)}
  if(button.hasAttribute('data-card-reset')){resetCardFilters();renderCardBrowser()}
  if(button.hasAttribute('data-card-toggle-filters')){cardBrowse.filtersOpen=!cardBrowse.filtersOpen;renderCardBrowser()}
  if(d.cardPage){cardBrowse.page=Number(d.cardPage);renderCardBrowser(true);$('.card-stage-heading')?.scrollIntoView({block:'start'})}
  if(button.hasAttribute('data-card-provenance')){
    const details=$('.card-provenance'),snapshot=data.snapshots.find(x=>x.id===cardBrowse.version);
    details.hidden=false;details.open=true;
    details.querySelector('pre').textContent='正在读取来源记录…';
    try{const response=await fetch(cardArchiveUrl(snapshot,'manifest'));if(!response.ok)throw Error(String(response.status));const text=await response.text();if(details.isConnected)details.querySelector('pre').textContent=text}catch(error){if(details.isConnected)details.querySelector('pre').textContent='来源记录读取失败：'+error.message}
  }
});
$('#directory-list').addEventListener('input',event=>{if(event.target.id==='card-record-search'){cardBrowse.query=event.target.value;cardBrowse.page=1;renderCardBrowser()}});
$('#directory-list').addEventListener('change',event=>{
  if(event.target.dataset.cardFilter){cardBrowse[event.target.dataset.cardFilter]=event.target.value;cardBrowse.page=1;renderCardBrowser()}
  if(event.target.id==='card-version'){cardBrowse.version=Number(event.target.value);renderCardBrowser()}
});
if(data)renderDirectory();
