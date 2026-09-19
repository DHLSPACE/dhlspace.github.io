'use strict';
const isPublicRuntime=document.documentElement.dataset.runtime==='public';
// Local enhancement: native filter inputs remain the single source of truth.
const publicityPattern=/公示|拟录取|录取名单|复试名单|入围名单|推免名单|资格名单|推荐名单/;
const extraSelect=(id,label)=>`<select id="${id}" aria-label="${label}"><option value="">全部${label}</option></select>`;
$('#directory-sort').insertAdjacentHTML('beforebegin',extraSelect('directory-school','院校')+extraSelect('directory-year','资料年份')+`<select id="directory-scope" aria-label="院校资料用途">${scopeOptions}</select>`);
$('#archive-format').insertAdjacentHTML('beforebegin',extraSelect('archive-region','地区')+extraSelect('archive-department','院系')+'<select id="archive-priority" aria-label="公示名单筛选"><option value="">全部资料</option><option value="publicity">公示 / 名单优先</option></select>');
const provinceFor=school=>data.institutions.find(u=>[u.school,...(u.aliases||[])].some(n=>normalizedSchool(n)===normalizedSchool(school)))?.province||'地区待核实';

const baseDirectoryRows=directoryRows;
directoryRows=()=>{
  const year=$('#directory-year').value,scope=$('#directory-scope').value,unit=$('#directory-school').value;
  const matchingSources=(year||scope)?new Set([...data.items,...data.snapshots].filter(x=>(!year||x.filing.year===year)&&(!scope||x.filing.scope===scope)).map(x=>x.source_id)):null;
  const sources=matchingSources?data.sources.filter(s=>matchingSources.has(s.id)):[];
  return baseDirectoryRows().filter(u=>(!unit||u.school===unit)&&(!matchingSources||sources.some(s=>ownsSource(u,s))));
};
function filteredArchiveRows(){
  const q=$('#archive-search').value.trim().toLowerCase(),seen=new Set();
  return data.snapshots.filter(x=>{const key=x.source_id+'|'+x.url;if($('#archive-latest').checked&&seen.has(key))return false;seen.add(key);return true}).filter(x=>
    ($('#archive-unrelated').checked||x.filing.relevant)&&(!q||(archiveTitle(x)+x.url+x.filing.school+x.filing.department).toLowerCase().includes(q))&&
    ['scope','year','school','level','department'].every(k=>!$('#archive-'+k).value||x.filing[k]===$('#archive-'+k).value)&&
    (!$('#archive-region').value||provinceFor(x.filing.school)===$('#archive-region').value)&&
    (!$('#archive-format').value||fileFormat(x)===$('#archive-format').value)&&
    (!$('#archive-priority').value||x.kind!=='list'&&publicityPattern.test(archiveTitle(x))));
}
for(const id of ['directory-school','directory-year','directory-scope'])$('#'+id).onchange=()=>{directoryPage=1;renderDirectory()};
for(const id of ['archive-region','archive-department','archive-priority'])$('#'+id).onchange=()=>{archivePage=1;renderLibrary()};
for(const [prefix,fields] of [['directory',['school','year','scope']],['archive',['region','department','priority']]]){
  const old=$('#'+prefix+'-reset').onclick;
  $('#'+prefix+'-reset').onclick=()=>{fields.forEach(k=>$('#'+prefix+'-'+k).value='');capsuleStage='';old();renderCapsule()};
}

