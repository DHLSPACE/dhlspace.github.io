/* SC: dependency-free public research snapshot; personal reading state stays local. */
(() => {
  'use strict';
  const D = globalThis.SC_DATA;
  const main = document.querySelector('#main');
  if (!D || D.papers.length !== D.counts.uniquePapers) {
    main.innerHTML = '<div class="empty"><h2>档案暂时未能完整载入</h2><p>请刷新页面，或从来源页的下载目录读取资料。</p><a class="secondary-button" href="./downloads/hongwei/人物研究与阅读建议.md">下载人物介绍</a></div>';
    return;
  }
  const $ = (s, root = document) => root.querySelector(s);
  const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeURL = value => /^https?:\/\//i.test(value || '') ? e(value) : '#';
  const scholars = Object.fromEntries(D.scholars.map(s => [s.id, s]));
  const papers = new Map(D.papers.map(p => [p.id, p]));
  const grades = {A: '官方代表作', B: 'ORCID 与单位支持', C: '待原文复核'};
  const statusLabels = ['未开始', '正在阅读', '已读完'];
  const STORE = 'sc-reading-v1';
  let notes = Object.create(null), storageAvailable = true;
  try { notes = validateNotes(JSON.parse(localStorage.getItem(STORE) || '{}')); } catch { storageAvailable = false; }
  let route, library = {}, page = 1, lastResults = [], activePair = '', lastFocus;
  let toastTimer;
  const authorCache = new Map();
  const paths = {
    overview: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3.5-5.5"/>',
    papers: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h6"/>',
    reading: '<path d="M12 5C9 3 5 3 2 5v15c3-2 7-2 10 0 3-2 7-2 10 0V5c-3-2-7-2-10 0zM12 5v15"/>',
    network: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10.5 7.5-4 9m7-9 4 9M8 19h8"/>',
    sources: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
    github: '<path d="M9 19c-4.5 1.4-4.5-2.5-6-3M15 22v-4c.1-1.1-.4-2.1-1-2.5 3.3-.4 6.8-1.6 6.8-7.1a5.5 5.5 0 0 0-1.5-3.8c.2-1 .2-2-.2-3.1 0 0-1.2-.4-4 1.5a14 14 0 0 0-7.2 0C5.1 1.1 3.9 1.5 3.9 1.5c-.4 1.1-.4 2.1-.2 3.1a5.5 5.5 0 0 0-1.5 3.8c0 5.5 3.5 6.7 6.8 7.1-.6.5-1.1 1.5-1 2.5v4"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.papers}</svg>`;
  const navItems = [['overview', '/', '研究总览', ''], ['people', '/people', '人物档案', String(D.counts.scholars).padStart(2, '0')], ['papers', '/papers', '论文文库', D.counts.uniquePapers], ['network', '/network', '研究关联', ''], ['reading', '/reading', '阅读工作台', D.counts.reading], ['sources', '/sources', '来源与数据', '']];

  function validateNotes(input) {
    const result = Object.create(null);
    if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
    for (const [key, value] of Object.entries(input)) {
      if (!papers.has(key) || !value || typeof value !== 'object') continue;
      result[key] = {saved: value.saved === true, status: statusLabels.includes(value.status) ? value.status : '未开始', note: typeof value.note === 'string' ? value.note.slice(0, 50000) : '', updated: typeof value.updated === 'string' ? value.updated.slice(0, 40) : ''};
    }
    return result;
  }

  function toast(message) {
    $('#toast').textContent = message;
    $('#toast').classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 3000);
  }

  function saveNote(id, patch) {
    notes[id] = {...{saved: false, status: '未开始', note: ''}, ...notes[id], ...patch, updated: new Date().toISOString()};
    try { localStorage.setItem(STORE, JSON.stringify(notes)); storageAvailable = true; }
    catch { storageAvailable = false; toast('当前浏览器无法保存，请及时导出阅读记录。'); }
  }

  function external(url, label, cls = 'source-link') {
    return `<a class="${cls}" href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>`;
  }

  function stat(value, label, subtitle) {
    return `<div class="stat"><strong>${value}</strong><span>${label}<small>${subtitle}</small></span></div>`;
  }

  function evidenceBars(s = D.counts) {
    const total = Object.values(s.evidence).reduce((a, b) => a + b, 0);
    return `<div class="evidence-bars" aria-label="A 类 ${s.evidence.A} 条，B 类 ${s.evidence.B} 条，C 类 ${s.evidence.C} 条">${'ABC'.split('').map(g => `<span style="width:${s.evidence[g] / total * 100}%"></span>`).join('')}</div>${'ABC'.split('').map((g, idx) => `<div class="evidence-row"><i class="evidence-dot" style="background:${['#679c8f', '#7d9db9', '#c5b59e'][idx]}"></i><span>${g} · ${grades[g]}</span><span>${s.evidence[g]}</span></div>`).join('')}`;
  }

  function cardArt(index) {
    const drawings = [
      '<g fill="none" stroke="currentColor" stroke-width=".7"><ellipse cx="77" cy="54" rx="65" ry="18" transform="rotate(-30 77 54)"/><ellipse cx="77" cy="54" rx="65" ry="18" transform="rotate(30 77 54)"/><ellipse cx="77" cy="54" rx="65" ry="18" transform="rotate(90 77 54)"/></g><g fill="currentColor"><circle cx="77" cy="54" r="5"/><circle cx="110" cy="24" r="4"/><circle cx="25" cy="47" r="3"/></g>',
      '<g fill="none" stroke="currentColor" stroke-width=".7"><path d="m35 20 35-20 35 20v40L70 80 35 60zm35-20v40m35-20L70 40 35 20m35 20v40M70 40l35 20M70 40 35 60M105 20l35-20v40l-35 20M105 20l35 20M35 60 0 80V40l35-20M0 40l35 20"/></g><g fill="currentColor"><circle cx="70" cy="40" r="4"/><circle cx="105" cy="20" r="3"/><circle cx="35" cy="60" r="3"/></g>',
      '<g stroke="currentColor" stroke-width="1" fill="none"><path d="m25 40 25-14 25 14v29L50 83 25 69zm50 0 26-15 24 15v29l-25 14-25-14M50 26V8m75 32 19-11M25 69 6 79M100 83v17"/><path d="m31 44 19-11 19 11M81 44l20-12 18 12M31 65l19 11 19-11"/></g><g fill="currentColor"><circle cx="50" cy="8" r="4"/><circle cx="144" cy="29" r="4"/><circle cx="6" cy="79" r="3"/></g>'
    ];
    return `<svg viewBox="0 0 150 110" style="color:var(--tone)" aria-hidden="true">${drawings[index] || drawings[0]}</svg>`;
  }

  function scholarCard(s, index) {
    return `<a href="#/people/${s.id}" class="scholar-card glass ${s.color}" aria-label="查看${s.name}的系统研究档案"><div class="card-art"><span class="card-number">RESEARCHER / 0${index + 1}</span>${cardArt(index)}<span class="card-avatar">${s.initial}</span></div><div class="card-body"><div class="card-name"><h3>${s.name}</h3><span>${s.en}</span></div><p class="card-field">${s.field}</p><p class="card-summary">${s.question}。<br>研究快照 · ${s.first_date.slice(0, 4)}—2026</p><div class="chips">${s.tags.map(t => `<span class="chip">${t}</span>`).join('')}</div><div class="card-meta"><span><strong>${s.papers}</strong>条论文记录</span><span><strong>${s.first_author}</strong>条排名第一</span><span class="arrow">↗</span></div></div></a>`;
  }

  function orbital() {
    return `<div class="orbital" aria-hidden="true"><div class="orbital-glow"></div><svg viewBox="0 0 360 300"><defs><radialGradient id="coreGradient" cx=".3" cy=".25"><stop stop-color="#fff"/><stop offset=".3" stop-color="#eff8fb" stop-opacity=".75"/><stop offset=".72" stop-color="#a1c7d8" stop-opacity=".6"/><stop offset="1" stop-color="#6897ad" stop-opacity=".3"/></radialGradient><radialGradient id="satGradient" cx=".3" cy=".2"><stop stop-color="#fff"/><stop offset="1" stop-color="#9bc3d3"/></radialGradient></defs><ellipse class="orbit" cx="180" cy="150" rx="148" ry="49" transform="rotate(-28 180 150)"/><ellipse class="orbit" cx="180" cy="150" rx="148" ry="49" transform="rotate(35 180 150)"/><ellipse class="orbit" cx="180" cy="150" rx="133" ry="50" transform="rotate(91 180 150)"/><circle class="core" cx="180" cy="150" r="53"/><circle class="satellite" cx="287" cy="91" r="13" fill="url(#satGradient)"/><circle class="satellite" cx="91" cy="197" r="10" fill="#b8d8cd"/><circle class="satellite" cx="172" cy="38" r="9" fill="#d0c5df"/><circle cx="238" cy="225" r="3" fill="#afc8d5"/><circle cx="65" cy="116" r="3" fill="#b5ccd7"/><path d="M172 38 287 91 238 225 91 197 65 116Z" fill="none" stroke="#bdcfd8" stroke-width=".6" stroke-dasharray="2 5"/><text x="180" y="151" text-anchor="middle" font-family="Georgia,serif" font-size="27" fill="#5d8296" opacity=".7">sc.</text><text x="180" y="168" text-anchor="middle" font-family="sans-serif" font-size="5.5" letter-spacing="2.3" fill="#7191a2">CONNECT THE DOTS</text></svg><span class="orbital-label one">研究者 / PEOPLE</span><span class="orbital-label two">论文 / EVIDENCE</span><span class="orbital-label three">脉络 / CONNECTIONS</span></div>`;
  }

  function overview() {
    return `<section class="hero"><div class="hero-copy"><div class="eyebrow">A personal research library</div><h1>循着论文，<br><em>理解研究的人。</em></h1><p>从一位研究者的经历出发，连接论文、方法与问题。<br>把零散的资料，整理成可以持续生长的知识。</p><div class="hero-actions"><a class="primary-button" href="#/people">进入人物档案 <span>↗</span></a><a class="text-link" href="#/reading">从 ${D.counts.reading} 篇论文开始 <span>→</span></a></div></div>${orbital()}<span class="hero-stamp">NANCHANG UNIVERSITY · RESEARCH NOTES</span></section><section class="stat-strip" aria-label="知识库统计">${stat(String(D.counts.scholars).padStart(2, '0'), '当前研究对象', 'RESEARCHERS')}${stat(D.counts.uniquePapers, '去重论文', 'UNIQUE DOI')}${stat(D.counts.records, '人物论文记录', 'ARCHIVE RECORDS')}${stat(D.counts.reading, '首轮阅读入口', 'READING QUEUE')}</section><section><div class="section-heading"><div><h2>正在了解的研究者 <span>PEOPLE IN FOCUS</span></h2><p>四条研究路径，从学术经历到具体的科学问题。</p></div><a class="text-link" href="#/people">全部档案 <span>↗</span></a></div><div class="scholar-grid">${D.scholars.map(scholarCard).join('')}</div></section><div class="bottom-grid"><section class="panel glass"><div class="panel-heading"><h2>从哪里开始<small>A SMALL, STEADY READING PATH</small></h2>${icon('reading')}</div><a class="start-step" href="#/people"><span class="step-number">01</span><div><h3>先了解人，再展开论文</h3><p>沿教育与任职时间线，读懂研究问题如何形成。</p></div><span>↗</span></a><a class="start-step" href="#/reading"><span class="step-number">02</span><div><h3>每人五篇，建立第一张地图</h3><p>带着核心问题阅读，记录方法、对照与证据。</p></div><span>↗</span></a><a class="start-step" href="#/network"><span class="step-number">03</span><div><h3>顺着共同论文，发现研究关联</h3><p>从 DOI 交集走向具体论文，逐步扩展阅读。</p></div><span>↗</span></a></section><section class="panel glass"><div class="panel-heading"><h2>每条记录，都保留证据<small>归属证据 · 按人物记录统计</small></h2><a href="#/sources" aria-label="查看证据口径">↗</a></div>${evidenceBars()}<p class="evidence-note">A / B 是论文归属的支持证据；实验方法、贡献声明仍需读原文。C 类保留待核状态。当前清单是一份研究快照。</p></section></div>`;
  }

  function pageHead(kicker, title, description) {
    return `<div class="page-head"><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${description}</p></div>`;
  }

  function peoplePage() {
    return `${pageHead('People / 01—' + String(D.counts.scholars).padStart(2, '0'), '人物研究档案', '从已核实的教育与任职出发，理解研究方向的演变，再进入代表论文与方法。人物姓名以官方资料为准。')}<div class="scholar-grid">${D.scholars.map(scholarCard).join('')}</div><div class="section-heading"><div><h2>四条路径，四组问题</h2><p>以下为依据现有履历与论文的阅读分析。</p></div></div><div class="method-grid">${D.scholars.map(s => `<article class="panel glass"><div class="eyebrow">${s.en}</div><h3 style="margin-top:12px">${s.name} · ${s.field}</h3><p>${e(s.intro)}</p><a class="text-link" style="margin-top:15px" href="#/people/${s.id}">展开系统介绍 →</a></article>`).join('')}<article class="panel glass"><div class="eyebrow">How to read</div><h3 style="margin-top:12px">把研究主线与合作支线分开</h3><p>论文署名可以连接研究者，具体职责仍需贡献声明。经历与论文按各自的时间口径保留，不用发表年份补写任职日期。</p><a class="text-link" style="margin-top:15px" href="#/network">探索论文之间的关联 →</a></article></div>`;
  }

  function profilePage(s, tab = 'overview') {
    const tabs = [['overview', '研究概览'], ['career', '教育与任职'], ['papers', '论文'], ['people', '合作与人物'], ['sources', '来源']];
    if (!tabs.some(t => t[0] === tab)) tab = 'overview';
    const header = `<section class="profile-hero glass ${s.color}"><span class="profile-avatar" aria-hidden="true">${s.initial}</span><div><h1>${s.name}</h1><div class="profile-en">${s.en}</div><p>${s.field}</p></div><div class="head-actions">${external(s.official, '学院主页', 'secondary-button')}<a class="secondary-button" href="#/reading?person=${s.id}">首轮五篇 →</a></div></section><nav class="profile-tabs" aria-label="${s.name}档案栏目">${tabs.map(([id, label]) => `<a class="${tab === id ? 'active' : ''}" ${tab === id ? 'aria-current="page"' : ''} href="#/people/${s.id}/${id}">${label}</a>`).join('')}</nav>`;
    if (tab === 'papers') return header + libraryPage(s, true);
    if (tab === 'sources') return header + profileSources(s);
    if (tab === 'people') return header + `<div class="notice">共同署名记录用于发现阅读入口。人物关系按独立证据记录，尚未完成全部共同作者的身份消歧。</div><div class="section-heading"><h2>值得继续了解的人</h2></div><div class="people-list">${s.people.map(personCard).join('')}</div><div class="section-heading"><h2>共同作者频次 <span>本次清单前 12 位</span></h2></div><div class="panel glass profile-network">${s.network.slice(0, 12).map(n => `<div class="coauthor-row"><div>${e(n['作者姓名_未全部消歧'])}<p>${e(n['最早排序日期'])} — ${e(n['最近排序日期'])}</p></div><strong>${n['共同论文数_本次清单']}</strong></div>`).join('')}<p class="evidence-note">全部共同作者与 DOI 对应关系可在来源页下载。频次按当前人物清单计算。</p></div>`;
    if (tab === 'career') return header + `<div class="profile-layout"><div class="panel glass"><div class="panel-heading"><h2>教育、任职与教学</h2><small>保留来源精度与差异</small></div><div class="prose">${s.careerNotes || ''}</div><div class="bio-timeline">${s.bio.map(b => `<article class="bio-item"><div class="bio-date">${e(b['开始时间'] || '时间未公开')}${b['结束时间'] && b['结束时间'] !== b['开始时间'] ? ' — ' + e(b['结束时间']) : ''}</div><h3>${e(b['机构'])} · ${e(b['身份或活动'])}</h3>${b['已核导师'] ? `<p>已核导师：${e(b['已核导师'])}</p>` : ''}<p>${e(b['已核实信息'])}</p>${b['来源差异或未知'] ? `<p class="difference">${e(b['来源差异或未知'])}</p>` : ''}${splitLinks(b['来源链接'], '经历来源')}</article>`).join('')}</div></div>${profileSide(s)}</div>`;
    return header + `<div class="profile-layout"><div class="profile-content"><section class="panel glass"><div class="panel-heading"><h2>先理解这个人</h2><small>研究主线与阅读问题</small></div><p class="profile-intro">${e(s.intro)}</p></section><section class="panel glass"><div class="panel-heading"><h2>研究方向如何演变</h2><small>依据履历与本次论文的分析</small></div><div class="prose">${s.sections['研究方向随经历的变化']}</div></section><section class="panel glass"><div class="panel-heading"><h2>实验与方法：已有证据</h2></div><div class="prose">${s.sections['实验经历应怎样理解']}</div></section><section class="panel glass"><div class="panel-heading"><h2>消歧与来源差异</h2></div><div class="prose">${s.sections['数据消歧与来源差异']}</div></section></div>${profileSide(s)}</div>`;
  }

  function profileSide(s) {
    return `<aside class="profile-side"><section class="panel glass"><h3>档案一览</h3><div class="side-stat"><span>人物论文记录</span><strong>${s.papers}</strong></div><div class="side-stat"><span>署名排名第一</span><strong>${s.first_author}</strong></div><div class="side-stat"><span>首轮阅读</span><strong>05</strong></div><p>${s.first_date} — ${s.last_date}<br>快照日期 ${s.as_of}</p></section><section class="panel glass"><h3>归属证据</h3>${evidenceBars(s)}<p>清单包含 C 类候选。A/B 仍需核对具体实验与贡献。</p></section><section class="panel glass"><h3>继续阅读</h3><p>从五篇稳定的起步队列开始，记录研究问题与方法证据。</p><a class="text-link" style="margin-top:13px" href="#/reading?person=${s.id}">打开阅读工作台 →</a></section><section class="panel glass"><h3>留一份资料</h3><p>完整介绍与数据表可独立阅读。</p><a class="source-link" href="./${e(s.reportHref)}" download>下载人物介绍 ↓</a><br><a class="source-link" href="./${e(s.templateHref)}" download>下载精读模板 ↓</a></section></aside>`;
  }

  function splitLinks(value, label) {
    return [...new Set((value || '').split(/\s+\|\s+|\s+\/\s+|；/).filter(v => /^https?:\/\//.test(v)))].map((url, i) => external(url.trim(), label + (i ? ' ' + (i + 1) : ''))).join(' ');
  }

  function personCard(p) {
    return `<article class="person-panel panel glass"><h3>${e(p['人物姓名'])} <small style="font:10px Georgia,serif;color:var(--muted)">${e(p['英文名'])}</small></h3><span class="role">${e(p['关系类型'])}</span><p>${e(p['值得了解的原因'])}</p><p class="unknown">${e(p['仍未知或不应推断'])}</p>${splitLinks(p['证据链接'], '关系证据')}</article>`;
  }

  function option(value, label, selected) { return `<option value="${e(value)}" ${value === selected ? 'selected' : ''}>${e(label)}</option>`; }
  function initLibrary(s) {
    library = {q: route.params.get('q') || '', person: s?.id || route.params.get('person') || '', year: route.params.get('year') || '', grade: route.params.get('grade') || '', theme: route.params.get('theme') || '', first: route.params.get('first') === '1', saved: route.params.get('saved') === '1', sort: route.params.get('sort') || 'new'};
    page = 1;
  }

  function libraryPage(s, embedded = false) {
    initLibrary(s);
    const years = [...new Set(D.papers.flatMap(p => Object.values(p.records).map(r => r['排序年份'])))].sort().reverse();
    const themes = [...new Set(D.papers.flatMap(p => Object.values(p.records).map(r => r['研究主题_题名规则分类'])))].sort();
    return `${embedded ? '' : pageHead('The literature collection', '论文文库', '把论文放回人物与时间中。搜索中英文题名、作者、DOI，按研究方向与证据层次逐步缩小范围。')}<div class="notice">${s ? `${s.name}清单 ${s.papers} 条，其中 ${s.first_author} 条署名排名第一。` : `${D.counts.records} 条人物论文记录，合并为 ${D.counts.uniquePapers} 个 DOI；同一篇论文可关联多位研究者。`}“排名第一”按署名顺序统计，共同一作与通讯作者须另查原文。</div><form class="filter-panel glass" id="library-filters" role="search"><label class="filter-search">${icon('search')}<span class="sr-only">搜索论文</span><input name="q" type="search" placeholder="题名、关键词、作者、DOI…" value="${e(library.q)}" autocomplete="off"></label><div class="filters">${s ? `<input name="person" type="hidden" value="${s.id}">` : `<label class="sr-only" for="person-filter">研究者</label><select name="person" id="person-filter">${option('', '全部研究者', library.person)}${D.scholars.map(v => option(v.id, v.name, library.person)).join('')}</select>`}<label class="sr-only" for="year-filter">年份</label><select name="year" id="year-filter">${option('', '全部年份', library.year)}${years.map(y => option(y, y, library.year)).join('')}</select><label class="sr-only" for="grade-filter">证据层次</label><select name="grade" id="grade-filter">${option('', '全部归属证据', library.grade)}${'ABC'.split('').map(g => option(g, g + ' · ' + grades[g], library.grade)).join('')}</select><label class="sr-only" for="theme-filter">研究主题</label><select name="theme" id="theme-filter">${option('', '全部研究主题', library.theme)}${themes.map(t => option(t, t, library.theme)).join('')}</select><label class="sr-only" for="sort-filter">排列方式</label><select name="sort" id="sort-filter">${option('new', '时间 · 从新到旧', library.sort)}${option('old', '时间 · 从旧到新', library.sort)}</select><label class="toggle-filter"><input name="first" type="checkbox" ${library.first ? 'checked' : ''}>署名排名第一</label><label class="toggle-filter"><input name="saved" type="checkbox" ${library.saved ? 'checked' : ''}>我的收藏</label><button type="button" class="filter-reset" data-action="reset-filters">重置筛选 ↺</button></div></form><div id="paper-results" aria-live="polite"></div>`;
  }

  function relevantRecords(p) {
    return Object.entries(p.records).filter(([id]) => !library.person || id === library.person);
  }
  function selectedRecord(p) { return p.records[library.person] || Object.values(p.records)[0]; }
  function filterPapers() {
    const q = library.q.trim().toLowerCase();
    return D.papers.filter(p => {
      const matches = relevantRecords(p).some(([, r]) => (!library.year || r['排序年份'] === library.year) && (!library.grade || r['归属证据'].startsWith(library.grade)) && (!library.first || r['是否排名第一'] === '是') && (!library.theme || r['研究主题_题名规则分类'] === library.theme));
      return matches && (!library.saved || notes[p.id]?.saved) && (!q || [p.zh, p.title, p.authors, p.doi, p.journal, ...p.members.map(id => scholars[id].name), ...Object.values(p.records).map(r => r['研究主题_题名规则分类'])].join(' ').toLowerCase().includes(q));
    }).sort((a, b) => {
      const cmp = selectedRecord(a)['排序日期'].localeCompare(selectedRecord(b)['排序日期']);
      return (library.sort === 'old' ? cmp : -cmp) || a.title.localeCompare(b.title);
    });
  }

  function paperRow(p, forcedPerson = '') {
    const r = p.records[forcedPerson] || p.records[library.person] || Object.values(p.records)[0];
    const saved = notes[p.id]?.saved;
    return `<article class="paper-row"><div class="paper-year">${e(r['排序年份'])}<span class="paper-date">${e(r['排序日期'])}</span></div><div class="paper-body"><button type="button" class="paper-title" data-action="open-paper" data-id="${e(p.id)}">${e(p.zh || p.title)}</button><p class="paper-english" lang="en">${e(p.title)}</p><div class="paper-meta"><span class="journal">${e(p.journal)}</span><span>·</span><span>${e(p.doi)}</span></div><div class="paper-people">${p.members.map(id => { const rec = p.records[id]; const g = rec['归属证据'][0]; return `<a class="person-pill ${scholars[id].color}" href="#/people/${id}">${scholars[id].name}${rec['是否排名第一'] === '是' ? ' · 排名第一' : ''}</a><span class="grade grade-${g}" title="${e(rec['归属证据'])}">${g} · ${grades[g]}</span>`; }).join('')}${notes[p.id]?.status && notes[p.id].status !== '未开始' ? `<span class="chip">${e(notes[p.id].status)}</span>` : ''}</div></div><button type="button" class="bookmark ${saved ? 'saved' : ''}" aria-pressed="${!!saved}" aria-label="${saved ? '取消收藏' : '收藏'}：${e(p.zh || p.title)}" data-action="bookmark" data-id="${e(p.id)}">${icon('bookmark')}</button></article>`;
  }

  function renderResults() {
    const container = $('#paper-results');
    if (!container) return;
    lastResults = filterPapers();
    const pages = Math.max(1, Math.ceil(lastResults.length / 15));
    page = Math.min(page, pages);
    container.innerHTML = `<div class="results-heading"><strong>${lastResults.length} 篇论文</strong><span>· ${library.person ? scholars[library.person]?.name || '' : '按 DOI 去重'} · ${library.sort === 'old' ? '时间正序' : '时间倒序'}</span><button class="secondary-button" data-action="export-papers" type="button">导出结果 CSV ↓</button></div>${lastResults.length ? `<div class="paper-list">${lastResults.slice((page - 1) * 15, page * 15).map(p => paperRow(p)).join('')}</div><div class="pagination"><button type="button" data-action="page-prev" ${page === 1 ? 'disabled' : ''}>← 上一页</button><span>第 ${page} / ${pages} 页</span><button type="button" data-action="page-next" ${page === pages ? 'disabled' : ''}>下一页 →</button></div>` : '<div class="empty"><h2>这个范围还没有论文</h2><p>可以调整关键词，或重置年份、证据与收藏筛选。</p><button class="secondary-button" style="margin-top:15px" data-action="reset-filters">重置筛选</button></div>'}`;
  }

  function updateLibraryURL() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(library)) if (value && !(key === 'sort' && value === 'new')) params.set(key, value === true ? '1' : value);
    const prefix = route.path.startsWith('/people/') ? route.path : '/papers';
    history.replaceState(null, '', '#' + prefix + (params.size ? '?' + params : ''));
  }

  function readingPage() {
    const person = route.params.get('person');
    const chosen = person && scholars[person] ? D.scholars.filter(s => s.id === person) : D.scholars;
    return `${pageHead('A small, steady reading queue', '阅读工作台', '每人先读五篇，带着问题进入正文与补充信息。这里的实验关注点是阅读建议，来源读取深度单独保留。')}<div class="reading-toolbar"><p>${storageAvailable ? '阅读记录只保存在当前浏览器；导出后可迁移到其他设备。' : '当前浏览器无法持久保存，请及时导出阅读记录。'}</p><button class="secondary-button" data-action="export-notes">导出阅读记录 ↓</button><label class="secondary-button" for="import-notes">导入记录 ↑</label><input class="sr-only" type="file" id="import-notes" accept=".json,application/json"></div><div class="profile-tabs" aria-label="按研究者查看阅读队列"><a class="${!person ? 'active' : ''}" href="#/reading">全部</a>${D.scholars.map(s => `<a class="${person === s.id ? 'active' : ''}" href="#/reading?person=${s.id}">${s.name}</a>`).join('')}</div>${chosen.map(s => {
      const done = s.reading.filter(r => notes[r.DOI.toLowerCase()]?.status === '已读完').length;
      return `<section class="reading-group ${s.color}"><div class="reading-group-head"><span class="mini-dot"></span><a href="#/people/${s.id}"><h2>${s.name}</h2></a><p>${s.field} · 已完成 ${done} / 5</p><div class="read-progress" role="progressbar" aria-label="${s.name}阅读进度" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="5"><span style="width:${done * 20}%"></span></div></div>${s.reading.map((r, idx) => `<article class="reading-card glass"><span class="reading-index">0${idx + 1}</span><div><h3><button data-action="open-paper" data-id="${e(r.DOI.toLowerCase())}">${e(r['中文题名_辅助译名'])}</button></h3><p class="reading-detail">${e(r['排序日期'])} · ${e(r['期刊或来源'])}</p><p class="reading-detail">${e(r['为什么先读'])}</p><p class="reading-question">${e(r['核心阅读问题'])}</p><p class="reading-detail"><strong>实验与评价</strong> · ${e(r['建议关注的实验与评价_非个人操作证明'])}</p><p class="reading-depth">读取深度 · ${e(r['本次来源阅读深度'])}</p></div><div><label class="sr-only" for="status-${s.id}-${idx}">阅读状态：${e(r['中文题名_辅助译名'])}</label><select class="status-select" id="status-${s.id}-${idx}" data-note-status="${e(r.DOI.toLowerCase())}">${statusLabels.map(v => option(v, v, notes[r.DOI.toLowerCase()]?.status || '未开始')).join('')}</select><button class="source-link" style="background:none;padding:0" data-action="open-paper" data-id="${e(r.DOI.toLowerCase())}">论文与笔记 ↗</button></div></article>`).join('')}</section>`;
    }).join('')}`;
  }

  function sourceList(s) {
    return `<ul class="source-list">${s.sources.map(v => `<li>${/\{/.test(v.URL) ? `<span>${e(v['来源名称'])} · 按篇查阅</span>` : external(v.URL, v['来源名称'], '')}<p>${e(v['支持信息与读取边界'])}</p></li>`).join('')}</ul>`;
  }
  function downloads(s) {
    return `<div class="download-list">${s.downloads.map(v => `<a href="./${e(v.href)}" download><span>${e(v.name.replace(/^\d+_/, ''))}</span><span>${v.rows} 行 ↓</span></a>`).join('')}</div><div class="head-actions"><a class="secondary-button" href="./${e(s.reportHref)}" download>人物介绍 ${s.reportFormat || 'Markdown'} ↓</a><a class="secondary-button" href="./${e(s.templateHref)}" download>精读模板 ↓</a></div>`;
  }
  function profileSources(s) {
    return `<div class="method-grid"><section class="panel glass"><div class="panel-heading"><h2>来源索引</h2><small>核验日期 ${s.as_of}</small></div>${sourceList(s)}</section><section class="panel glass"><div class="panel-heading"><h2>研究数据下载</h2></div><p class="archive-count">${s.downloads.length} 张 UTF-8 数据表 · 公开版省略个人阅读字段</p>${downloads(s)}</section></div>`;
  }
  function sourcesPage() {
    return `${pageHead('Sources, scope & provenance', '来源与数据', '知识库以本地整理档案为基础。官方履历、出版社信息与作者数据库分别保留来源和读取边界，网站整理日期为 2026 年 10 月 21 日，各人物保留原档核验日期。')}<div class="notice">当前范围为洪卫、王珺、曾小军、邓强四位老师。前三位原档核验日期为 2026-10-21，邓强原档为 2026-10-20。原始 CSV 与核验缓存继续保留在本地。</div><div class="head-actions"><a class="secondary-button" href="./downloads/research-data.json" download>全部公开数据 JSON ↓</a><a class="secondary-button" href="./downloads/provenance.json" download>来源校验清单 ↓</a><a class="secondary-button" href="./downloads/共同论文线索.csv" download>共同论文线索 CSV ↓</a><a class="secondary-button" href="https://github.com/DHLSPACE/dhlspace.github.io/tree/main/public/sc" target="_blank" rel="noopener noreferrer">GitHub 源文件 ↗</a></div><div class="method-grid"><article class="panel glass"><h3>01 · 论文归属分级</h3><p>A：官方页面所列代表作已与论文匹配。B：逐篇 Crossref ORCID 与署名单位支持。C：本人署名单位或合作链支持，仍待原文复核。邓强原档中9条仅Crossref单位支持的记录也保守归入C，逐篇保留原有证据说明。全库计数为 ${D.counts.uniquePapers} 个 DOI；分级与排名第一计数采用 ${D.counts.records} 条人物记录。</p></article><article class="panel glass"><h3>02 · 日期与作者角色</h3><p>优先保留可核实的在线日期；仅知年、月时保留原精度。同年信息不全记录的排列不表示精确先后。署名排名第一不等于唯一第一作者，末位署名不自动等于通讯作者。</p></article><article class="panel glass"><h3>03 · 实验与个人贡献</h3><p>介绍中的实验内容注明已读取的摘要、正文或报道层次。团队论文无法单独证明某位作者的个人操作、项目职责或仪器经验；阅读队列中待核的全文与 SI 仍保留待核。</p></article><article class="panel glass"><h3>04 · 阅读记录与持续更新</h3><p>公开数据与个人笔记各自保存。网页笔记位于当前浏览器，可导出和导入；清除浏览器数据会移除本地记录。下载表省略个人笔记、阅读日期与本地 PDF 路径。新的文献须经消歧后更新快照。</p></article></div><div class="section-heading"><div><h2>四位研究者的完整资料</h2><p>数据表保留 DOI、作者顺序、ORCID、来源与待核状态。</p></div></div><div class="source-columns">${D.scholars.map(s => `<section class="panel glass ${s.color}"><div class="panel-heading"><h2>${s.name}</h2><a class="text-link" href="#/people/${s.id}">人物档案 ↗</a></div><h3 style="font-size:11px;margin-top:20px">公开来源</h3>${sourceList(s)}<h3 style="font-size:11px;margin:22px 0 13px">${s.downloads.length} 张研究数据表</h3>${downloads(s)}</section>`).join('')}</div>`;
  }

  function networkPage() {
    const pairs = new Map();
    for (const row of D.cross) {
      const key = row['人物甲'] + ' / ' + row['人物乙'];
      if (!pairs.has(key)) pairs.set(key, []);
      pairs.get(key).push(row);
    }
    if (!pairs.has(activePair)) activePair = pairs.keys().next().value;
    const current = pairs.get(activePair) || [];
    const positions = {wangqun:[130,100,'#d4e9e1'],hongwei:[330,105,'#d5e6f1'],dengqiang:[220,245,'#efe4ce'],zengxiaojun:[455,245,'#e5def1']};
    const edges = [...pairs.values()].map(rows => {
      const row = rows[0], left = positions[row['人物甲ID']], right = positions[row['人物乙ID']];
      if (!left || !right) return '';
      const midX = (left[0]+right[0])/2, midY = (left[1]+right[1])/2-12;
      return `<path d="M${left[0]} ${left[1]} ${right[0]} ${right[1]}" stroke="url(#netLine)" stroke-width="${rows.length > 10 ? 3 : 2}" fill="none"/><text x="${midX}" y="${midY}" text-anchor="middle" fill="#668b9a" font-size="9">${rows.length} 篇共同 DOI</text>`;
    }).join('');
    const nodes = D.scholars.map(s => {
      const pos = positions[s.id]; if (!pos) return '';
      const [x,y,tint] = pos;
      return `<a href="#/people/${s.id}" class="network-node" aria-label="${s.name}研究档案"><circle cx="${x}" cy="${y}" r="31" fill="${tint}" stroke="#fff" stroke-width="2"/><circle cx="${x}" cy="${y}" r="38" fill="none" stroke="${tint}"/><text x="${x}" y="${y+55}" text-anchor="middle">${s.name}</text><text x="${x}" y="${y+69}" class="node-en" text-anchor="middle">${s.en}</text></a>`;
    }).join('');
    const description = [...pairs.entries()].map(([name,rows]) => name + '：' + rows.length + '篇共同DOI').join('；');
    return `${pageHead('Follow the connections', '研究关联', '从共同 DOI 出发，观察多孔材料、气体转化与金属—酸催化之间的联系。四位研究者保留各自快照日期，人物关系需另据官方资料确认。')}<div class="atlas-grid"><section class="panel glass network-view"><svg viewBox="0 0 540 345" role="img" aria-label="${e(description)}"><defs><linearGradient id="netLine"><stop stop-color="#71aaa2"/><stop offset="1" stop-color="#8eaac6"/></linearGradient></defs>${edges}${nodes}</svg><p class="network-caption">连线：当前四份人物清单的 DOI 交集 · 点击人物可进入档案</p></section><section class="panel glass network-side"><div class="panel-heading"><h2>沿共同论文展开</h2><small>共 ${D.cross.length} 条成对交集线索</small></div><div class="prose"><p>王珺与洪卫的交集连接 CO₂ 电还原、醇氧化与乙炔半加氢。王珺与邓强的交集连接多孔材料、吸附与催化。曾小军的当前清单未找到与其余三位的共同 DOI；更完整资料可能改变结果。</p></div><div class="pair-list">${[...pairs.entries()].map(([key, rows]) => `<button class="pair-button ${key === activePair ? 'active' : ''}" data-action="network-pair" data-pair="${e(key)}"><span>${e(key)}<small style="display:block;font-size:8px;color:var(--quiet)">${e(rows[0]['快照日期'])}</small></span><strong>${rows.length}</strong></button>`).join('')}</div></section></div><div class="section-heading"><div><h2>${e(activePair)} <span>${current.length} 条共同论文线索</span></h2><p>仅为两份清单的 DOI 交集，保留各自归属证据。</p></div></div><div class="paper-list">${current.map(r => {
      const p = papers.get(r.DOI.toLowerCase());
      return p ? paperRow(p, r['人物甲ID']) : '';
    }).join('')}</div><div class="section-heading"><div><h2>论文清单中的时间分布</h2><p>按排序年统计，包含 C 类记录与合作支线；不代表个人完整年发文量。</p></div></div><div class="topic-grid">${D.scholars.map(s => {
      const byYear = new Map();
      for (const p of D.papers) if (p.records[s.id]) { const y = p.records[s.id]['排序年份']; byYear.set(y, (byYear.get(y) || 0) + 1); }
      const max = Math.max(...byYear.values());
      return `<section class="panel glass ${s.color}"><div class="panel-heading"><h3>${s.name}</h3><a href="#/people/${s.id}/papers" class="text-link">论文 →</a></div><div class="topic-chart" role="img" aria-label="${s.name}年度记录数：${[...byYear].map(([y,n]) => y + '年' + n + '条').join('，')}">${[...byYear].sort(([a],[b]) => a.localeCompare(b)).map(([y,n]) => `<div class="topic-year" title="${y}：${n} 条"><span class="topic-bar" style="height:${n / max * 85}px;background:linear-gradient(0deg,var(--tint),var(--tone))"></span><small>${y.slice(-2)}</small></div>`).join('')}</div><p class="chart-caption">${s.first_date.slice(0,4)}—${s.last_date.slice(0,4)} · 共 ${s.papers} 条人物记录 · ${s.as_of}</p></section>`;
    }).join('')}</div>`;
  }

  function render() {
    const raw = (location.hash.slice(1) || '/').split('?');
    route = {path: raw[0].replace(/\/$/, '') || '/', params: new URLSearchParams(raw[1] || '')};
    const segments = route.path.split('/').filter(Boolean);
    const category = segments[0] || 'overview';
    const labels = {overview: '总览', people: '人物档案', papers: '论文文库', reading: '阅读工作台', network: '研究关联', sources: '来源与数据'};
    let label = labels[category] || '页面未找到';
    $('#navigation').innerHTML = navItems.map(([id,path,label,count]) => `<a class="nav-item ${category === id ? 'active' : ''}" ${category === id ? 'aria-current="page"' : ''} href="#${path}">${icon(id)}<span>${label}</span>${count ? `<span class="nav-count">${count}</span>` : ''}</a>`).join('');
    $('#sidebar-people').innerHTML = '<p>当前人物 / IN FOCUS</p>' + D.scholars.map(s => `<a class="person-short ${s.color} ${segments[1] === s.id ? 'active' : ''}" href="#/people/${s.id}"><span class="mini-dot"></span>${s.name}<span>${s.papers}</span></a>`).join('');
    $('#mobile-nav').innerHTML = navItems.filter(([id]) => id !== 'sources').map(([id,path,label]) => `<a class="${category === id ? 'active' : ''}" ${category === id ? 'aria-current="page"' : ''} href="#${path}">${icon(id)}<span>${({overview:'总览',people:'人物',papers:'文库',network:'关联',reading:'阅读'})[id]}</span></a>`).join('');
    if (category === 'overview' && route.path === '/') main.innerHTML = overview();
    else if (category === 'people' && !segments[1]) main.innerHTML = peoplePage();
    else if (category === 'people' && scholars[segments[1]]) { const s = scholars[segments[1]]; label = s.name; main.innerHTML = profilePage(s, segments[2]); }
    else if (category === 'papers') main.innerHTML = libraryPage();
    else if (category === 'reading') main.innerHTML = readingPage();
    else if (category === 'sources') main.innerHTML = sourcesPage();
    else if (category === 'network') main.innerHTML = networkPage();
    else main.innerHTML = '<div class="empty"><h2>这份档案还没有建立</h2><p>先回到当前研究者的资料。</p><a class="primary-button" style="margin-top:18px" href="#/people">查看人物档案 →</a></div>';
    $('#page-label').textContent = label;
    document.title = label + ' · SC 人物研究知识库';
    renderResults();
  }

  function openPaper(id) {
    const p = papers.get(id);
    if (!p) return;
    lastFocus = document.activeElement;
    const metadata = Object.entries(p.records).map(([sid,r]) => `<details ${p.members.length === 1 ? 'open' : ''}><summary>${scholars[sid].name} · ${e(r['归属证据'])}</summary><dl class="metadata-list">${['排序日期','日期精度','排序日期依据','本人署名序号','共同一作核验','本人通讯作者状态','本人ORCID_Crossref逐篇','本人ORCID_参考身份锚点','本人署名单位_Crossref','本人署名单位_OpenAlex','研究主题_题名规则分类','经历阶段_仅按发表年粗分','Crossref在线日期','Crossref卷期日期','OpenAlex或原始日期','差异与限制'].map(k => `<dt>${e(k.replace(/_/g, ' · '))}</dt><dd>${e(r[k] || '未提供')}</dd>`).join('')}</dl>${r['候选开放PDF链接_可用性未测试'] ? external(r['候选开放PDF链接_可用性未测试'], '候选开放 PDF（可用性未核）', 'secondary-button') : ''}${r['候选开放全文页_可用性未测试'] ? external(r['候选开放全文页_可用性未测试'], '候选开放全文（可用性未核）', 'secondary-button') : ''}</details>`).join('');
    const authorRows = p.authorDetails || [];
    const authorKeys = authorRows.length ? Object.keys(authorRows[0]).filter(k => k !== 'archive') : [];
    const wantedKeys = authorKeys.filter(k => /姓名|作者全名|署名|ORCID|单位|作者.*序|作者位置/.test(k));
    const queue = D.scholars.flatMap(s => s.reading.filter(r => r.DOI.toLowerCase() === id).map(r => ({s, r})));
    $('#dialog-content').innerHTML = `<div class="dialog-inner"><div class="dialog-top"><div class="eyebrow">Paper / research & reading</div><button data-action="close-dialog" aria-label="关闭论文详情">×</button></div><h2 id="dialog-title">${e(p.zh || p.title)}</h2><p class="dialog-english" lang="en">${e(p.title)}</p><p class="dialog-authors">${e(p.authors)}</p><p class="paper-meta"><span class="journal">${e(p.journal)}</span> · ${e(p.date)} · ${e(p.doi)}</p><div class="dialog-actions">${external(p.url, '打开 DOI / 出版社', 'primary-button')}<button class="secondary-button" data-action="copy-citation" data-id="${e(id)}">复制引文</button><button class="secondary-button" data-action="bookmark-dialog" data-id="${e(id)}">${notes[id]?.saved ? '已收藏 ✓' : '加入收藏 +'}</button></div><div class="notice">中文题名为辅助译名。日期、作者角色与归属依据见下方档案。获取全文后，请同时核对补充信息与作者贡献声明。</div><div class="dialog-metadata">${metadata}${authorRows.length ? `<details><summary>逐位作者与 ORCID · 原始对应关系</summary><div class="table-scroll dialog-author-table" tabindex="0" role="region" aria-label="作者与ORCID对应表"><table><thead><tr><th>人物档案来源</th>${wantedKeys.map(k => `<th>${e(k.replace(/_/g,' · '))}</th>`).join('')}</tr></thead><tbody>${authorRows.map(r => `<tr><td>${e(scholars[r.archive]?.name)}</td>${wantedKeys.map(k => `<td>${e(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>` : ''}</div>${queue.map(({s,r}) => `<section style="margin-top:21px"><h3 style="font-size:12px">${s.name}阅读入口 · 核心问题</h3><p class="reading-question">${e(r['核心阅读问题'])}</p><p class="reading-detail">${e(r['建议关注的实验与评价_非个人操作证明'])}</p><p class="reading-depth">${e(r['本次来源阅读深度'])}</p></section>`).join('')}<section class="note-area"><label for="paper-note">我的阅读笔记</label><p>仅保存在当前浏览器。请在阅读工作台定期导出。</p><label class="sr-only" for="dialog-status">当前论文阅读状态</label><select id="dialog-status" class="status-select">${statusLabels.map(v => option(v, v, notes[id]?.status || '未开始')).join('')}</select><textarea id="paper-note" maxlength="50000" placeholder="研究问题、材料与方法、关键对照、证据与疑问…">${e(notes[id]?.note || '')}</textarea><button class="primary-button" data-action="save-note" data-id="${e(id)}">保存阅读记录</button></section></div>`;
    $('#paper-dialog').showModal();
    $('#paper-dialog').scrollTop = 0;
    $('#paper-dialog').dataset.paperId = id;
    if (!authorRows.length && p.authorChunk) {
      const details = document.createElement('details');
      details.id = 'author-details';
      details.innerHTML = '<summary>逐位作者与 ORCID · 原始对应关系</summary><p class="reading-detail" id="author-loading">展开后加载作者资料…</p>';
      $('.dialog-metadata').append(details);
      details.addEventListener('toggle', async () => {
        if (!details.open || details.dataset.loaded) return;
        details.dataset.loaded = 'loading';
        $('#author-loading').textContent = '正在读取作者对应表…';
        try {
          if (!authorCache.has(p.authorChunk)) authorCache.set(p.authorChunk, fetch('./' + p.authorChunk).then(response => { if (!response.ok) throw new Error('作者表不可用'); return response.json(); }));
          const rows = (await authorCache.get(p.authorChunk))[id] || [];
          if ($('#paper-dialog').dataset.paperId !== id) return;
          const keys = rows.length ? Object.keys(rows[0]).filter(k => /姓名|作者全名|署名|ORCID|单位|作者.*序|作者位置/.test(k)) : [];
          details.innerHTML = `<summary>逐位作者与 ORCID · 原始对应关系</summary><div class="table-scroll dialog-author-table" tabindex="0" role="region" aria-label="作者与ORCID对应表"><table><thead><tr><th>档案来源</th>${keys.map(k => `<th>${e(k.replace(/_/g,' · '))}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr><td>${e(scholars[r.archive]?.name)}</td>${keys.map(k => `<td>${e(r[k])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
          details.dataset.loaded = 'done';
        } catch {
          authorCache.delete(p.authorChunk);
          if ($('#paper-dialog').dataset.paperId === id) details.innerHTML = '<summary>逐位作者与 ORCID</summary><p class="reading-detail">作者对应表暂时无法载入，可在人物来源页下载「逐篇作者与 ORCID」表。</p>';
          details.dataset.loaded = '';
        }
      });
    }
  }

  function closeDialog() {
    $('#paper-dialog').close();
    if ($('#paper-results')) renderResults();
    else if (route.path === '/reading') render();
    if (lastFocus?.isConnected) lastFocus.focus();
    else main.focus({preventScroll:true});
  }

  function download(content, filename, type) {
    const url = URL.createObjectURL(new Blob([content], {type}));
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCSV() {
    // Neutralize spreadsheet formulas in textual metadata.
    const cell = value => '"' + String(value ?? '').replace(/^[=+@-]/, "'$&").replace(/"/g, '""') + '"';
    const rows = [['中文辅助题名','英文题名','期刊','日期','DOI','作者','关联人物','各档案归属证据','阅读状态']];
    for (const p of lastResults) rows.push([p.zh,p.title,p.journal,selectedRecord(p)['排序日期'],p.doi,p.authors,p.members.map(id => scholars[id].name).join('; '),p.members.map(id => scholars[id].name + ': ' + p.records[id]['归属证据']).join('; '),notes[p.id]?.status || '未开始']);
    download('\ufeff' + rows.map(r => r.map(cell).join(',')).join('\r\n'), 'SC-论文筛选结果-' + D.asOf + '.csv', 'text/csv;charset=utf-8');
  }

  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const {action, id} = button.dataset;
    if (action === 'open-paper') openPaper(id);
    else if (action === 'close-dialog') closeDialog();
    else if (action === 'bookmark' || action === 'bookmark-dialog') {
      saveNote(id, {saved: !notes[id]?.saved});
      if (action === 'bookmark') { button.classList.toggle('saved', notes[id].saved); button.setAttribute('aria-pressed', String(notes[id].saved)); const p = papers.get(id); button.setAttribute('aria-label', (notes[id].saved ? '取消收藏' : '收藏') + '：' + (p.zh || p.title)); if (library.saved) renderResults(); }
      else button.textContent = notes[id].saved ? '已收藏 ✓' : '加入收藏 +';
      if (storageAvailable) toast(notes[id].saved ? '已加入收藏' : '已取消收藏');
    }
    else if (action === 'save-note') { saveNote(id, {note: $('#paper-note').value, status: $('#dialog-status').value}); if (storageAvailable) toast('阅读记录已保存在此浏览器'); }
    else if (action === 'copy-citation') {
      const p = papers.get(id), text = `${p.authors}. ${p.title}. ${p.journal}, ${p.date}. https://doi.org/${p.doi}`;
      try { await navigator.clipboard.writeText(text); toast('引文已复制'); } catch { toast('无法直接复制，请选中 DOI 与作者信息复制。'); }
    }
    else if (action === 'page-prev' || action === 'page-next') { page += action === 'page-next' ? 1 : -1; renderResults(); $('#paper-results').scrollIntoView({behavior:'smooth', block:'start'}); }
    else if (action === 'reset-filters') { const person = route.path.startsWith('/people/') ? library.person : ''; location.hash = (person ? '/people/' + person + '/papers' : '/papers'); if (!(location.hash.includes('?'))) render(); }
    else if (action === 'export-papers') exportCSV();
    else if (action === 'export-notes') download(JSON.stringify({schema:'sc-reading-v1',exportedAt:new Date().toISOString(),notes},null,2), 'SC-阅读记录-' + new Date().toISOString().slice(0,10) + '.json', 'application/json;charset=utf-8');
    else if (action === 'network-pair') { activePair = button.dataset.pair; main.innerHTML = networkPage(); }
  });

  document.addEventListener('input', event => {
    if (!event.target.closest('#library-filters') || event.target.name !== 'q') return;
    library.q = event.target.value; page = 1; updateLibraryURL(); renderResults();
  });
  document.addEventListener('change', async event => {
    const target = event.target;
    if (target.closest('#library-filters')) { library[target.name] = target.type === 'checkbox' ? target.checked : target.value; page = 1; updateLibraryURL(); renderResults(); }
    else if (target.dataset.noteStatus) { saveNote(target.dataset.noteStatus, {status:target.value}); const top = window.scrollY; render(); window.scrollTo(0, top); if (storageAvailable) toast('阅读状态已保存'); }
    else if (target.id === 'import-notes' && target.files[0]) {
      try {
        const file = target.files[0]; if (file.size > 12 * 1024 * 1024) throw new Error('文件过大');
        const raw = JSON.parse((await file.text()).replace(/^\ufeff/,''));
        if (raw.schema !== 'sc-reading-v1' || !raw.notes || typeof raw.notes !== 'object' || Array.isArray(raw.notes)) throw new Error('格式不匹配');
        const incoming = validateNotes(raw.notes); let count = 0;
        for (const [id,note] of Object.entries(incoming)) if (!notes[id] || (note.updated || '') > (notes[id].updated || '')) { notes[id] = note; count++; }
        try { localStorage.setItem(STORE, JSON.stringify(notes)); storageAvailable = true; } catch { storageAvailable = false; }
        render(); toast(storageAvailable ? `已导入 ${count} 条较新的阅读记录` : '已读入本次页面，请立即导出备份');
      } catch { toast('无法导入：请选择从 SC 导出的阅读记录 JSON。'); }
    }
  });
  document.addEventListener('submit', event => {
    if (event.target.id === 'global-search') { event.preventDefault(); const q = $('#global-query').value.trim(); location.hash = '/papers' + (q ? '?q=' + encodeURIComponent(q) : ''); $('#global-query').blur(); }
    else if (event.target.id === 'library-filters') event.preventDefault();
  });
  document.addEventListener('keydown', event => {
    if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && !$('#paper-dialog').open) { event.preventDefault(); $('#global-query').focus(); }
  });
  $('#paper-dialog').addEventListener('click', event => { if (event.target === $('#paper-dialog')) { const r = event.target.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeDialog(); } });
  $('#paper-dialog').addEventListener('cancel', event => { event.preventDefault(); closeDialog(); });
  window.addEventListener('hashchange', () => { if ($('#paper-dialog').open) $('#paper-dialog').close(); render(); window.scrollTo({top:0,behavior:'instant'}); main.focus({preventScroll:true}); });
  $('#search-icon').innerHTML = icon('search');
  $('#github-link').innerHTML = icon('github');
  render();
  // Expose read-only utility references for reproducible, browser-independent verification.
  globalThis.SC = Object.freeze({counts:D.counts, filterPapers, validateNotes, getFilters:() => ({...library})});
})();
