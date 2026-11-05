(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const stateRows = [...document.querySelectorAll('#states-table tbody tr')];
  const stateSearch = byId('state-search'), category = byId('state-category');
  function filterStates() {
    const q = stateSearch.value.trim().toLocaleLowerCase();
    let count = 0;
    stateRows.forEach(r => {
      r.hidden = !(r.dataset.search.includes(q) && (category.value === 'all' || category.value === r.dataset.category));
      if (!r.hidden) count++;
    });
    byId('state-count').textContent = `${count} / 51 个司法辖区`;
    byId('state-empty').hidden = count !== 0;
  }
  stateSearch.addEventListener('input', filterStates);
  category.addEventListener('change', filterStates);
  byId('state-reset').addEventListener('click', () => {
    stateSearch.value = ''; category.value = 'all'; filterStates(); stateSearch.focus();
  });
  document.querySelectorAll('[data-state]').forEach(a => a.addEventListener('click', () => {
    stateSearch.value = ''; category.value = 'all'; filterStates();
  }));
  // Honor a direct link to a state even when filters had previously been applied.
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#state-')) {
      stateSearch.value = ''; category.value = 'all'; filterStates();
    }
    const source = document.getElementById(location.hash.slice(1));
    if (source && source.classList.contains('source') && source.hidden) {
      byId('source-search').value='';
      byId('source-search').dispatchEvent(new Event('input'));
    }
  });
  function textFilter(input, rows, counter, noun) {
    function update() {
      const q=input.value.trim().toLocaleLowerCase(); let n=0;
      rows.forEach(r => { r.hidden=!r.textContent.toLocaleLowerCase().includes(q); if(!r.hidden)n++; });
      counter.textContent=`${n} / ${rows.length} ${noun}`;
    }
    input.addEventListener('input',update); update();
  }
  textFilter(byId('term-search'), [...document.querySelectorAll('#terms-table tbody tr')], byId('term-count'), '项术语');
  textFilter(byId('source-search'), [...document.querySelectorAll('.source')], byId('source-count'), '条来源');
  byId('people-company').addEventListener('change', filterPeople);
  function filterPeople() {
    const selected=byId('people-company').value; let n=0;
    document.querySelectorAll('#people-table tbody tr').forEach(r => {
      r.hidden=selected!=='all'&&r.dataset.company!==selected; if(!r.hidden)n++;
    });
    byId('people-count').textContent=`显示 ${n} 条公开人物记录`;
  }
  byId('print').addEventListener('click', () => window.print());
  // Printing always includes all rows and disclosure notes, independent of screen filters.
  let printState;
  window.addEventListener('beforeprint', () => {
    printState = [...document.querySelectorAll('[hidden], details')].map(el=>({el,hidden:el.hidden,open:el.open}));
    printState.forEach(({el})=>{el.hidden=false;if(el.tagName==='DETAILS')el.open=true;});
    byId('state-empty').hidden=true;
  });
  window.addEventListener('afterprint', () => {
    if(printState)printState.forEach(({el,hidden,open})=>{el.hidden=hidden;if(el.tagName==='DETAILS')el.open=open;});
  });
  if ('IntersectionObserver' in window) {
    const observer=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting)document.querySelectorAll('nav a').forEach(a=>a.classList.toggle('active',a.hash==='#'+e.target.id));
    }),{rootMargin:'-5% 0px -80% 0px'});
    document.querySelectorAll('main>section').forEach(s=>observer.observe(s));
  }
  filterStates(); filterPeople();
})();
