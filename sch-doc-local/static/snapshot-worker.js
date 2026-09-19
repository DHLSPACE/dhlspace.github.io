'use strict';
// Dedicated worker. Original bytes remain intact; compression never blocks the UI.
importScripts('./vendor/fflate.min.js');
const safe=(s,max=50)=>{let n=String(s||'待核实').replace(/[\u0000-\u001f<>:"/\\|?*]/g,'_').replace(/[. ]+$/g,'').slice(0,max)||'待核实';return /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(n)?'_'+n:n};
const encode=s=>new TextEncoder().encode(s);
const csv=s=>{s=String(s??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'};
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b=>b.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data:job})=>{
  let total=0,originals=0;
  const files=Object.create(null),index=[],problems=[];
  async function get(path){
    if(!/^archive\/\d+\/(raw|text|manifest)\.[a-z0-9.]+$/i.test(path||''))throw Error('资料路径无效');
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
    try{
      const response=await fetch(new URL(path,self.location.href),{signal:controller.signal,credentials:'omit'});
      if(!response.ok)throw Error('HTTP '+response.status);
      if(response.headers.get('Content-Type')?.includes('text/html'))throw Error('服务器返回了网页，未得到原件');
      const reader=response.body.getReader(),parts=[];let length=0;
      while(true){const {value,done}=await reader.read();if(done)break;total+=value.length;length+=value.length;if(total>job.maxBytes){await reader.cancel();throw Error('LIMIT')}parts.push(value)}
      const bytes=new Uint8Array(length);let pos=0;for(const part of parts){bytes.set(part,pos);pos+=part.length}return bytes;
    }finally{clearTimeout(timer)}
  }
  try{
    for(const [i,row] of job.rows.entries()){
      const folder=[safe(row.filing.school,36),safe(row.filing.year,12),safe(row.filing.scope,12),safe(row.filing.department,28),safe(row.display_title,45)+'__'+row.id].join('/')+'/';
      const entry={id:row.id,title:row.display_title,filing:row.filing,url:row.url,saved_at:row.created,original_sha256:row.sha256,files:[],warnings:[]};
      for(const [key,label] of [['raw_path','原件'],['text_path','正文'],['manifest_path','来源']]){
        try{
          const bytes=await get(row[key]),actual=await hash(bytes),name=folder+label+'_'+row[key].split('/').pop();
          files[name]=[bytes,{level:/\.(pdf|png|jpe?g|zip|docx|xlsx)$/i.test(name)?0:3}];
          entry.files.push({path:name,sha256:actual,bytes:bytes.length,role:label});
          if(key==='raw_path'){originals++;if(row.sha256&&row.sha256!==actual)throw Error('原件与发布校验值不一致，已保留实际文件并标记')}
        }catch(e){
          if(e.message==='LIMIT')throw Error('本批文件超过浏览器内存保护上限，请按学校或年份分批');
          const warning=label+'：'+(e.name==='AbortError'?'下载超时':e.message);entry.warnings.push(warning);problems.push({id:row.id,title:row.display_title,url:row.url,problem:warning});
        }
      }
      index.push(entry);self.postMessage({type:'progress',done:i+1,total:job.rows.length,bytes:total,message:'正在读取 '+(i+1)+' / '+job.rows.length+' · '+row.filing.school});
    }
    if(!originals)throw Error('本次未下载到任何原件，未生成空资料包。请检查网络后重试。');
    const meta={format:'schdoc.snapshot.v2',created:new Date().toISOString(),published_at:job.publishedAt,classification:'来源与标题规则推导，未调用 AI',mode:job.mode,originals,records:index,problems,pending:job.pending,pending_scope:'全库待归档参考；不表示属于本次筛选，未计入成功文件'};
    files['来源索引.json']=encode(JSON.stringify(meta,null,2));
    files['未完成与校验问题.json']=encode(JSON.stringify({problems,pending:job.pending},null,2));
    const rows=[['编号','学校','招生年份','用途','院系','标题','原网址','保存时间','状态'],...index.map(x=>[x.id,x.filing.school,x.filing.year,x.filing.scope,x.filing.department,x.title,x.url,x.saved_at,x.warnings.join('；')||'文件齐全'])];
    files['分类目录.csv']=encode('\ufeff'+rows.map(row=>row.map(csv).join(',')).join('\r\n'));
    files['阅读说明.txt']=encode('学校 / 招生年份 / 用途 / 院系 / 标题__编号。\n这是公开站已发布原件的手动快照；没有抓取新的官网文件。\nHTML 等主动内容以 .download.txt 留存，原件字节不变。\n查看来源索引与缺失清单；校验警告不代表已验证成功。\n招生年份不明确仍为待核实；分类来自规则，不是 AI 或官方事实。\n公示匹配参考标题，不保证覆盖全部名单或判断公示到期日。中科院资料也不保证永久有效。\n快照不含个人笔记与应用数据库。请单独备份个人笔记。\n压缩：fflate 0.8.3，MIT license，浏览器本地 Web Worker。\n');
    self.postMessage({type:'progress',done:job.rows.length,total:job.rows.length,message:'正在压缩并生成来源索引…'});
    const zip=fflate.zipSync(files,{level:3});
    self.postMessage({type:'complete',zip:zip.buffer,count:index.length,originals,warnings:problems.length,missing:index.filter(x=>!x.files.some(f=>f.role==='原件')).length,bytes:zip.length},[zip.buffer]);
  }catch(e){self.postMessage({type:'error',message:e.message||'打包失败'})}
};
