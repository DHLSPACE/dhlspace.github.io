'use strict';
// Directory entries are navigation, never evidence of a successful crawl.
const normalizedSchool = s => String(s || '').replace(/^中国科学院|^中科院/, '').replace(/\s/g, '');
const ownsSource = (u,s) => [u.school,...(u.aliases||[])].some(n=>normalizedSchool(n)===normalizedSchool(s.school)||normalizedSchool(s.name).startsWith(normalizedSchool(n)+'·'));
let directoryFilter='all', directoryPage=1, archivePage=1;
let directoryLayout=pref('directoryLayout','cards');
const selectedArchives=new Set();
const pageSize=36;
function addPage(id,title,icon,html){
  $('nav [data-tab="sources"]').insertAdjacentHTML('beforebegin',`<button data-tab="${id}" title="${title}" aria-label="${title}"><span class="nav-icon" aria-hidden="true">${icon}</span><span class="nav-text">${title}</span></button>`);
  $('main footer').insertAdjacentHTML('beforebegin',`<section id="${id}" class="page">${html}</section>`);
}
addPage('directory','院校目录','⌘',`
  <div class="directory-hero"><div><span class="eyebrow">YOUR NEXT CHAPTER / 升学资料工作台</span><h2>把选择看全，<br>把时间留给准备。</h2><p>先收藏目标院校，再接入招生栏目。通知、附件和依据，集中留在本机。</p><div class="actions"><button class="primary" id="show-favorites">查看我的关注</button><button data-go="archives">打开资料库 ↗</button></div></div><div class="directory-total"><b>39</b><span>所 985 高校</span><hr><strong id="institute-total">—</strong><span>个中科院目录条目</span></div></div>
  <div id="directory-stats" class="directory-stats"></div>
  <div class="library-workflow"><span><b>01</b> 浏览与收藏</span><span><b>02</b> 核对官网栏目</span><span><b>03</b> 归档通知与附件</span><span><b>04</b> 整理申请依据</span></div>
  <div class="section-head directory-heading"><div><h2>你的院校地图</h2><p class="hint">覆盖 985 与中科院研究单位目录。其他研究所可通过“添加学校 / 网址”补充。</p></div><div class="view-bar" aria-label="院校排列"><button data-layout="cards" aria-label="卡片排列">▦ 卡片</button><button data-layout="rows" aria-label="列表排列">☷ 列表</button></div></div>
  <div class="directory-chips" role="group" aria-label="院校范围"><button data-directory-filter="all">全部目标</button><button data-directory-filter="985">985 高校</button><button data-directory-filter="研究所">研究所</button><button data-directory-filter="favorites">★ 我的关注</button><button data-directory-filter="connected">已接入来源</button></div>
  <div class="toolbar directory-toolbar"><input id="directory-search" aria-label="搜索院校目录" placeholder="搜索院校、研究所或城市…"><select id="directory-region" aria-label="院校地区"><option value="">全部地区</option></select><select id="directory-sort" aria-label="院校排序"><option value="default">收藏优先 · 目录顺序</option><option value="name">名称排序</option><option value="region">地区分组排序</option></select><button id="directory-reset">重置</button></div>
  <p id="directory-count" class="hint" role="status"></p><div id="directory-list"></div><div id="directory-pager" class="pager"></div>
  <details class="directory-evidence"><summary>目录依据与收录范围</summary><p>985 身份参考教育部名单；其入口沿用 Claude 提供的参考地址，逐站可用性须试抓。研究所名称和官网来自 2026-09-18 获取的中科院研究单位目录（含原目录带 * 的条目），不等于全国所有研究所，也不代表每个单位均独立招生。院校专业与招生资格请核对当年简章。</p><p>${link('https://www.moe.gov.cn/srcsite/A22/s7065/200612/t20061206_128833.html','教育部 985 名单')} · ${link('https://www.cas.cn/zz/jg/ys/yj/','中科院研究单位目录')}</p></details>`);