let capsuleEnabled=pref('capsule-enabled','true')==='true';
let capsuleMini=pref('capsule-mini',String(matchMedia('(max-width:999px)').matches))==='true';
let capsuleStage='',capsuleContext='';
const capsule=document.createElement('div');capsule.id='filter-capsule';capsule.hidden=true;capsule.setAttribute('role','region');capsule.setAttribute('aria-label','悬浮分类筛选');document.body.append(capsule);
$('#settings .appearance-settings').insertAdjacentHTML('beforeend',`<hr><h2>悬浮胶囊与动效</h2><label class="check-label"><input id="enable-capsule" type="checkbox"> 开启左侧分类胶囊</label><label class="check-label"><input id="mini-capsule" type="checkbox"> 收成 mini 托盘</label><label>玻璃效果<select id="local-glass-mode"><option value="balanced">轻量玻璃 · 推荐</option><option value="clear">通透玻璃 · 高光更明显</option><option value="solid">实色 · 节能 / 更易阅读</option></select></label><label class="check-label"><input id="card-motion" type="checkbox"> 卡片悬停与切换动画</label><p class="hint">与顶部导航、原筛选栏共存。胶囊逐级筛选，面包屑可返回；主题与配色沿用当前设置。系统要求减少动态效果时会自动停用动画。</p>`);
$('#enable-capsule').checked=capsuleEnabled;$('#mini-capsule').checked=capsuleMini;
$('#local-glass-mode').value=pref('local-glass-mode','balanced');$('#card-motion').checked=pref('card-motion','true')==='true';
function applyLocalAppearance(){
  document.documentElement.dataset.localGlass=$('#local-glass-mode').value;
  document.documentElement.dataset.cardMotion=String($('#card-motion').checked);
  remember('local-glass-mode',$('#local-glass-mode').value);remember('card-motion',String($('#card-motion').checked));
}
applyLocalAppearance();$('#local-glass-mode').onchange=$('#card-motion').onchange=applyLocalAppearance;
function setCapsule(){capsuleEnabled=$('#enable-capsule').checked;capsuleMini=$('#mini-capsule').checked;remember('capsule-enabled',String(capsuleEnabled));remember('capsule-mini',String(capsuleMini));renderCapsule()}
$('#enable-capsule').onchange=$('#mini-capsule').onchange=setCapsule;
function capsuleFields(){
  if(activeTab==='directory')return [['tier','栏目'],['directory-region','地区'],['directory-direction','方向'],['directory-school','院校 / 研究所'],['directory-year','资料年份'],['directory-scope','用途']];
  if(activeTab==='archives')return [['archive-scope','用途'],['archive-year','年份'],['archive-region','地区'],['archive-school','院校 / 研究所'],['archive-department','院系'],['archive-priority','公示 / 名单'],['archive-format','格式']];
  if(activeTab==='policy')return [['policy-group','政策层级'],['policy-province','地区']];
  if(activeTab==='updates')return [['update-scope','用途'],['update-year','年份'],['update-mode','动态类型']];
  if(activeTab==='sources')return [['source-scope','用途'],['source-school','院校'],['source-type','来源类型'],['source-category','类别'],['source-status','状态']];
  if(activeTab==='notes')return [['note-school','院校']];
  return [];
}
function facetOptions(id){
  if(id==='tier')return [['all','全部目标'],['985','985 高校'],['相关高校','相关高校'],['研究所','研究所'],['favorites','我的关注'],['connected','已接入来源']];
  let choices=[...$('#'+id).options].map(o=>[o.value,o.textContent]);
  // Cascade school choices from upstream province and institution type.
  if(id==='directory-school'){
    const units=data.institutions.filter(u=>(!$('#directory-region').value||u.province===$('#directory-region').value)&&(!$('#directory-direction').value||u.directions.includes($('#directory-direction').value))&&(['all','favorites','connected'].includes(directoryFilter)||u.tier===directoryFilter));
    choices=choices.filter(([value])=>!value||units.some(u=>u.school===value));
  }
  if(id==='archive-school'&&$('#archive-region').value)choices=choices.filter(([v])=>!v||provinceFor(v)===$('#archive-region').value);
  if(id==='archive-department'&&$('#archive-school').value)choices=choices.filter(([v])=>!v||data.snapshots.some(x=>x.filing.school===$('#archive-school').value&&x.filing.department===v));
  return choices;
}
const facetValue=id=>id==='tier'?directoryFilter:$('#'+id).value;
function renderCapsule(){
  if(!data)return;
  const fields=capsuleFields();
  capsule.hidden=!capsuleEnabled;capsule.classList.toggle('is-mini',capsuleMini);
  document.body.classList.toggle('has-capsule',capsuleEnabled&&!capsuleMini);
  if(capsuleContext!==activeTab){capsuleContext=activeTab;capsuleStage=''}
  const selected=fields.filter(([id])=>facetValue(id)&&!['all','events'].includes(facetValue(id)));
  const context=activeTab==='directory'?(directoryFilter==='研究所'?'研究所':directoryFilter==='985'||directoryFilter==='相关高校'?'高校':'院校地图'):titles[activeTab];
  if(capsuleMini){capsule.innerHTML=`<button id="capsule-expand" aria-label="展开分类胶囊" aria-expanded="false"><span aria-hidden="true">☷</span><small>${esc(context)}${selected.length?' · '+selected.length:''}</small></button>`;return}
  const field=fields.find(([id])=>id===capsuleStage);
  capsule.innerHTML=`<div class="capsule-head"><div><span class="eyebrow">QUICK FILTER</span><strong>${esc(context)}</strong></div><button id="capsule-minimize" title="收起为 mini 托盘" aria-label="收起为 mini 托盘">−</button></div><div class="capsule-scroll"><div class="capsule-crumbs"><button data-capsule-stage="">分类</button>${selected.map(([id,label])=>`<button data-capsule-stage="${id}" title="修改${label}">${esc(facetOptions(id).find(([v])=>v===facetValue(id))?.[1]||facetValue(id))}</button>`).join('')}</div>${field?`<div class="capsule-step"><button id="capsule-back" aria-label="返回分类">‹ 返回</button><b>${esc(field[1])}</b></div><div class="capsule-options">${facetOptions(field[0]).map(([value,label])=>`<button data-capsule-value="${esc(value)}" data-capsule-field="${field[0]}" aria-pressed="${value===facetValue(field[0])}"><span>${esc(label)}</span><small>${value===facetValue(field[0])?'✓':'›'}</small></button>`).join('')}</div>`:fields.length?`<div class="capsule-facets">${fields.map(([id,label])=>`<button data-capsule-stage="${id}"><span>${label}<small>${esc(facetOptions(id).find(([v])=>v===facetValue(id))?.[1]||'全部')}</small></span><span>›</span></button>`).join('')}</div>`:`<p class="hint">选择栏目开始逐级筛选</p><div class="capsule-facets"><button data-go="directory">高校 / 研究所 <span>›</span></button><button data-go="policy">地区政策 <span>›</span></button><button data-go="archives">已保存资料 <span>›</span></button></div>`}</div><div class="capsule-foot">${fields.length?'<button id="capsule-reset">清空筛选</button>':''}<button data-open-snapshot>快照 ↓</button></div>`;
}
capsule.addEventListener('click',e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.id==='capsule-minimize'||b.id==='capsule-expand'){$('#mini-capsule').checked=b.id==='capsule-minimize';setCapsule();(capsuleMini?$('#capsule-expand'):$('#capsule-minimize'))?.focus();return}
  if(b.hasAttribute('data-capsule-stage')){capsuleStage=b.dataset.capsuleStage;renderCapsule()}
  if(b.id==='capsule-back'){capsuleStage='';renderCapsule()}
  if(b.hasAttribute('data-capsule-value')){
    const id=b.dataset.capsuleField,fields=capsuleFields(),at=fields.findIndex(([key])=>key===id);
    // Clear descendants so an old school cannot silently contradict a new region.
    fields.slice(at+1).forEach(([key])=>{if(key!=='tier')$('#'+key).selectedIndex=0});
    capsuleStage=fields[at+1]?.[0]||'';
    if(id==='tier'){directoryFilter=b.dataset.capsuleValue;directoryPage=1;renderDirectory()}
    else{const input=$('#'+id);input.value=b.dataset.capsuleValue;input.dispatchEvent(new Event('change',{bubbles:true}))}
    renderCapsule();$('#capsule-back')?.focus();
  }
  if(b.id==='capsule-reset'){
    if(activeTab==='directory')$('#directory-reset').click();
    else if(activeTab==='archives')$('#archive-reset').click();
    else{capsuleFields().forEach(([id])=>$('#'+id).selectedIndex=0);render()}
    capsuleStage='';renderCapsule();
  }
});
capsule.addEventListener('keydown',e=>{if(e.key==='Escape'){$('#mini-capsule').checked=true;setCapsule();$('#capsule-expand').focus()}});

