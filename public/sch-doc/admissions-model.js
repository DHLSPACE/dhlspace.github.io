/* Shared, read-only admissions index. Also usable by the Node verification script. */
(function (root) {
  'use strict';
  const recommendation = /推免|免试|保研|夏令营|暑期学校|推荐资格|推荐优秀|预推免|直博|接收优秀应届本科/;
  const examination = /统考|考研|初试|考试科目|考试大纲|参考书|自命题|入学考试|硕士.*招生考试/;
  const examinationStage = /复试|调剂|分数线|报考|报录|准考证|考点|网上确认|现场确认/;
  function routeOf(title) {
    const text = String(title || '');
    const rec = recommendation.test(text), exam = examination.test(text);
    if (rec && exam) return 'shared';
    if (rec) return 'recommendation';
    if (exam || examinationStage.test(text)) return 'examination';
    return 'shared';
  }
  const matches = (route, mode) => route === 'shared' || route === mode;
  const eligible = row => !/校际交换|境外.*交换|赴台交流|交流项目|放假|教学安排|拔尖.*实验班|本科招生|本科生招生|转专业|博士后/.test(row.display_title||row.title||'');
  const normalize = s => String(s || '').replace(/^中国科学院|^中科院/, '').replace(/\s/g, '');
  const keyOf = row => `${row.source_id}|${row.url}`;
  function formatOf(row) {
    const path = String(row.raw_path || row.url || '').replace(/\.download\.txt$/, '').split(/[?#]/)[0];
    const ext = path.split('.').pop().toLowerCase();
    return ext === 'pdf' ? 'PDF' : /^(docx?|rtf)$/.test(ext) ? 'Word' : /^(xlsx?|csv)$/.test(ext) ? 'Excel' : /^(png|jpe?g|gif|webp)$/.test(ext) ? '图片' : row.raw_path&&!/^(html?|mhtml|php|aspx?|jsp)$/.test(ext) ? '其他' : '网页';
  }
  function topicOf(title, kind) {
    if (kind === 'list') return '栏目快照';
    if (/夏令营|暑期学校/.test(title)) return '夏令营';
    if (/推荐资格|名额分配|推免办法/.test(title)) return '推荐资格';
    if (/推免|免试|保研/.test(title)) return '推免接收';
    if (/调剂/.test(title)) return '调剂';
    if (/分数线|复试线|初试.*成绩|考试成绩|成绩查询|成绩复核|报录/.test(title)) return '分数与成绩';
    if (/拟录取|录取名单|复试|体检/.test(title)) return '复试与录取';
    if (/考试大纲|参考书|初试|自命题|考试科目|硕士.*考试|研究生.*考试/.test(title)) return '初试与参考书';
    if (/简章|章程|目录|招生计划/.test(title)) return '简章与目录';
    if (/报名|报考|确认|考点/.test(title)) return '报名与确认';
    return '其他通知';
  }
  function build(raw) {
    const owners = new Map(), sourceById = new Map(raw.sources.map(s => [s.id, s]));
    const aliases = new Map();
    for (const unit of raw.institutions) for (const name of [unit.school, ...(unit.aliases || [])]) aliases.set(normalize(name), unit.id);
    for (const source of raw.sources) {
      const name = normalize(source.name).split(/[·•]/)[0];
      const owner = aliases.get(normalize(source.school)) || aliases.get(name);
      if (owner) owners.set(source.id, owner);
    }
    const rows = new Map(), itemByKey = new Map();
    for (const item of raw.items) {
      itemByKey.set(keyOf(item), item);
      if (item.filing?.relevant && eligible(item)) rows.set(keyOf(item), {key:keyOf(item), item, versions:[]});
    }
    for (const snapshot of raw.snapshots) {
      if (!snapshot.filing?.relevant || snapshot.kind === '异常页面' || !eligible(itemByKey.get(keyOf(snapshot))||snapshot)) continue;
      const key = keyOf(snapshot);
      if (!rows.has(key)) rows.set(key, {key, item:null, versions:[]});
      rows.get(key).versions.push(snapshot);
    }
    const records = [...rows.values()];
    for (const record of records) {
      record.versions.sort((a,b) => String(b.created).localeCompare(String(a.created)) || b.id-a.id);
      const latest = record.versions[0], base = record.item || latest;
      const title = base.display_title || base.title || '未命名资料';
      Object.assign(record, {sourceId:base.source_id, unitId:owners.get(base.source_id), url:base.url, title, filing:base.filing || {}, year:String(base.filing?.year || '待核实'), published:record.item?.published || '', kind:latest?.kind || 'notice', format:formatOf(latest || base)});
      // Prefer the notice's title over an extracted page containing unrelated sidebar links.
      record.route = routeOf(title.slice(0,200));
      if (record.route === 'shared' && (!record.item || record.kind === 'list')) record.route = routeOf(sourceById.get(base.source_id)?.name);
      record.topic = topicOf(title, record.kind);
      record.searchText = `${title} ${record.filing.department || ''} ${record.url}`.toLowerCase();
    }
    records.sort((a,b) => b.published.localeCompare(a.published) || b.versions[0]?.id-a.versions[0]?.id || a.title.localeCompare(b.title,'zh'));
    const recordByKey = new Map(records.map(r => [r.key,r]));
    const views = new Map();
    function view(mode) {
      if (views.has(mode)) return views.get(mode);
      const allowed = row => eligible(row)&&matches(routeOf((row.display_title || row.title || row.name || '').slice(0,200)),mode);
      const snapshots = raw.snapshots.filter(s => {
        const record = recordByKey.get(keyOf(s));
        const notice = itemByKey.get(keyOf(s));
        return record ? matches(record.route,mode) : allowed(notice || s);
      });
      const routeRecords=records.filter(r => matches(r.route,mode));
      const usedSources=new Set(routeRecords.map(r => r.sourceId));
      const scoped = {...raw, sources:raw.sources.filter(s => allowed(s)||usedSources.has(s.id)), items:raw.items.filter(allowed), snapshots,
        notes:raw.notes.filter(n => allowed({title:`${n.title} ${n.category}`})),
        events:raw.events.filter(allowed), resources:raw.resources.filter(allowed),
        portals:(raw.portals||[]).filter(p=>matches(routeOf(p.label),mode)),
        institutions:raw.institutions.map(u => ({...u,entries:(u.entries||[]).filter(e => matches(routeOf(e.label),mode))}))};
      const units = new Map(scoped.institutions.map(u => [u.id,{...u,records:[],sources:[],saved:0,shared:0}]));
      for (const source of scoped.sources) units.get(owners.get(source.id))?.sources.push(source);
      for (const record of records) if (matches(record.route,mode)) {
        const unit = units.get(owners.get(record.sourceId));
        if (unit) { unit.records.push(record); if (record.versions.length) unit.saved++; if (record.route === 'shared') unit.shared++; }
      }
      const updateSources=new Set(scoped.events.filter(e=>e.unread&&!['首次建档','抓取失败'].includes(e.type)).map(e=>e.source_id));
      const result = {data:scoped,units,records:routeRecords,recordByKey,updateSources};
      views.set(mode,result);
      return result;
    }
    return {view, routeOf, records};
  }
  const api = {build,routeOf,matches,topicOf,formatOf};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AdmissionsModel = api;
})(typeof window === 'undefined' ? globalThis : window);
