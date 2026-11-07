import { DEFAULT_SOURCE, validateSnapshot, health, windowName, forecast, demoSnapshot } from './model.mjs';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pct = value => Number(value.toFixed(1)).toString();
const date = value => value ? new Date(value).toLocaleString('zh-CN', { month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }) : '未提供';
function storageGet() { try { return localStorage.getItem('si-source') || DEFAULT_SOURCE; } catch { return DEFAULT_SOURCE; } }
function storageSet(value) { try { localStorage.setItem('si-source', value); } catch { /* In-memory settings still work. */ } }
let source = storageGet(), snapshot = null, mode = 'remote', previousMode = 'remote', demo = null, fetchError = '', controller = null;
const current = () => mode === 'demo' ? demo : snapshot;
const windows = data => [...(data?.windows || [])].sort((a,b) => Number(b.id.startsWith('codex:')) - Number(a.id.startsWith('codex:')));
function notice(message) { $('notice').textContent = message; $('notice').hidden = !message; }
function status() {
  const data = current(), state = health(data);
  const names = { waiting:'等待接入', online:'探针在线', stale:'数据已过期', error:'采集异常', invalid:'采样时间异常' };
  const label = mode === 'demo' ? '演示数据' : fetchError ? '连接异常' : mode === 'local' ? '本地快照 · ' + names[state] : names[state];
  $('status').textContent = '● ' + label;
  $('status').className = 'status-badge ' + (mode === 'demo' ? 'demo' : fetchError ? 'error' : state);
  $('plan').textContent = '套餐 ' + (data?.planType ? String(data.planType).toUpperCase() : '—');
  const age = data?.updatedAt ? Math.max(0, Math.floor((Date.now() - Date.parse(data.updatedAt)) / 60000)) : null;
  $('updated').textContent = age === null ? '尚未收到数据' : age < 1 ? '刚刚采集' : age < 60 ? age + ' 分钟前采集' : Math.floor(age / 60) + ' 小时前采集';
  $('source-label').textContent = mode === 'demo' ? 'DEMO · SIMULATED' : mode === 'local' ? 'LOCAL · SNAPSHOT' : source === DEFAULT_SOURCE ? 'GITHUB · JSON' : 'CUSTOM · JSON';
  $('clock').textContent = new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false }) + ' · 本地';
  let message = '';
  if (mode === 'demo') message = '正在展示模拟数据，仅用于体验界面。点击“退出演示”返回你的真实数据。';
  else if (fetchError) message = fetchError + (snapshot?.updatedAt ? ' 以下保留上次成功读取的快照。' : '');
  else if (state === 'stale') message = '探针已超过正常采样间隔。以下为旧快照；请检查采集设备是否在线。';
  else if (state === 'invalid') message = '采样时间晚于当前时间，请检查采集设备的系统时钟。';
  else if (state === 'error') message = data?.updatedAt ? '探针最近一次采集失败，以下保留上次成功采样。请检查本机 Codex 登录和网络。' : '探针采集失败，尚未收到有效额度。请检查本机 Codex 登录和网络。';
  else if (data?.ordinaryUsageAllowed === false) message = 'Codex 返回当前普通额度不可用。重置倒计时不能确认账号已经恢复使用。';
  else if (data?.windows?.some(w => w.resetsAt && Date.parse(w.resetsAt) <= Date.now())) message = '有额度窗口已到返回的重置时间，等待新采样确认；页面不会自动把额度改为 100%。';
  notice(message);
  $('demo').textContent = mode === 'demo' ? '退出演示 ↗' : '体验演示数据 ↗';
}
function cards(data) {
  const all = windows(data), main = all.slice(0, 2);
  while (main.length < 2) main.push(null);
  $('quota-cards').innerHTML = main.map((w, i) => {
    const remaining = w ? 100 - w.usedPercent : null;
    const length = remaining === null ? 0 : remaining / 100 * 226.2;
    return '<article class="quota-card"><div class="quota-heading"><span>' + escape(w ? windowName(w) : i ? '次额度窗口' : '主额度窗口') + '</span><span class="quota-tag">' + escape(w ? w.label : 'NO DATA') + '</span></div><div class="quota-body"><div><div class="big-number">' + (remaining === null ? '—' : pct(remaining)) + '<small>%</small></div><div class="number-label">剩余额度' + (w ? ' · 已用 ' + pct(w.usedPercent) + '%' : ' · 等待采样') + '</div></div><div class="gauge" aria-hidden="true"><svg viewBox="0 0 84 84"><circle class="track" cx="42" cy="42" r="36"/><circle class="value" cx="42" cy="42" r="36" stroke-dasharray="' + length + ' 226.2"/></svg><span>↗</span></div></div><div class="quota-footer"><span>下次重置</span><strong>' + escape(w ? date(w.resetsAt) : '等待探针接入') + '</strong></div></article>';
  }).join('');
}
function countdown() {
  const data = current(), all = windows(data), now = Date.now();
  const timed = all.filter(w => w.resetsAt);
  // Keep elapsed reset boundaries visible until a newer authoritative reading arrives.
  const next = [...timed].sort((a,b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt))[0];
  if (!next) {
    $('reset-window').textContent = all.length ? '未返回重置时间' : '等待额度数据';
    $('countdown').innerHTML = '—<span> : </span>—<span> : </span>—';
    $('reset-date').textContent = '接入后显示本地时间与倒计时';
    $('reset-note').textContent = '倒计时结束后，等待新采样确认重置。';
    return;
  }
  $('reset-window').textContent = windowName(next) + (next.label.toLowerCase() === 'codex' ? '' : ' · ' + next.label);
  const delta = Date.parse(next.resetsAt) - now;
  if (delta <= 0) $('countdown').textContent = '待确认重置';
  else {
    const seconds = Math.floor(delta / 1000), hours = Math.floor(seconds / 3600), mins = Math.floor(seconds / 60) % 60, secs = seconds % 60;
    $('countdown').innerHTML = String(hours).padStart(2,'0') + '<span> : </span>' + String(mins).padStart(2,'0') + '<span> : </span>' + String(secs).padStart(2,'0');
  }
  $('reset-date').textContent = date(next.resetsAt) + ' · ' + Intl.DateTimeFormat().resolvedOptions().timeZone;
  const f = !fetchError && health(data) === 'online' && forecast(next, data.history || []);
  $('reset-note').textContent = delta <= 0 ? '需等待探针重新采样，确认额度是否恢复。' : f && f.exhaustsAt < Date.parse(next.resetsAt) ? '按近期速度，可能在 ' + date(new Date(f.exhaustsAt).toISOString()) + ' 耗尽（估算）。' : '重置时间由 Codex 返回，以最新采样为准。';
}
function table(data) {
  const all = windows(data);
  $('windows').innerHTML = all.length ? all.map(w => {
    const f = !fetchError && health(data) === 'online' && forecast(w, data.history || []);
    return '<tr><td>' + escape(windowName(w)) + '<small>' + escape(w.label) + '</small></td><td><span class="mini-bar" aria-hidden="true"><i style="width:' + w.usedPercent + '%"></i></span>' + pct(w.usedPercent) + '%</td><td>' + pct(100-w.usedPercent) + '%</td><td>' + escape(date(w.resetsAt)) + '</td><td>' + (f ? pct(f.perHour) + '% / h<small>按近期速度线性估算</small>' : '—<small>等待有效采样</small>') + '</td></tr>';
  }).join('') : '<tr><td colspan="5" class="empty-row">还没有额度数据，接入探针后会自动显示。</td></tr>';
}
function chart(data) {
  const now = Date.now(), start = now - 86400000, all = windows(data).slice(0,2);
  const points = (data?.history || []).filter(p => Date.parse(p.at) >= start && Date.parse(p.at) <= now);
  let svg = '<svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="最近24小时已用额度百分比趋势">';
  for (const value of [0,25,50,75,100]) {
    const y = 130 - value * 1.15;
    svg += '<line x1="35" x2="590" y1="' + y + '" y2="' + y + '" stroke="#2a3239" stroke-dasharray="3 5"/><text x="0" y="' + (y+3) + '">' + value + '%</text>';
  }
  for (let i = 0; i < 5; i++) svg += '<text x="' + (35 + i*138) + '" y="155" text-anchor="' + (i===4 ? 'end' : 'start') + '">' + escape(new Date(start + i * 21600000).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})) + '</text>';
  let count = 0;
  all.forEach((w, index) => {
    let segment = [], previous = null;
    const finish = () => {
      const color = index ? '#91d9b5' : '#8dacf6';
      if (segment.length > 1) svg += '<polyline points="' + segment.map(p=>p.join(',')).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" vector-effect="non-scaling-stroke"/>';
      else if (segment.length) svg += '<circle cx="' + segment[0][0] + '" cy="' + segment[0][1] + '" r="2" fill="' + color + '"/>';
      segment = [];
    };
    points.forEach(p => {
      const v = p.windows.find(v => v.id === w.id), at = Date.parse(p.at);
      if (!v) { finish(); previous = null; return; }
      if (previous && (v.resetsAt !== previous.v.resetsAt || v.usedPercent < previous.v.usedPercent || at - previous.at > Math.max(900000, (data.intervalSeconds || 300) * 3000))) finish();
      segment.push([35+(at-start)/86400000*555, 130-v.usedPercent*1.15]); previous={v,at}; count++;
    });
    finish();
  });
  svg += '</svg>';
  $('chart').innerHTML = svg + (!count ? '<div class="chart-empty">等待第一个采样点</div>' : '');
  $('history-count').textContent = points.length + ' 个采样点';
}
function render() { const data = current(); cards(data); table(data); chart(data); status(); countdown(); }
async function refresh() {
  if (mode !== 'remote') { render(); return; }
  controller?.abort(); const active = new AbortController(); controller = active;
  $('refresh').disabled = true;
  try {
    const url = new URL(source); url.searchParams.set('_si', Math.floor(Date.now()/60000));
    const response = await fetch(url, { cache:'no-store', credentials:'omit', signal:AbortSignal.any([active.signal, AbortSignal.timeout(12000)]), referrerPolicy:'no-referrer' });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const body = await response.text();
    if (body.length > 2000000) throw new Error('数据超过大小限制');
    const data = validateSnapshot(JSON.parse(body));
    if (controller !== active) return;
    snapshot = data; fetchError = '';
  } catch (error) {
    if (controller !== active || active.signal.aborted) return;
    fetchError = '读取探针快照失败，请检查网络或数据源。';
  } finally {
    if (controller === active) { $('refresh').disabled = false; render(); }
  }
}
const dialog = $('setup-dialog');
function openSetup() { $('source').value = source; $('setup-feedback').textContent = ''; dialog.showModal(); }
$('connect').addEventListener('click', openSetup); $('setup-more').addEventListener('click', openSetup);
$('close-dialog').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', event => { if (event.target === dialog) { const r=dialog.getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) dialog.close(); } });
$('refresh').addEventListener('click', refresh);
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('command').textContent); $('copy').textContent = '已复制'; }
  catch { $('copy').textContent = '请手动选择复制'; }
});
function useSource(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || [...url.searchParams.keys()].some(k=>/token|key|auth|secret|signature/i.test(k))) throw new Error('请填写不含令牌的公开 HTTPS 地址。');
  source=url.href; storageSet(source); controller?.abort(); snapshot=null; fetchError=''; mode='remote'; dialog.close(); render(); refresh();
}
$('save-source').addEventListener('click', () => { try { useSource($('source').value.trim()); } catch(error) { $('setup-feedback').textContent=error.message; } });
$('reset-source').addEventListener('click', () => useSource(DEFAULT_SOURCE));
$('import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  try {
    if (file.size > 2000000) throw new Error('文件超过 2 MB。');
    const data = validateSnapshot(JSON.parse(await file.text()));
    controller?.abort(); snapshot=data; fetchError=''; mode='local'; $('refresh').disabled=false; dialog.close(); render();
  } catch(error) { $('setup-feedback').textContent = '导入失败：' + error.message; }
  event.target.value='';
});
$('demo').addEventListener('click', () => {
  if (mode === 'demo') { mode=previousMode; demo=null; render(); if (mode==='remote') refresh(); }
  else { controller?.abort(); previousMode=mode; mode='demo'; demo=demoSnapshot(); $('refresh').disabled=false; render(); }
});
render(); refresh();
setInterval(() => { if (!document.hidden) { status(); countdown(); } }, 1000);
setInterval(() => { if (!document.hidden && mode==='remote') refresh(); }, 60000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); if(mode==='remote') refresh(); } });