// Update only when views change; no rasterisation or continuous animation loop.
const localDirectoryRender=renderDirectory;
renderDirectory=()=>{
  options('#directory-school',data.institutions.map(x=>x.school),'全部院校');
  options('#directory-year',[...data.items,...data.snapshots].map(x=>x.filing.year),'全部资料年份');
  localDirectoryRender();renderCapsule();
};
const localLibraryRender=renderLibrary;
renderLibrary=()=>{
  options('#archive-region',data.snapshots.map(x=>provinceFor(x.filing.school)),'全部地区');
  options('#archive-department',data.snapshots.map(x=>x.filing.department),'全部院系');
  localLibraryRender();renderCapsule();
};
const localRender=render;
render=()=>{localRender();renderCapsule()};
document.addEventListener('change',e=>{if(e.target.closest('main'))renderCapsule()});

// A separate, explicit click starts a ZIP job; opening/polling never starts one.
$('#archives .toolbar').insertAdjacentHTML('beforeend','<button class="primary" data-open-snapshot>本地快照 ↓</button>');
$('#download-bundle').textContent='打包到本地';
$('#download-bundle').onclick=()=>openSnapshot('selected');
$('#settings').insertAdjacentHTML('beforeend',`<article class="panel snapshot-settings"><h2>手动快照</h2><p>按学校分类打包原件，只在点击“保存快照”后运行。</p><label>默认保存目录<input id="snapshot-directory" placeholder="留空恢复项目下 snapshot 文件夹"></label><div class="actions"><button id="snapshot-pick">选择文件夹…</button><button id="snapshot-save-dir">保存路径</button><button id="snapshot-default-dir">恢复默认</button><button data-open-snapshot>打开快照</button></div><p id="snapshot-dir-status" class="hint" role="status"></p><details><summary>分类方式与 AI</summary><p>当前使用免费、本地的标题和来源规则分类，ZIP 由 Python 标准库生成，无需账号或新依赖。年份不明保留“待核实”。</p><p>本版未接入 AI。AI 可以辅助识别扫描名单、拟定标签，但需要另装本地模型或配置服务，并人工核对。不会在打包时自动上传名单，也不会把 AI 推测当作来源事实。</p></details><p><a href="/api/snapshot-guide" target="_blank" rel="noopener">打开胶囊与快照操作文档 ↗</a></p></article>`);
document.body.insertAdjacentHTML('beforeend',`<dialog id="snapshot-dialog" aria-labelledby="snapshot-title"><div class="section-head"><div><span class="eyebrow">KEEP A LOCAL COPY</span><h2 id="snapshot-title">把重要名单，留在本机。</h2></div><button id="snapshot-close" aria-label="关闭快照窗口">×</button></div><p class="hint">仅整理本机已保存的原件。没有保存成功的官网文件会留在待归档清单。</p><label>打包范围<select id="snapshot-mode"><option value="publicity">公示 / 名单 · 优先留底</option><option value="all">全部已保存资料</option><option value="filtered">资料页当前筛选（所有分页）</option><option value="selected">勾选的资料</option></select></label><label class="check-label"><input id="snapshot-latest" type="checkbox" checked> 每个来源网址只取最新版本</label><p id="snapshot-estimate" class="snapshot-estimate"></p><div class="snapshot-destination"><span>保存到</span><p id="snapshot-target"></p><button id="snapshot-dialog-pick">更换文件夹…</button></div><div class="snapshot-tree">日期.zip<br>└ 学校 / 年份 / 用途 / 院系<br>　└ 标题__编号 / 原件 · 正文 · 来源<br>＋ 分类目录 · 来源索引 · 未完成清单</div><p class="hint">公示状态按标题匹配，未判断具体到期日；中科院资料也不能保证永久保留。分类不调用 AI。</p><progress id="snapshot-progress" value="0" max="1" hidden></progress><p id="snapshot-result" role="status" aria-live="polite"></p><button id="snapshot-start" class="primary">保存快照</button></dialog>`);
let snapshotStatus=null,snapshotPoll=null;
function snapshotIds(){const mode=$('#snapshot-mode').value;return mode==='selected'?[...selectedArchives]:mode==='filtered'?filteredArchiveRows().map(x=>x.id):undefined}
function estimateSnapshot(){
  if(!data)return;
  const mode=$('#snapshot-mode').value,ids=snapshotIds();
  let rows=data.snapshots.filter(x=>x.kind!=='异常页面');
  if(ids)rows=rows.filter(x=>ids.includes(x.id));
  if(mode==='publicity')rows=rows.filter(x=>x.kind!=='list'&&x.filing.relevant&&publicityPattern.test(archiveTitle(x)));
  if($('#snapshot-latest').checked){const seen=new Set();rows=rows.filter(x=>{const key=x.source_id+'|'+x.url;if(seen.has(key))return false;seen.add(key);return true})}
  $('#snapshot-estimate').textContent=`将整理 ${rows.length} 个版本 · ${new Set(rows.map(x=>x.filing.school)).size} 个单位`;
  $('#snapshot-start').disabled=!!snapshotStatus?.running||!rows.length;
}
async function refreshSnapshot(){
  const r=await fetch('/api/snapshot-status');if(!r.ok)throw Error('快照状态读取失败，请重新启动本地助手');snapshotStatus=await r.json();
  $('#snapshot-target').textContent=snapshotStatus.directory;
  if(document.activeElement!==$('#snapshot-directory'))$('#snapshot-directory').value=snapshotStatus.directory;
  $('#snapshot-progress').hidden=!snapshotStatus.running;$('#snapshot-progress').max=snapshotStatus.total||1;$('#snapshot-progress').value=snapshotStatus.done;
  const result=snapshotStatus.result||snapshotStatus.last;
  $('#snapshot-result').textContent=snapshotStatus.error|| (snapshotStatus.running?snapshotStatus.message:result?`已保存 ${result.count} 个版本 · ${(result.bytes/1048576).toFixed(1)} MB\n${result.path}\n${result.warnings} 项缺失 / 校验问题，${result.pending} 项待归档资源参考（不计入已保存）。`:snapshotStatus.message);
  $('#snapshot-result').classList.toggle('snapshot-error',!!snapshotStatus.error||!!result?.warnings);
  for(const id of ['snapshot-mode','snapshot-latest','snapshot-pick','snapshot-save-dir','snapshot-default-dir','snapshot-dialog-pick'])$('#'+id).disabled=snapshotStatus.running;
  estimateSnapshot();
  if(snapshotStatus.running){clearTimeout(snapshotPoll);snapshotPoll=setTimeout(()=>refreshSnapshot().catch(e=>$('#snapshot-result').textContent=e.message),700)}
}
async function openSnapshot(mode='publicity'){
  if(!data)return;
  $('#snapshot-mode').value=mode;$('#snapshot-dialog').showModal();estimateSnapshot();
  try{await refreshSnapshot()}catch(e){$('#snapshot-result').textContent=e.message}
}
document.addEventListener('click',e=>{if(e.target.closest('[data-open-snapshot]'))openSnapshot()});
$('#snapshot-close').onclick=()=>$('#snapshot-dialog').close();
$('#snapshot-mode').onchange=$('#snapshot-latest').onchange=estimateSnapshot;
$('#snapshot-start').onclick=async()=>{
  const button=$('#snapshot-start');button.disabled=true;
  try{await post('snapshot-start',{mode:$('#snapshot-mode').value,ids:snapshotIds(),latest:$('#snapshot-latest').checked});await refreshSnapshot()}
  catch(e){$('#snapshot-result').textContent=e.message;button.disabled=false}
};
async function pickSnapshotDirectory(e){
  const button=e.currentTarget;button.disabled=true;
  try{const r=await post('snapshot-pick-directory',{});$('#snapshot-dir-status').textContent=r.cancelled?'已取消，目录未改变':'保存目录已更新';await refreshSnapshot()}
  catch(e){toast(e.message);$('#snapshot-dir-status').textContent=e.message}
  finally{button.disabled=!!snapshotStatus?.running}
}
$('#snapshot-pick').onclick=$('#snapshot-dialog-pick').onclick=pickSnapshotDirectory;
async function setSnapshotDirectory(value){try{await post('snapshot-directory',{directory:value});await refreshSnapshot();$('#snapshot-dir-status').textContent='保存目录已更新'}catch(e){$('#snapshot-dir-status').textContent=e.message}}
$('#snapshot-save-dir').onclick=()=>setSnapshotDirectory($('#snapshot-directory').value);
$('#snapshot-default-dir').onclick=()=>setSnapshotDirectory('');
// Fetch settings only; no file writes or export on startup.
if(!isPublicRuntime)refreshSnapshot().catch(()=>{});
render();
