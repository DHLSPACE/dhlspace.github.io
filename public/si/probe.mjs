#!/usr/bin/env node
// Node 22+. Read-only Codex RPC; publishing requires an explicit --publish.
import { spawn, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';
import { normalizeQuota, validateSnapshot } from './model.mjs';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const EMPTY = { schemaVersion:1, status:'no_data', updatedAt:null, intervalSeconds:300, planType:null, ordinaryUsageAllowed:null, windows:[], history:[] };
const MESSAGES = {
  CODEX_MISSING:'找不到 Codex CLI。请安装并运行 codex login，或指定 --codex-bin 完整路径。',
  CODEX_RPC:'Codex 额度读取失败。请确认 codex login 已登录 ChatGPT，并更新 Codex CLI。',
  CODEX_TIMEOUT:'读取 Codex 超时。请检查本机网络和 Codex 登录。',
  NO_QUOTA:'Codex 没有返回订阅额度窗口。API Key 账户或部分套餐可能不支持。',
  GH_MISSING:'找不到 GitHub CLI。请安装 gh 并运行 gh auth login。',
  GH_AUTH:'GitHub 拒绝访问。请确认 gh 登录账号有目标仓库 contents 写入权限。',
  GH_REQUEST:'GitHub 上传失败。请检查网络、仓库权限或是否有另一台探针同时上传。',
};
function coded(code, status) { return Object.assign(new Error(code), { status }); }
function codexCommand(override) {
  if (override && !/\.(cmd|bat)$/i.test(override)) return [override, []];
  if (process.platform !== 'win32') return [override || 'codex', []];
  // npm's Windows .cmd shim cannot be spawned without a shell. Resolve its JS entry instead.
  let paths;
  try { paths = override ? [override] : execFileSync('where.exe', ['codex'], { encoding:'utf8', windowsHide:true }).trim().split(/\r?\n/); }
  catch { throw coded('CODEX_MISSING'); }
  for (const path of paths) {
    if (/\.exe$/i.test(path)) return [path, []];
    const entry = join(dirname(path), 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
    if (existsSync(entry)) return [process.execPath, [entry]];
  }
  throw coded('CODEX_MISSING');
}
export async function readQuota({ command, timeout = 25000, signal } = {}) {
  const [bin, prefix] = command || codexCommand();
  const child = spawn(bin, [...prefix, 'app-server'], { stdio:['pipe','pipe','pipe'], windowsHide:true });
  const lines = createInterface({ input:child.stdout, crlfDelay:Infinity });
  child.stderr.resume(); // Never forward server logs, paths or authentication errors into the public snapshot.
  const pending = new Map(); let nextId=1, closed=false;
  function fail(error) { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); }
  child.on('error', error => fail(coded(error.code==='ENOENT' ? 'CODEX_MISSING' : 'CODEX_RPC')));
  child.on('close', () => { closed=true; fail(coded('CODEX_RPC')); });
  child.stdin.on('error', () => fail(coded('CODEX_RPC')));
  lines.on('line', line => {
    let msg; try { msg=JSON.parse(line); } catch { return; }
    if (msg.method && msg.id !== undefined) {
      child.stdin.write(JSON.stringify({ id:msg.id, error:{code:-32601,message:'Read-only quota client'} })+'\n');
      return;
    }
    const p=pending.get(msg.id); if (!p) return;
    clearTimeout(p.timer); pending.delete(msg.id);
    msg.error ? p.reject(coded('CODEX_RPC')) : p.resolve(msg.result);
  });
  function request(method, params) {
    return new Promise((resolveRequest,reject) => {
      if (closed) return reject(coded('CODEX_RPC'));
      const id=nextId++, timer=setTimeout(()=>{ pending.delete(id); reject(coded('CODEX_TIMEOUT')); },timeout);
      pending.set(id,{resolve:resolveRequest,reject,timer});
      child.stdin.write(JSON.stringify({id,method,...(params===undefined ? {} : {params})})+'\n');
    });
  }
  const stop = () => { fail(coded('CODEX_RPC')); child.stdin.end(); };
  signal?.addEventListener('abort',stop,{once:true});
  try {
    if (signal?.aborted) throw coded('CODEX_RPC');
    await request('initialize',{clientInfo:{name:'si_codex_probe',title:'SI Codex Probe',version:'1.0.0'},capabilities:{experimentalApi:true}});
    child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
    const account=await request('account/read',{refreshToken:false});
    const result=await request('account/rateLimits/read');
    const identity = result.accountId || account?.account?.email || null;
    const fingerprint = identity ? createHash('sha256').update(String(identity)).digest('hex') : null;
    return { result, fingerprint };
  } finally {
    signal?.removeEventListener('abort',stop);
    fail(coded('CODEX_RPC')); lines.close(); child.stdin.end();
    if (!closed) await new Promise(done => {
      const timer=setTimeout(()=>{ child.kill(); done(); },2000);
      child.once('close',()=>{clearTimeout(timer);done();});
    });
  }
}
export function buildSnapshot(result, previous, { fingerprint=null, intervalSeconds=300, now=Date.now() } = {}) {
  const quota=normalizeQuota(result);
  const at=new Date(now).toISOString();
  const same = fingerprint && fingerprint===previous?.fingerprint && quota.planType===previous?.snapshot?.planType;
  const previousHistory = same ? validateSnapshot(previous.snapshot).history.map(p=>({at:p.at,windows:p.windows.map(w=>({id:w.id,usedPercent:w.usedPercent,resetsAt:w.resetsAt}))})) : [];
  const point={at,windows:quota.windows.map(w=>({id:w.id,usedPercent:w.usedPercent,resetsAt:w.resetsAt}))};
  const history=[...previousHistory.filter(p=>Date.parse(p.at)>=now-7*86400000 && Date.parse(p.at)<now),point].slice(-2016);
  return { schemaVersion:1,status:'ok',updatedAt:at,intervalSeconds,...quota,history };
}
function runGh(args, input) {
  return new Promise((resolveGh,reject) => {
    const p=spawn('gh',args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
    let stdout='',stderr='',settled=false;
    const timer=setTimeout(()=>{p.kill();finish(coded('GH_REQUEST'));},30000);
    function finish(error,value) { if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolveGh(value); }
    p.on('error',error=>finish(coded(error.code==='ENOENT'?'GH_MISSING':'GH_REQUEST')));
    p.stdin.on('error',()=>{});
    p.stdout.on('data',data=>{stdout+=data;if(stdout.length>4000000){p.kill();finish(coded('GH_REQUEST'));}});
    p.stderr.on('data',data=>{if(stderr.length<16000)stderr+=data;});
    p.on('close',code=>{
      if(code!==0){const status=Number(stderr.match(/HTTP (\d{3})/)?.[1]);return finish(coded(status===401||status===403?'GH_AUTH':'GH_REQUEST',status));}
      try { finish(null,stdout.trim()?JSON.parse(stdout):null); } catch { finish(coded('GH_REQUEST')); }
    });
    p.stdin.end(input===undefined?undefined:JSON.stringify(input));
  });
}
const api = (path, method='GET', body) => runGh(['api','--hostname','github.com',path,'--method',method,...(body===undefined?[]:['--input','-'])],body);
export async function ensureDataBranch(repo) {
  try { await api('repos/'+repo+'/git/ref/heads/si-data'); return; }
  catch(error){if(error.status!==404)throw error;}
  const tree=await api('repos/'+repo+'/git/trees','POST',{tree:[{path:'status.json',mode:'100644',type:'blob',content:JSON.stringify(EMPTY)+'\n'}]});
  const commit=await api('repos/'+repo+'/git/commits','POST',{message:'Initialize Codex probe data',tree:tree.sha,parents:[]});
  try { await api('repos/'+repo+'/git/refs','POST',{ref:'refs/heads/si-data',sha:commit.sha}); }
  catch(error){if(error.status!==422)throw error;await api('repos/'+repo+'/git/ref/heads/si-data');}
}
export async function publishSnapshot(repo,snapshot) {
  validateSnapshot(snapshot);
  const endpoint='repos/'+repo+'/contents/status.json';
  const current=await api(endpoint+'?ref=si-data');
  await api(endpoint,'PUT',{message:'Update Codex quota snapshot',branch:'si-data',sha:current.sha,content:Buffer.from(JSON.stringify(snapshot)+'\n').toString('base64')});
}
async function readState(path) {
  try { const data=JSON.parse(await readFile(path,'utf8'));validateSnapshot(data.snapshot);return data; }
  catch(error){if(error.code==='ENOENT')return null;throw new Error('本地状态文件损坏，请备份后移走 .si/state.json 再启动。');}
}
async function atomicJson(path,data) {
  const tmp=path+'.'+process.pid+'.tmp';
  await writeFile(tmp,JSON.stringify(data)+'\n',{mode:0o600});await rename(tmp,path);
}
export async function main(args=process.argv.slice(2)) {
  const {values}=parseArgs({args,options:{publish:{type:'boolean'},once:{type:'boolean'},help:{type:'boolean'},interval:{type:'string',default:'300'},repo:{type:'string',default:'DHLSPACE/dhlspace.github.io'},'state-dir':{type:'string'},'codex-bin':{type:'string'}}});
  if(values.help){
    console.log('SI Codex Probe · Node.js 22+\n\nnode public/si/probe.mjs [--once] [--publish] [--interval 300]\n  --once       仅采集一次；默认持续运行\n  --publish    上传脱敏数据到 GitHub si-data 分支；默认仅写本地\n  --repo       GitHub owner/repo（默认 DHLSPACE/dhlspace.github.io）\n  --state-dir  本地状态目录（默认仓库 .si）\n  --codex-bin  Codex 可执行文件完整路径\n\n先运行 codex login；上传还需要 gh auth login。上传数据将公开。');return;
  }
  const interval=Number(values.interval),repo=values.repo;
  if(!Number.isInteger(interval)||interval<60||interval>3600)throw new Error('--interval 必须是 60–3600 秒的整数。');
  if(!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo))throw new Error('--repo 必须是 owner/repo。');
  const dir=resolve(values['state-dir']||join(ROOT,'.si'));
  await mkdir(dir,{recursive:true,mode:0o700});
  const lock=join(dir,'probe.lock');let handle;
  try { handle=await open(lock,'wx',0o600);await handle.writeFile(String(process.pid)); }
  catch(error){if(error.code==='EEXIST')throw new Error('探针锁已存在。请先停止另一进程；若之前意外退出，请删除 .si/probe.lock 后重试。');throw error;}
  const abort=new AbortController(),stop=()=>abort.abort();
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.log('SI Codex Probe · '+(values.publish?'将公开上传额度统计到 '+repo+' / si-data':'仅保存本地，不上传'));
  let previous;
  try {
    previous=await readState(join(dir,'state.json'));
    if(values.publish)await ensureDataBranch(repo);
    do {
      let snapshot,failed=false,fingerprint=previous?.fingerprint||null;
      try {
        const result=await readQuota({command:codexCommand(values['codex-bin']),signal:abort.signal});
        fingerprint=result.fingerprint;
        snapshot=buildSnapshot(result.result,previous,{fingerprint,intervalSeconds:interval});
        console.log(new Date().toLocaleTimeString()+' 采集成功：'+snapshot.windows.map(w=>Math.round(100-w.usedPercent)+'% 剩余').join(' / '));
      } catch(error) {
        if(abort.signal.aborted)break;
        failed=true;const code=MESSAGES[error.message]?error.message:'CODEX_RPC';
        console.error(MESSAGES[code]);
        snapshot={...(previous?.snapshot||EMPTY),status:previous?.snapshot?.updatedAt?'error':'no_data',intervalSeconds:interval,errorCode:code,attemptedAt:new Date().toISOString()};
      }
      await atomicJson(join(dir,'status.json'),snapshot);
      previous={fingerprint,snapshot};await atomicJson(join(dir,'state.json'),previous);
      if(values.publish){
        try{await publishSnapshot(repo,snapshot);console.log('已同步：https://162383.xyz/si/');}
        catch(error){failed=true;console.error(MESSAGES[error.message]||MESSAGES.GH_REQUEST);}
      }
      if(values.once){if(failed)process.exitCode=1;break;}
      if(abort.signal.aborted)break;
      await new Promise(done=>{
        const onAbort=()=>{clearTimeout(timer);done();};
        const timer=setTimeout(()=>{abort.signal.removeEventListener('abort',onAbort);done();},interval*1000);
        abort.signal.addEventListener('abort',onAbort,{once:true});
      });
    }while(!abort.signal.aborted);
  }finally{
    process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
    await handle.close();await unlink(lock);
  }
}
if(process.argv[1] && pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
  main().catch(error=>{console.error(MESSAGES[error.message]||error.message);process.exitCode=1;});
}