function directoryRows(){
  const q=$('#directory-search').value.trim().toLowerCase(),region=$('#directory-region').value, favorites=new Set(data.settings.favorites||[]);
  let rows=(data.institutions||[]).filter(u=>(!q||[u.school,u.region,...(u.aliases||[])].join(' ').toLowerCase().includes(q))&&(!region||u.region===region)&&
    (directoryFilter==='all'||u.tier===directoryFilter||directoryFilter==='favorites'&&favorites.has(u.id)||directoryFilter==='connected'&&data.sources.some(s=>ownsSource(u,s))));
  const sort=$('#directory-sort').value;
  rows.sort((a,b)=>sort==='name'?a.school.localeCompare(b.school,'zh'):sort==='region'?a.region.localeCompare(b.region,'zh')||a.school.localeCompare(b.school,'zh'):Number(favorites.has(b.id))-Number(favorites.has(a.id)));
  return rows;
}
function renderDirectory(){
  const all=data.institutions||[],favorites=new Set(data.settings.favorites||[]),region=$('#directory-region').value;
  $('#directory-region').innerHTML='<option value="">全部地区</option>'+[...new Set(all.map(u=>u.region))].sort((a,b)=>a.localeCompare(b,'zh')).map(r=>`<option ${r===region?'selected':''}>${esc(r)}</option>`).join('');
  $('#institute-total').textContent=all.filter(u=>u.tier==='研究所').length;
  const connected=all.filter(u=>data.sources.some(s=>ownsSource(u,s))).length;
  $('#directory-stats').innerHTML=[['我的关注',favorites.size,'favorites'],['已接入院校',connected,'connected'],['已保存版本',data.snapshots.length,'archives'],['未读有效更新',data.events.filter(e=>e.unread&&!['首次建档','抓取失败'].includes(e.type)).length,'updates']].map(([label,count,action])=>`<button data-stat="${action}"><span>${label}</span><b>${count}<small> ↗</small></b></button>`).join('');
  const rows=directoryRows(),pages=Math.max(1,Math.ceil(rows.length/pageSize));directoryPage=Math.min(directoryPage,pages);
  $('#directory-count').textContent=`共 ${rows.length} 个匹配 · 全目录 ${all.length} 个 · 目录收录、接入来源和成功归档分别统计`;
  $('#directory-list').className='institution-grid '+(directoryLayout==='rows'?'institution-rows':'');
  $('#directory-list').innerHTML=rows.slice((directoryPage-1)*pageSize,directoryPage*pageSize).map(u=>{
    const sources=data.sources.filter(s=>ownsSource(u,s)),active=sources.filter(s=>s.enabled),saved=data.snapshots.filter(x=>sources.some(s=>s.id===x.source_id)).length;
    const status=active.some(s=>s.error)?'部分来源失败':active.length?'已接入监控':sources.length?'来源已暂停':'待接入栏目';
    return `<article class="institution-card"><div class="institution-top"><span class="institution-emblem">${u.tier==='985'?'985':'CAS'}</span><span class="meta">${esc(u.region)}</span><button class="pin ${favorites.has(u.id)?'selected':''}" data-favorite="${u.id}" aria-label="${favorites.has(u.id)?'取消关注':'关注'} ${esc(u.school)}" aria-pressed="${favorites.has(u.id)}">${favorites.has(u.id)?'★':'☆'}</button></div><h3>${esc(u.school)}</h3><div class="institution-meta">${badge(status)}<span>${sources.length} 个来源 · ${saved} 个版本</span></div><p class="entry-status">${esc(u.entry_status)}${u.directory_mark?' · '+esc(u.directory_mark):''}</p><div class="institution-actions"><button data-connect="${u.id}">${sources.length?'补充栏目':'接入栏目'} ↗</button><button data-school-files="${u.id}" ${saved?'':'disabled'}>资料 ${saved}</button>${link(u.url,'官网')}</div></article>`;
  }).join('')||empty(directoryFilter==='favorites'?'还没有关注院校。点击卡片右上角的 ☆，建立自己的短名单。':'没有匹配院校，试试其他关键词或重置筛选。');
  $('#directory-pager').innerHTML=`<button data-directory-page="${directoryPage-1}" ${directoryPage<=1?'disabled':''}>上一页</button><span>${directoryPage} / ${pages}</span><button data-directory-page="${directoryPage+1}" ${directoryPage>=pages?'disabled':''}>下一页</button>`;
  $$('[data-directory-filter]').forEach(b=>{b.classList.toggle('active',b.dataset.directoryFilter===directoryFilter);b.setAttribute('aria-pressed',String(b.dataset.directoryFilter===directoryFilter))});
  $$('[data-layout]').forEach(b=>b.classList.toggle('active',b.dataset.layout===directoryLayout));
}
['directory-search','directory-region','directory-sort'].forEach(id=>$('#'+id).addEventListener(id==='directory-search'?'input':'change',()=>{directoryPage=1;renderDirectory()}));
$('#directory-reset').onclick=()=>{$('#directory-search').value=$('#directory-region').value='';directoryFilter='all';directoryPage=1;renderDirectory()};
$('#show-favorites').onclick=()=>{directoryFilter='favorites';directoryPage=1;renderDirectory()};

