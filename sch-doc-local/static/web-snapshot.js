'use strict';
// Published-site adapter. It does not call or probe any localhost endpoint.
let webDirectory=null,webWorker=null,webBusy=false,webBlob=null,webName='',webLast=null;
let webHistory=[];try{webHistory=JSON.parse(localStorage.getItem('schdoc.snapshot-history')||'[]');if(!Array.isArray(webHistory))webHistory=[]}catch{}
const supportsDirectory=typeof window.showDirectoryPicker==='function'&&window.isSecureContext;
$('.snapshot-settings').innerHTML=`<h2>手动快照</h2><p>在当前设备打包公开站已保存的资料。只有点击“保存快照”才开始读取原件。</p><div class="actions"><button data-open-snapshot>保存一份快照 ↓</button><button id="web-settings-directory" ${supportsDirectory?'':'disabled'}>选择文件夹…</button><button id="web-default-directory">使用系统下载</button></div><p class="save-mode-info" id="web-directory-note"></p><details><summary>分类、AI 与保存方式</summary><p>采用本地规则分类及开源 fflate 压缩，不调用 AI，不上传名单。年份不确定保留“待核实”。</p><p>支持文件夹访问的桌面浏览器可以选择目录；其他浏览器使用系统下载，位置由浏览器或系统决定。网页版无法直接写入电脑项目的 snapshot 文件夹。</p></details><details><summary>这台设备的快照记录</summary><ol id="web-snapshot-history" class="snapshot-history"></ol></details><p><a href="./snapshot-guide.html" target="_blank" rel="noopener">完整快照操作指南 ↗</a></p>`;
$('#snapshot-dialog>p.hint').textContent='从已发布原件生成分类 ZIP，保存在你当前使用的设备。不会在浏览器中采集新的官网文件。';
$('#snapshot-dialog-pick').disabled=!supportsDirectory;
$('#snapshot-dialog-pick').textContent=supportsDirectory?'选择文件夹…':'此浏览器使用系统下载';
$('#snapshot-start').insertAdjacentHTML('afterend','<button id="web-snapshot-cancel" class="snapshot-cancel" hidden>取消打包</button><div class="snapshot-result-actions"><button id="web-save-again" hidden>重新下载刚才的 ZIP</button><a class="snapshot-guide-link" href="./snapshot-guide.html" target="_blank" rel="noopener">操作说明 ↗</a></div>');
function webRows(){
  const mode=$('#snapshot-mode').value,ids=mode==='selected'?selectedArchives:mode==='filtered'?new Set(filteredArchiveRows().map(x=>x.id)):null;
  let rows=data.snapshots.filter(x=>x.kind!=='异常页面'&&(!ids||ids.has(x.id))&&(mode!=='publicity'||x.kind!=='list'&&x.filing.relevant&&publicityPattern.test(archiveTitle(x))));
  if($('#snapshot-latest').checked){const seen=new Set();rows=rows.filter(x=>{const key=x.source_id+'|'+x.url;if(seen.has(key))return false;seen.add(key);return true})}
  return rows;
}
function renderWebHistory(){
  $('#web-snapshot-history').innerHTML=webHistory.length?webHistory.map(x=>`<li><b>${esc(x.name)}</b><br>${esc(x.created)} · ${x.count} 个版本 · ${x.warnings} 项警告<br>${esc(x.destination)} · ${esc(x.status)}</li>`).join(''):'<li>还没有手动保存记录。</li>';
}
refreshSnapshot=async()=>{
  snapshotStatus={running:webBusy};
  const location=webDirectory?'所选文件夹：'+webDirectory.name:'浏览器 / 系统下载位置';
  $('#snapshot-target').textContent=location;
  $('#web-directory-note').textContent=supportsDirectory?(webDirectory?'已选 '+webDirectory.name+'；文件夹授权仅在本次页面会话使用。':'可选择一个保存文件夹，也可直接使用系统下载。'):'当前浏览器未提供文件夹访问。保存后请在下载列表或“文件”应用中查看；可以在浏览器设置调整下载位置。';
  $('#snapshot-progress').hidden=!webBusy;
  for(const id of ['snapshot-mode','snapshot-latest','snapshot-dialog-pick','web-settings-directory','web-default-directory'])$('#'+id).disabled=webBusy||(!supportsDirectory&&['snapshot-dialog-pick','web-settings-directory'].includes(id));
  $('#web-snapshot-cancel').hidden=!webBusy;
  estimateSnapshot();renderWebHistory();
};
estimateSnapshot=()=>{if(!data)return;const rows=webRows();const bytes=rows.reduce((sum,x)=>sum+Object.values(x.asset_sizes||{}).reduce((a,b)=>a+b,0),0);$('#snapshot-estimate').textContent=`${rows.length} 个版本 · ${new Set(rows.map(x=>x.filing.school)).size} 个单位${bytes?' · 原文件约 '+(bytes/1048576).toFixed(1)+' MB':''}`;$('#snapshot-start').disabled=webBusy||!rows.length};
$('#snapshot-mode').onchange=$('#snapshot-latest').onchange=estimateSnapshot;
async function selectWebDirectory(){
  if(!supportsDirectory||webBusy)return;
  try{webDirectory=await window.showDirectoryPicker({id:'schdoc-snapshot',mode:'readwrite'});await refreshSnapshot()}
  catch(e){if(e.name!=='AbortError')toast('文件夹未获授权，可使用系统下载。');await refreshSnapshot()}
}
$('#snapshot-dialog-pick').onclick=$('#web-settings-directory').onclick=selectWebDirectory;
$('#web-default-directory').onclick=()=>{webDirectory=null;refreshSnapshot()};
function setWebMessage(text,error=false){$('#snapshot-result').textContent=text;$('#snapshot-result').classList.toggle('snapshot-error',error)}
function datedName(){const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.zip`}
function rememberWebResult(result,status,destination){webHistory.unshift({name:webName,created:new Date().toLocaleString(),count:result.count,warnings:result.warnings,destination,status});webHistory=webHistory.slice(0,12);try{localStorage.setItem('schdoc.snapshot-history',JSON.stringify(webHistory))}catch{}renderWebHistory()}
async function saveWebBlob(result){
  if(webDirectory){
    let candidate=webName;
    for(let i=0;i<1000;i++){
      try{await webDirectory.getFileHandle(candidate);candidate=webName.replace('.zip','_'+String(i+1).padStart(2,'0')+'.zip')}
      catch(e){if(e.name==='NotFoundError')break;throw e}
      if(i===999)throw Error('同名文件过多，请换一个文件夹');
    }
    const handle=await webDirectory.getFileHandle(candidate,{create:true}),writer=await handle.createWritable();
    try{await writer.write(webBlob);await writer.close()}catch(e){await writer.abort().catch(()=>{});throw e}
    webName=candidate;rememberWebResult(result,'已写入所选文件夹',webDirectory.name);
    setWebMessage(`已保存：${webDirectory.name} / ${webName}\n${result.count} 个版本，${result.originals} 份原件，${result.warnings} 项警告。${result.warnings?'请查看 ZIP 内的未完成与校验问题清单。':''}`,!!result.warnings);
  }else{
    download(webBlob,webName);rememberWebResult(result,'已交给浏览器下载，请核对下载列表','系统下载');
    setWebMessage(`ZIP 已生成并交给浏览器下载：${webName}\n${result.count} 个版本，${result.originals} 份原件，${result.warnings} 项警告。请在下载列表确认保存完成。${result.warnings?'缺失或校验问题已写入包内清单。':''}`,!!result.warnings);
  }
}
$('#web-save-again').onclick=()=>{if(webBlob)download(webBlob,webName)};
$('#web-snapshot-cancel').onclick=()=>{if(!webWorker)return;webWorker.terminate();webWorker=null;webBusy=false;setWebMessage('已取消；未生成新 ZIP。');refreshSnapshot()};
$('#snapshot-start').onclick=async()=>{
  if(webBusy)return;const rows=webRows();if(!rows.length)return;
  if(rows.length>2000){setWebMessage('一次最多 2000 个版本，请按学校或年份分批。',true);return}
  const maxBytes=(matchMedia('(max-width:760px)').matches?75:200)*1048576;
  const estimate=rows.reduce((n,x)=>n+Object.values(x.asset_sizes||{}).reduce((a,b)=>a+b,0),0);
  if(estimate>maxBytes){setWebMessage(`本批原文件约 ${(estimate/1048576).toFixed(0)} MB，超过此设备的 ${maxBytes/1048576} MB 保护上限。请按学校或年份分批。`,true);return}
  // Directory permission requests stay inside the explicit user gesture.
  if(webDirectory){try{if(await webDirectory.requestPermission({mode:'readwrite'})!=='granted'){setWebMessage('目录未获授权。可以改用系统下载。',true);return}}catch{setWebMessage('目录授权失效，请重新选择或使用系统下载。',true);return}}
  webBusy=true;webBlob=null;webName=datedName();$('#web-save-again').hidden=true;$('#snapshot-progress').value=0;$('#snapshot-progress').max=rows.length;setWebMessage('正在读取已发布原件…');refreshSnapshot();
  try{
    webWorker=new Worker(new URL('./snapshot-worker.js?v=7',location.href));
    webWorker.onmessage=async({data:r})=>{
      if(r.type==='progress'){$('#snapshot-progress').value=r.done;$('#snapshot-progress').max=r.total;setWebMessage(r.message);return}
      if(r.type==='error'){webWorker?.terminate();webWorker=null;webBusy=false;setWebMessage(r.message,true);refreshSnapshot();return}
      if(r.type==='complete'){
        webWorker?.terminate();webWorker=null;$('#web-snapshot-cancel').hidden=true;webBlob=new Blob([r.zip],{type:'application/zip'});webLast=r;
        try{await saveWebBlob(r)}catch(e){setWebMessage('ZIP 已生成，但写入目录失败：'+e.message+'。可点击“重新下载刚才的 ZIP”使用系统下载。',true)}
        finally{webBusy=false;$('#web-save-again').hidden=false;refreshSnapshot()}
      }
    };
    webWorker.onerror=()=>{webWorker?.terminate();webWorker=null;webBusy=false;setWebMessage('压缩组件未能运行，请刷新页面重试。',true);refreshSnapshot()};
    const pending=data.resources.filter(x=>x.status!=='已归档'&&($('#snapshot-mode').value!=='publicity'||publicityPattern.test(x.display_title||x.title))).map(x=>({title:x.title,url:x.url,status:x.status,error:x.error}));
    webWorker.postMessage({rows,pending,mode:$('#snapshot-mode').value,publishedAt:data.meta.published_at,maxBytes});
  }catch(e){webBusy=false;setWebMessage(e.message,true);refreshSnapshot()}
};
// Local-tools registered this handler before the published adapter was loaded.
$('#download-bundle').onclick=()=>openSnapshot('selected');
window.addEventListener('beforeunload',e=>{if(webBusy){e.preventDefault();e.returnValue=''}});
refreshSnapshot();
