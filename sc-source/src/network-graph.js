/* Complete public scholar map. No inferred relationships or external dependencies. */
(() => {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const kinds = {doctoral_adviser: '博士导师 → 学生', coauthor: '共同署名', topic_comparison: '建议对照阅读'};
  const initialState = () => ({query: '', type: 'all', selected: '', zoom: 1});
  const keyOf = p => p.person_id.startsWith('ncu-') ? 'ncu' : p.person_id.startsWith('scut-') ? 'scut' : 'other';
  const shortInstitution = p => ({'中国科学院长春应用化学研究所':'长春应化所','亚利桑那州立大学':'亚利桑那州立大学'}[p.institution] || p.institution);

  function layout(data) {
    const nodes = [], groups = [];
    let left = 24, maxRows = 1;
    for (const [key, title, columns] of [['ncu','南昌大学',2],['scut','华南理工大学',3],['other','跨校学术网络',1]]) {
      const people = data.people.filter(p => keyOf(p) === key);
      if (!people.length) continue;
      const cols = Math.min(columns, people.length), rows = Math.ceil(people.length / cols);
      const width = cols * 146 + (cols - 1) * 24 + 40;
      groups.push({key, title, x: left, width, count: people.length});
      people.forEach((person, index) => nodes.push({person, group: key, x: left + 20 + (index % cols) * 170, y: 92 + Math.floor(index / cols) * 94, width: 146, height: 60}));
      left += width + 28;
      maxRows = Math.max(maxRows, rows);
    }
    return {nodes, groups, width: Math.max(240, left - 4), height: maxRows * 94 + 86};
  }

  function view(data, state, options = {}) {
    const geometry = layout(data), byId = new Map(geometry.nodes.map(n => [n.person.person_id, n]));
    const personURL = options.personURL || (id => './network/#person=' + encodeURIComponent(id));
    const relations = data.relations.filter(r => state.type === 'all' || r.type === state.type);
    const query = state.query.trim().toLocaleLowerCase();
    const matches = new Set(data.people.filter(p => [p.name_zh,p.name_en,p.institution,...(p.directions || []).map(d => d.title + ' ' + d.topic_name)].join(' ').toLocaleLowerCase().includes(query)).map(p => p.person_id));
    const selectedRelations = relations.filter(r => r.from_id === state.selected || r.to_id === state.selected);
    const focus = state.selected ? new Set([state.selected,...selectedRelations.flatMap(r => [r.from_id,r.to_id])]) : query ? matches : null;
    const counts = new Map(data.people.map(p => [p.person_id, data.relations.filter(r => r.from_id === p.person_id || r.to_id === p.person_id).length]));
    const backgrounds = geometry.groups.map(g => `<g class="sg-group sg-${g.key}"><rect x="${g.x}" y="20" width="${g.width}" height="${geometry.height - 40}" rx="18"/><text x="${g.x + 20}" y="53">${g.title}<tspan dx="8" class="sg-group-count">${g.count} 人</tspan></text></g>`).join('');
    const edges = relations.map(r => {
      const a = byId.get(r.from_id), b = byId.get(r.to_id);
      if (!a || !b) return '';
      const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2;
      const dim = focus && !(state.selected ? r.from_id === state.selected || r.to_id === state.selected : matches.has(r.from_id) || matches.has(r.to_id));
      // Connections end at the card boundary; arrowheads remain visible outside it.
      const dx = bx - ax, dy = by - ay, trim = Math.min(dx ? (a.width / 2 + 5) / Math.abs(dx) : Infinity, dy ? (a.height / 2 + 5) / Math.abs(dy) : Infinity, .45);
      const sx = ax + dx * trim, sy = ay + dy * trim, tx = bx - dx * trim, ty = by - dy * trim;
      const bend = a.group === b.group ? 30 : 0;
      return `<path class="sg-edge sg-${escape(r.type)}${dim ? ' sg-dim' : ''}" data-relation-id="${escape(r.relation_id)}" d="M${sx} ${sy} Q${(sx + tx) / 2 + bend} ${(sy + ty) / 2 - bend} ${tx} ${ty}"${r.type === 'doctoral_adviser' ? ' marker-end="url(#sg-adviser-arrow)"' : ''}><title>${escape(a.person.name_zh)} → ${escape(b.person.name_zh)}：${escape(kinds[r.type] || r.label)}</title></path>`;
    }).join('');
    const cards = geometry.nodes.map(n => {
      const p = n.person, count = counts.get(p.person_id), selected = state.selected === p.person_id;
      const subtitle = n.group === 'other' ? shortInstitution(p) : count ? count + ' 条关系记录' : '暂未登记关系';
      return `<a href="${escape(personURL(p.person_id))}" data-graph-person="${escape(p.person_id)}" class="sg-node sg-${n.group}${selected ? ' sg-selected' : ''}${focus && !focus.has(p.person_id) ? ' sg-dim' : ''}" aria-label="${escape(p.name_zh)}，${escape(p.institution)}，${count} 条关系，查看关联"${selected ? ' aria-current="true"' : ''}><title>${escape(p.name_zh)} · ${escape(p.institution)}；点击查看关系和档案入口</title><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="12"/><circle cx="${n.x + 16}" cy="${n.y + 22}" r="4"/><text x="${n.x + 29}" y="${n.y + 27}" class="sg-name">${escape(p.name_zh)}</text><text x="${n.x + 16}" y="${n.y + 47}" class="sg-subtitle">${escape(subtitle)}</text></a>`;
    }).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${geometry.width} ${geometry.height}" class="sg-svg" style="width:${state.zoom * 100}%" role="group" aria-label="完整人物关系图，${data.people.length} 位学者，${relations.length} 条连线"><defs><marker id="sg-adviser-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10z" fill="#247d70"/></marker></defs>${backgrounds}${edges}${cards}</svg>`;
    const person = data.people.find(p => p.person_id === state.selected);
    const sources = new Map((data.sources || []).map(s => [s.source_id,s]));
    const detail = person ? `<h3>${escape(person.name_zh)}<small>${escape(person.institution)}</small></h3><a class="sg-profile" href="${escape(personURL(person.person_id))}">打开人物档案 ↗</a><p class="sg-muted">当前类型下 ${selectedRelations.length} 条关系。${state.type === 'all' && !selectedRelations.length ? '暂未登记连线；已保留此人的方向档案。' : ''}</p><ul class="sg-relations">${selectedRelations.map(r => {
      const other = byId.get(r.from_id === person.person_id ? r.to_id : r.from_id)?.person;
      const label = r.type === 'doctoral_adviser' ? (r.from_id === person.person_id ? '博士学生' : '博士导师') : kinds[r.type] || r.label;
      return `<li><span class="sg-kind sg-${escape(r.type)}">${escape(label)}</span> <a href="${escape(personURL(other.person_id))}">${escape(other.name_zh)}</a><p>${escape(r.detail)}</p>${r.snapshot_common_papers != null ? `<p>旧快照共同论文：${r.snapshot_common_papers} 篇</p>` : ''}<div class="sg-sources">${(r.source_ids || []).map(id => { const s = sources.get(id); return s && /^https?:\/\//i.test(s.url) ? `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)} ↗</a>` : ''; }).join('')}</div></li>`;
    }).join('')}</ul><button type="button" data-graph-action="clear">返回全部人物</button>` : '<h3>点选人物，沿关系阅读</h3><p class="sg-muted">点击图中的姓名，查看相关人物、关系说明与原始来源。</p><p class="sg-muted">实线区分博士导师和共同署名，虚线表示建议对照阅读。没有连线的人物仍完整显示。</p>';
    const status = `显示全部 ${data.people.length} 位学者 · ${relations.length} 条连线${query ? (matches.size ? ` · 搜索匹配 ${matches.size} 人` : ' · 没有匹配人物，请调整搜索') : ''}${person ? ' · 已突出 ' + person.name_zh + ' 的关联' : ''}`;
    return {svg, detail, status, geometry, matchCount: matches.size, edgeCount: relations.length};
  }

  function mount(root, data, options = {}) {
    if (!root || !data?.people) return;
    const state = initialState(), personURL = options.personURL || (id => './network/#person=' + encodeURIComponent(id));
    root.classList.add('scholar-graph');
    root.innerHTML = `<div class="sg-toolbar"><label>查找人物<input type="search" data-graph-query placeholder="姓名、学校或研究方向" autocomplete="off"></label><label>连线类型<select data-graph-type><option value="all">全部关系</option>${Object.entries(kinds).map(([id,label]) => `<option value="${id}">${label}</option>`).join('')}</select></label><div class="sg-zoom" role="group" aria-label="关系图缩放"><button type="button" data-graph-action="out" aria-label="缩小关系图">−</button><output data-graph-zoom>100%</output><button type="button" data-graph-action="in" aria-label="放大关系图">＋</button><button type="button" data-graph-action="fit">适应窗口</button><button type="button" data-graph-action="reset">重置</button></div></div><p class="sg-status" data-graph-status role="status" aria-live="polite"></p><div class="sg-legend"><span class="sg-doctoral_adviser">→ 博士导师 → 学生</span><span class="sg-coauthor">━ 共同署名</span><span class="sg-topic_comparison">┄ 建议对照阅读</span></div><p class="sg-hint">小屏可在图内横向滑动；“适应窗口”查看全貌，放大可清晰阅读姓名。</p><div class="sg-layout"><div class="sg-stage" data-graph-stage tabindex="0" role="region" aria-label="可滚动的人物关系图"></div><aside class="sg-detail" data-graph-detail aria-label="人物关联详情"></aside></div><details class="sg-roster"><summary>完整人物名单（${data.people.length} 位）</summary><ul>${data.people.map(p => `<li><a href="${escape(personURL(p.person_id))}">${escape(p.name_zh)}</a><small>${escape(p.institution)}</small></li>`).join('')}</ul></details><p class="sg-boundary">关系与来源快照：${escape(data.as_of || '')}。建议对照阅读属于学习路径，不证明实际合作；未登记连线不代表没有学术关系。</p>`;
    const stage = root.querySelector('[data-graph-stage]');
    function draw() {
      const result = view(data, state, options);
      stage.innerHTML = result.svg;
      root.querySelector('[data-graph-detail]').innerHTML = result.detail;
      root.querySelector('[data-graph-status]').textContent = result.status;
      root.querySelector('[data-graph-zoom]').textContent = Math.round(state.zoom * 100) + '%';
      root.querySelector('[data-graph-action="out"]').disabled = state.zoom <= 1;
      root.querySelector('[data-graph-action="in"]').disabled = state.zoom >= 2.5;
    }
    root.addEventListener('input', event => {
      if (!event.target.matches('[data-graph-query]')) return;
      state.query = event.target.value; state.selected = ''; draw();
    });
    root.addEventListener('change', event => {
      if (!event.target.matches('[data-graph-type]')) return;
      state.type = event.target.value; draw();
    });
    root.addEventListener('click', event => {
      const node = event.target.closest('[data-graph-person]');
      if (node && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); state.selected = node.dataset.graphPerson; state.query = '';
        root.querySelector('[data-graph-query]').value = ''; draw();
        const replacement = stage.querySelector(`[data-graph-person="${state.selected}"]`);
        replacement?.focus({preventScroll: true});
        return;
      }
      const action = event.target.closest('[data-graph-action]')?.dataset.graphAction;
      if (!action) return;
      if (action === 'in') { state.zoom = Math.min(2.5, state.zoom + .25); stage.classList.remove('sg-fit'); }
      if (action === 'out') state.zoom = Math.max(1, state.zoom - .25);
      if (action === 'fit') { state.zoom = 1; stage.classList.add('sg-fit'); }
      if (action === 'clear') state.selected = '';
      if (action === 'reset') {
        Object.assign(state, initialState()); stage.classList.remove('sg-fit');
        root.querySelector('[data-graph-query]').value = ''; root.querySelector('[data-graph-type]').value = 'all';
      }
      draw();
      if (action === 'reset' || action === 'fit') { stage.scrollLeft = 0; stage.scrollTop = 0; }
    });
    draw();
  }
  globalThis.SCNetworkGraph = {layout, view, mount, initialState};
})();