// Accent controls use CSS variables; neutral surfaces remain readable in both modes.
document.querySelector('header').insertAdjacentHTML('beforeend','<button id="open-palette">◐ 配色</button>');
document.body.insertAdjacentHTML('beforeend',`<dialog id="palette"><div class="section-head"><div><span class="eyebrow">MAKE IT YOURS</span><h2>配色与质感</h2></div><button id="close-palette" aria-label="关闭配色窗口">×</button></div><p class="hint">保留深浅模式，自由搭配主题色。选择会在此浏览器记忆。</p><div class="palette-presets">${[['forest','森林绿'],['ocean','海盐蓝'],['violet','暮光紫'],['rose','玫瑰粉'],['amber','暖琥珀'],['slate','石墨灰']].map(([id,name])=>`<button data-palette="${id}" class="palette-${id}"><i></i>${name}</button>`).join('')}</div><div class="form-row"><label>主题色<input id="accent-one" type="color" aria-label="主题色"></label><label>渐变终点<input id="accent-two" type="color" aria-label="渐变终点"></label></div><label class="check-label"><input id="use-gradient" type="checkbox"> 启用渐变背景</label><label>渐变方向<select id="gradient-angle"><option value="120">左上 → 右下</option><option value="90">左 → 右</option><option value="180">上 → 下</option></select></label><label>显示密度<select id="library-density"><option value="comfortable">舒展</option><option value="compact">紧凑</option></select></label><div class="palette-preview"><b>每一份准备，都有自己的颜色。</b><p>页面预览 · 院校 / 通知 / 资料</p></div><button id="reset-palette">恢复森林绿</button></dialog>`);
const palettes={forest:['#25876b','#5299ab'],ocean:['#3879cf','#31aaa8'],violet:['#8264d4','#ca7fba'],rose:['#c65183','#d89961'],amber:['#b57b26','#bf604a'],slate:['#66758b','#8b90b2']};
let appearance;try{appearance=JSON.parse(pref('appearance','{}'))}catch{appearance={}}
if(!appearance||typeof appearance!=='object')appearance={};
function applyAppearance(){
  const root=document.documentElement;
  const one=/^#[0-9a-f]{6}$/i.test(appearance.one||'')?appearance.one:palettes.forest[0];
  const two=/^#[0-9a-f]{6}$/i.test(appearance.two||'')?appearance.two:palettes.forest[1];
  const rgb=one.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4);
  root.style.setProperty('--accent',one);root.style.setProperty('--accent-end',two);
  root.style.setProperty('--accent-text',rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722>.179?'#101319':'#ffffff');
  root.style.setProperty('--gradient-angle',(['90','120','180'].includes(String(appearance.angle))?appearance.angle:120)+'deg');
  root.dataset.gradient=appearance.gradient===false?'off':'on';root.dataset.density=appearance.density==='compact'?'compact':'comfortable';
  $('#accent-one').value=one;$('#accent-two').value=two;$('#use-gradient').checked=root.dataset.gradient==='on';$('#accent-two').disabled=!$('#use-gradient').checked;
  $('#gradient-angle').value=String(appearance.angle||120);$('#library-density').value=root.dataset.density;
  remember('appearance',JSON.stringify(appearance));
  $$('[data-palette]').forEach(b=>b.setAttribute('aria-pressed',String(palettes[b.dataset.palette][0]===one&&palettes[b.dataset.palette][1]===two)));
}
applyAppearance();
$('#open-palette').onclick=()=>$('#palette').showModal();$('#close-palette').onclick=()=>$('#palette').close();
[['accent-one','one'],['accent-two','two'],['gradient-angle','angle'],['library-density','density']].forEach(([id,key])=>$('#'+id).addEventListener(id.startsWith('accent')?'input':'change',e=>{appearance[key]=e.target.value;applyAppearance()}));
$('#use-gradient').onchange=e=>{appearance.gradient=e.target.checked;applyAppearance()};
$('#reset-palette').onclick=()=>{appearance={};applyAppearance()};

