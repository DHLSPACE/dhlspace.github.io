// Shared public contract: no credentials, identifiers or conversation data.
export const DEFAULT_SOURCE = 'https://raw.githubusercontent.com/DHLSPACE/dhlspace.github.io/si-data/status.json';
export const number = v => typeof v === 'number' && Number.isFinite(v);
export function iso(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v !== 'string' && !number(v)) return null;
  const d = new Date(typeof v === 'number' ? v * 1000 : v);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
const text = (v, fallback) => typeof v === 'string' ? v.slice(0, 100) : fallback;
export function normalizeQuota(result) {
  const buckets = result.rateLimitsByLimitId;
  const entries = buckets && Object.keys(buckets).length ? Object.entries(buckets) : [['codex', result.rateLimits]];
  const windows = [];
  for (const [key, bucket] of entries.slice(0, 20)) {
    if (!bucket || typeof bucket !== 'object') continue;
    for (const lane of ['primary', 'secondary']) {
      const w = bucket[lane];
      if (!w || !number(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100) continue;
      windows.push({ id: text(bucket.limitId, key) + ':' + lane, label: text(bucket.limitName, text(bucket.limitId, key)),
        usedPercent: w.usedPercent, durationMinutes: number(w.windowDurationMins) && w.windowDurationMins > 0 ? w.windowDurationMins : null,
        resetsAt: iso(w.resetsAt) });
    }
  }
  if (!windows.length) throw new Error('NO_QUOTA');
  const plan = result.rateLimits?.planType || entries[0]?.[1]?.planType;
  return { planType: typeof plan === 'string' && /^[a-z0-9_]{1,50}$/i.test(plan) ? plan : null,
    ordinaryUsageAllowed: typeof result.ordinaryUsageAllowed === 'boolean' ? result.ordinaryUsageAllowed : null, windows };
}
export function validateSnapshot(data) {
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.windows) || data.windows.length > 40) throw new Error('不支持的数据格式，请使用本页提供的探针。');
  if (!['ok', 'error', 'no_data'].includes(data.status)) throw new Error('探针状态无效。');
  if (data.status !== 'no_data' && !iso(data.updatedAt)) throw new Error('缺少有效的采集时间。');
  for (const w of data.windows) {
    if (typeof w.id !== 'string' || typeof w.label !== 'string' || !number(w.usedPercent) || w.usedPercent < 0 || w.usedPercent > 100 || (w.resetsAt != null && !iso(w.resetsAt)) || (w.durationMinutes != null && (!number(w.durationMinutes) || w.durationMinutes <= 0))) throw new Error('额度数据无效。');
  }
  if (data.status === 'ok' && !data.windows.length) throw new Error('额度窗口为空。');
  const history = Array.isArray(data.history) ? data.history.slice(-2016).filter(p => p && iso(p.at) && Array.isArray(p.windows) && p.windows.length <= 40 && p.windows.every(w => w && typeof w.id === 'string' && number(w.usedPercent) && w.usedPercent >= 0 && w.usedPercent <= 100 && (w.resetsAt == null || iso(w.resetsAt)))) : [];
  return { ...data, history };
}
export function health(data, now = Date.now()) {
  if (!data) return 'waiting';
  if (data.status === 'no_data') return data.errorCode ? 'error' : 'waiting';
  const time = Date.parse(data.updatedAt);
  if (!Number.isFinite(time) || time > now + 120000) return 'invalid';
  if (data.status === 'error') return 'error';
  const interval = Math.min(3600, Math.max(60, Number(data.intervalSeconds) || 300));
  return now - time > Math.max(900, interval * 3) * 1000 ? 'stale' : 'online';
}
export function windowName(w) {
  if (w.durationMinutes === 300) return '5 小时额度';
  if (w.durationMinutes === 10080) return '每周额度';
  if (!w.durationMinutes) return w.id.endsWith(':primary') ? '主额度窗口' : '次额度窗口';
  const days = w.durationMinutes >= 1440;
  return (w.durationMinutes / (days ? 1440 : 60)).toFixed(1).replace(/\.0$/, '') + (days ? ' 天额度' : ' 小时额度');
}
export function forecast(w, history, now = Date.now()) {
  if (!w.resetsAt || Date.parse(w.resetsAt) <= now) return null;
  const points = history.filter(p => Date.parse(p.at) >= now - 3600000 && Date.parse(p.at) <= now)
    .map(p => ({ at: Date.parse(p.at), w: p.windows.find(v => v.id === w.id && v.resetsAt === w.resetsAt) })).filter(p => p.w);
  if (points.length < 2) return null;
  const first = points[0], last = points.at(-1);
  if (last.at - first.at < 900000 || now - last.at > 900000) return null;
  if (points.some((p, i) => i && p.w.usedPercent < points[i - 1].w.usedPercent)) return null;
  const delta = last.w.usedPercent - first.w.usedPercent;
  if (delta <= 0) return null;
  const perHour = delta / ((last.at - first.at) / 3600000);
  return { perHour, exhaustsAt: last.at + ((100 - last.w.usedPercent) / perHour) * 3600000 };
}
export function demoSnapshot(now = Date.now()) {
  const resets = [iso((now + 2.3 * 3600000) / 1000), iso((now + 3.4 * 86400000) / 1000)];
  const windows = [
    { id: 'codex:primary', label: 'Codex', usedPercent: 32, durationMinutes: 300, resetsAt: resets[0] },
    { id: 'codex:secondary', label: 'Codex', usedPercent: 57, durationMinutes: 10080, resetsAt: resets[1] },
  ];
  const history = Array.from({ length: 289 }, (_, i) => ({ at: iso((now - (288 - i) * 300000) / 1000), windows: windows.map((w, j) => ({
    id: w.id, resetsAt: w.resetsAt, usedPercent: j ? 16 + 41 * i / 288 : Math.max(0, 32 - (288 - i) * .5) })) }));
  return { schemaVersion: 1, status: 'ok', updatedAt: iso(now / 1000), intervalSeconds: 300, planType: 'plus', ordinaryUsageAllowed: true, windows, history };
}
