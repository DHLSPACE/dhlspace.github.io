import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, chmod, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { normalizeQuota, health, forecast, validateSnapshot, demoSnapshot, windowName, iso } from '../public/si/model.mjs';
import { readQuota, buildSnapshot, EMPTY } from '../public/si/probe.mjs';
const now=Date.parse('2026-10-16T12:00:00Z');
const resets=Math.floor(now/1000)+7200;
const result={accountId:'private',email:'private@example.test',accessToken:'DO-NOT-PUBLISH',ordinaryUsageAllowed:false,
  rateLimits:{planType:'plus',primary:{usedPercent:0,windowDurationMins:300,resetsAt:resets},secondary:{usedPercent:100,windowDurationMins:10080,resetsAt:null}}};
test('preserves zero, full usage, absent reset, backend availability, and real window durations',()=>{
  const normalized=normalizeQuota(result);
  assert.equal(normalized.windows[0].usedPercent,0);
  assert.equal(normalized.windows[1].usedPercent,100);
  assert.equal(normalized.windows[1].resetsAt,null);
  assert.equal(normalized.ordinaryUsageAllowed,false);
  assert.equal(windowName(normalized.windows[0]),'5 小时额度');
  assert.equal(windowName({...normalized.windows[0],durationMinutes:43200}),'30 天额度');
  assert.equal(windowName({...normalized.windows[0],durationMinutes:null}),'主额度窗口');
});
test('retains separate model buckets without leaking unlisted fields',()=>{
  const raw={...result,rateLimitsByLimitId:{codex:result.rateLimits,spark:{limitId:'codex-spark',limitName:'Spark',primary:{usedPercent:12,windowDurationMins:300,resetsAt:resets},secret:'private'}}};
  const normalized=normalizeQuota(raw);
  assert.equal(normalized.windows.length,3);
  assert.equal(normalized.windows[2].id,'codex-spark:primary');
  assert.doesNotMatch(JSON.stringify(normalized),/private|DO-NOT-PUBLISH|secret/);
  assert.throws(()=>normalizeQuota({rateLimits:{primary:{usedPercent:NaN}}}),/NO_QUOTA/);
  assert.throws(()=>normalizeQuota({rateLimits:{primary:{usedPercent:101}}}),/NO_QUOTA/);
});
test('null timestamps stay absent; stale, future, and error snapshots do not appear online',()=>{
  assert.equal(iso(null),null);
  assert.equal(iso(undefined),null);
  assert.equal(iso(true),null);
  const data=demoSnapshot(now);
  assert.equal(health(data,now),'online');
  assert.equal(health(data,now+901000),'stale');
  assert.equal(health({...data,status:'error'},now),'error');
  assert.equal(health(data,now-121000),'invalid');
  assert.equal(health(EMPTY,now),'waiting');
  assert.equal(health({...EMPTY,errorCode:'CODEX_RPC'},now),'error');
});
test('history is isolated by local account fingerprint and plan, and public export excludes account data',()=>{
  const first=buildSnapshot(result,null,{fingerprint:'a',now});
  const previous={fingerprint:'a',snapshot:first};
  const second=buildSnapshot(result,previous,{fingerprint:'a',now:now+300000});
  assert.equal(second.history.length,2);
  assert.equal(buildSnapshot(result,previous,{fingerprint:'b',now:now+300000}).history.length,1);
  assert.equal(buildSnapshot(result,previous,{now:now+300000}).history.length,1);
  assert.equal(buildSnapshot({...result,rateLimits:{...result.rateLimits,planType:'pro'}},previous,{fingerprint:'a',now:now+300000}).history.length,1);
  assert.doesNotMatch(JSON.stringify(second),/private|DO-NOT-PUBLISH|fingerprint|accountId|email|accessToken/);
  validateSnapshot(second);
});
test('linear forecast needs a current reset boundary and 15 minutes of monotone observations',()=>{
  const w={id:'codex:primary',usedPercent:40,resetsAt:new Date(resets*1000).toISOString()};
  const point=(minutes,used,reset=w.resetsAt)=>({at:new Date(now-minutes*60000).toISOString(),windows:[{id:w.id,usedPercent:used,resetsAt:reset}]});
  const f=forecast(w,[point(30,20),point(0,40)],now);
  assert.equal(f.perHour,40);
  assert.equal(f.exhaustsAt,now+5400000);
  assert.equal(forecast(w,[point(10,20),point(0,40)],now),null);
  assert.equal(forecast(w,[point(30,60),point(0,40)],now),null);
  assert.equal(forecast(w,[point(30,20,'2026-10-17T00:00:00Z'),point(0,40)],now),null);
  assert.equal(forecast(w,[point(50,20),point(20,40)],now),null);
  assert.equal(forecast({...w,resetsAt:new Date(now-1).toISOString()},[point(30,20),point(0,40)],now),null);
});
test('rejects malformed public snapshots and filters invalid history',()=>{
  assert.throws(()=>validateSnapshot({schemaVersion:2,windows:[]}));
  assert.throws(()=>validateSnapshot({...demoSnapshot(now),updatedAt:null}));
  assert.throws(()=>validateSnapshot({...demoSnapshot(now),windows:[{id:'x',label:'x',usedPercent:-1}]}));
  const data=validateSnapshot({...demoSnapshot(now),history:[{at:'invalid',windows:[]},null]});
  assert.equal(data.history.length,0);
});
test('official stdio lifecycle reads only account and quota methods and publishes no private fields',async()=>{
  const raw=await readQuota({command:[process.execPath,[resolve('tests/fixtures/si-app-server.mjs')]],timeout:3000});
  assert.match(raw.fingerprint,/^[a-f0-9]{64}$/);
  const snapshot=buildSnapshot(raw.result,null,{fingerprint:raw.fingerprint});
  assert.equal(snapshot.windows.length,2);
  assert.doesNotMatch(JSON.stringify(snapshot),/private|secret-token|fingerprint|accountId|email|accessToken/);
});
test('timeout and missing binary failures are fixed error codes',async()=>{
  await assert.rejects(readQuota({command:[process.execPath,[resolve('tests/fixtures/si-app-server.mjs'),'--stall']],timeout:100}),/CODEX_TIMEOUT/);
  await assert.rejects(readQuota({command:['/nonexistent/si-codex-test',[]],timeout:500}),/CODEX_MISSING/);
});
test('actual CLI writes a validated local export, releases its lock, and does not need GitHub', {skip:process.platform==='win32'},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'si-probe-test-'));
  const fixture=resolve('tests/fixtures/si-app-server.mjs');
  await chmod(fixture,0o755);
  try{
    const p=spawn(process.execPath,['public/si/probe.mjs','--once','--codex-bin',fixture,'--state-dir',dir],{stdio:['ignore','pipe','pipe']});
    let output='';p.stdout.on('data',s=>output+=s);p.stderr.on('data',s=>output+=s);
    const code=await new Promise(done=>p.on('close',done));
    assert.equal(code,0,output);
    const snapshot=validateSnapshot(JSON.parse(await readFile(join(dir,'status.json'),'utf8')));
    assert.equal(snapshot.status,'ok');
    assert.doesNotMatch(output+JSON.stringify(snapshot),/private-user|private-account|secret-token/);
    await assert.rejects(readFile(join(dir,'probe.lock')),error=>error.code==='ENOENT');
  }finally{await rm(dir,{recursive:true,force:true});}
});