// Archive workspace: titles, versions, file types, paging and a bounded original-file bundle.
$('#archive-search').placeholder='搜索资料标题、学校、网址…';
$('#archive-search').insertAdjacentHTML('afterend','<button id="batch-urls">批量粘贴网址</button>');
$('#archive-list').insertAdjacentHTML('beforebegin',`<div class="archive-filters toolbar"><select id="archive-school" aria-label="归档学校"><option value="">全部学校</option></select><select id="archive-format" aria-label="文件类型"><option value="">全部文件类型</option><option>PDF</option><option>Word</option><option>Excel</option><option>图片</option><option>网页</option><option>其他</option></select><label class="check-label"><input type="checkbox" id="archive-latest" checked> 每个网址仅看最新版</label><button id="archive-reset">重置筛选</button></div><div class="archive-selection"><label class="check-label"><input type="checkbox" id="select-page"> 选择本页</label><span id="archive-count"></span><button id="clear-selection">清空选择</button><button id="download-bundle" class="primary" disabled>打包下载</button></div>`);
$('#archive-list').insertAdjacentHTML('afterend','<div id="archive-pager" class="pager"></div>');
const schoolName=id=>data.sources.find(s=>s.id===id)?.school||school(id);
function fileFormat(x){const ext=x.raw_path?.split('.').pop().toLowerCase();return ext==='pdf'?'PDF':['doc','docx'].includes(ext)?'Word':['xls','xlsx','csv'].includes(ext)?'Excel':['png','jpg','jpeg','gif','webp'].includes(ext)?'图片':['html','htm','mhtml'].includes(ext)?'网页':'其他'}
function archiveTitle(x){const title=data.resources.find(r=>r.url===x.url)?.title||data.items.find(i=>i.url===x.url)?.title;if(title)return title;const filename=x.url.split('/').pop().split('?')[0]||'网页存档';try{return decodeURIComponent(filename)}catch{return filename}}
let visibleArchives=[];
function renderLibrary(){
  const selected=$('#archive-school').value;
  $('#archive-school').innerHTML='<option value="">全部学校</option>'+[...new Set(data.snapshots.map(x=>schoolName(x.source_id)))].sort((a,b)=>a.localeCompare(b,'zh')).map(s=>`<option ${s===selected?'selected':''}>${esc(s)}</option>`).join('');
  const q=$('#archive-search').value.trim().toLowerCase(),format=$('#archive-format').value,seen=new Set();
  const latest=$('#archive-latest').checked;
  let rows=[...data.snapshots].sort((a,b)=>b.id-a.id).filter(x=>{const key=x.source_id+'|'+x.url;if(latest&&seen.has(key))return false;seen.add(key);return true}).filter(x=>(!selected||schoolName(x.source_id)===selected)&&(!format||fileFormat(x)===format)&&(!q||(archiveTitle(x)+x.url+schoolName(x.source_id)).toLowerCase().includes(q)));
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));archivePage=Math.min(archivePage,pages);visibleArchives=rows.slice((archivePage-1)*pageSize,archivePage*pageSize);
  $('#archive-list').innerHTML=visibleArchives.map(x=>`<article class="row archive-row"><label class="archive-pick"><input type="checkbox" data-archive-select="${x.id}" aria-label="选择 ${esc(archiveTitle(x))}" ${selectedArchives.has(x.id)?'checked':''}></label><div><div class="meta"><span class="file-tag">${fileFormat(x)}</span> ${esc(schoolName(x.source_id))} · ${stamp(x.created)} · ${esc(x.kind)}</div><h3>${esc(archiveTitle(x))}</h3><p class="archive-url">${esc(x.url)}</p><div class="actions"><a href="/api/archive?id=${x.id}&view=raw">下载原件 ↓</a><a href="/api/archive?id=${x.id}&view=text" target="_blank" rel="noopener">查看文本</a><a href="/api/archive?id=${x.id}&view=manifest" target="_blank" rel="noopener">来源记录</a></div></div></article>`).join('')||empty('没有匹配的已保存原件。可调整筛选，或粘贴官网链接加入归档队列。');
  $('#archive-count').textContent=`${rows.length} 个匹配 · 已选 ${selectedArchives.size} 个版本`;
  $('#download-bundle').disabled=!selectedArchives.size;$('#download-bundle').textContent=`打包下载${selectedArchives.size?' ('+selectedArchives.size+')':''}`;
  $('#select-page').checked=visibleArchives.length>0&&visibleArchives.every(x=>selectedArchives.has(x.id));$('#select-page').indeterminate=visibleArchives.some(x=>selectedArchives.has(x.id))&&!$('#select-page').checked;
  $('#archive-pager').innerHTML=`<button data-archive-page="${archivePage-1}" ${archivePage<=1?'disabled':''}>上一页</button><span>${archivePage} / ${pages}</span><button data-archive-page="${archivePage+1}" ${archivePage>=pages?'disabled':''}>下一页</button>`;
}
['archive-school','archive-format','archive-latest'].forEach(id=>$('#'+id).onchange=()=>{archivePage=1;renderLibrary()});
$('#archive-search').addEventListener('input',()=>{archivePage=1;renderLibrary()});
$('#archive-reset').onclick=()=>{$('#archive-school').value=$('#archive-format').value=$('#archive-search').value='';$('#archive-latest').checked=true;archivePage=1;renderLibrary()};
$('#select-page').onchange=e=>{visibleArchives.forEach(x=>e.target.checked?selectedArchives.add(x.id):selectedArchives.delete(x.id));renderLibrary()};
$('#clear-selection').onclick=()=>{selectedArchives.clear();renderLibrary()};
let downloading=false;
$('#download-bundle').onclick=async()=>{if(downloading)return;downloading=true;const b=$('#download-bundle');b.disabled=true;try{
  const r=await fetch('/api/archive-bundle',{method:'POST',headers:{'Content-Type':'application/json','X-App-Token':data.token},body:JSON.stringify({ids:[...selectedArchives]})});
  if(!r.ok)throw Error((await r.json()).error);const blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='研招原件与来源.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);toast('已生成原件包，包含来源与校验记录');
}catch(err){toast(err.message)}finally{downloading=false;renderLibrary()}};
document.body.insertAdjacentHTML('beforeend',`<dialog id="batch-dialog"><form id="batch-form"><div class="section-head"><h2>批量加入归档</h2><button type="button" id="close-batch" aria-label="关闭批量归档">×</button></div><p class="hint">每行一个公开网址，最多 30 个。选择同一归属来源，已有网址自动跳过。</p><label>归属来源<select id="batch-source" required></select></label><label>官网正文或附件网址<textarea id="batch-input" rows="9" required placeholder="https://…&#10;https://…"></textarea></label><p id="batch-result" role="status"></p><button class="primary" type="submit">加入归档队列</button></form></dialog>`);
$('#batch-urls').onclick=()=>{$('#batch-source').innerHTML=sourceOptions().map(([id,name])=>`<option value="${id}">${esc(name)}</option>`).join('');$('#batch-result').textContent='';$('#batch-dialog').showModal()};
$('#close-batch').onclick=()=>$('#batch-dialog').close();
$('#batch-form').onsubmit=async e=>{e.preventDefault();e.submitter.disabled=true;try{const r=await post('archive-many',{source_id:Number($('#batch-source').value),urls:$('#batch-input').value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean)});$('#batch-input').value='';$('#batch-result').textContent=`已加入 ${r.added} 个，跳过 ${r.duplicates} 个重复网址。关闭窗口后点击“继续归档队列”开始保存。`;await load()}catch(err){$('#batch-result').textContent=err.message}finally{e.submitter.disabled=false}};

const workspaceRender=render;
render=()=>{workspaceRender();if(!data)return;if(activeTab==='directory')renderDirectory();if(activeTab==='archives')renderLibrary();if(activeTab==='updates'&&$('#update-mode').value==='items'){
  const q=$('#item-search').value.toLowerCase(),items=data.items.filter(e=>(e.title+e.published+school(e.source_id)).toLowerCase().includes(q));
  $$('#updates-list .row').forEach((row,i)=>row.insertAdjacentHTML('beforeend',`<button class="queue-item" data-save-item="${items[i].id}">保存这条通知与附件</button>`));
}};
$('#update-mode').addEventListener('change',()=>render());
$('#item-search').addEventListener('input',()=>render());
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||!data)return;try{
  const d=b.dataset;
  if(d.palette){[appearance.one,appearance.two]=palettes[d.palette];applyAppearance()}
  if(d.directoryFilter){directoryFilter=d.directoryFilter;directoryPage=1;renderDirectory()}
  if(d.layout){directoryLayout=d.layout;remember('directoryLayout',directoryLayout);renderDirectory()}
  if(d.directoryPage){directoryPage=Number(d.directoryPage);renderDirectory();$('#directory-count').scrollIntoView({block:'start'})}
  if(d.archivePage){archivePage=Number(d.archivePage);renderLibrary();$('.archive-selection').scrollIntoView({block:'start'})}
  if(d.stat){if(['favorites','connected'].includes(d.stat)){directoryFilter=d.stat;directoryPage=1;renderDirectory()}else go(d.stat)}
  if(d.favorite){b.disabled=true;await post('favorite',{id:d.favorite,favorite:!(data.settings.favorites||[]).includes(d.favorite)});await load()}
  if(d.connect){const u=data.institutions.find(x=>x.id===d.connect);openDiscovery({school:u.school,source_type:u.tier==='985'?'学校研招网':'研究院/研究所'});$('#discover-query').value=u.school;await discover(u.school)}
  if(d.schoolFiles){const u=data.institutions.find(x=>x.id===d.schoolFiles),source=data.sources.find(s=>ownsSource(u,s));go('archives');$('#archive-reset').click();$('#archive-school').value=source.school||source.name;renderLibrary()}
  if(d.saveItem){const item=data.items.find(x=>x.id===Number(d.saveItem));await post('archive-url',{source_id:item.source_id,url:item.url,title:item.title,kind:'page'});toast('已加入队列。进入资料归档，点击“继续归档队列”保存通知及可发现附件。');await load()}
}catch(err){toast(err.message);b.disabled=false}});
document.addEventListener('change',e=>{if(e.target.dataset.archiveSelect){const id=Number(e.target.dataset.archiveSelect);e.target.checked?selectedArchives.add(id):selectedArchives.delete(id);renderLibrary()}});
go('directory');
