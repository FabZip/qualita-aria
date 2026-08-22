(() => {
  'use strict';

  const PAGE_SIZE = 12;
  const MAX_SUGGESTIONS = 40;

  const listState = {
    rows: [],
    mode: 'normal',
    isDiff: false,
    page: 1,
    pageSize: PAGE_SIZE,
    query: ''
  };

  const $ = id => document.getElementById(id);

  function fmtValue(value){
    const n = Number(value);
    return Number.isFinite(n)
      ? n.toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})
      : '—'
  }

  function colorForValue(value){
    const n = Number(value);
    if(!Number.isFinite(n))return '#64748b';
    if(n < 10)return '#35d07f';
    if(n < 20)return '#e6cf43';
    if(n < 30)return '#ff914d';
    return '#ff5864'
  }

  function escapeHtml(value){
    return String(value ?? '')
      .replaceAll('&','&amp;')
      .replaceAll('<','&lt;')
      .replaceAll('>','&gt;')
      .replaceAll('"','&quot;')
      .replaceAll("'",'&#039;')
  }

  function normalize(value){
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .toLowerCase()
      .replace(/\s+/g,' ')
      .trim()
  }

  function comparisonTrend(valueA,valueB){
    if(valueA === null || valueA === undefined || valueB === null || valueB === undefined){
      return null
    }

    const a = Math.round(Number(valueA) * 10) / 10;
    const b = Math.round(Number(valueB) * 10) / 10;

    if(b > a)return {kind:'up',symbol:'▲',label:'Aumentato'};
    if(b < a)return {kind:'down',symbol:'▼',label:'Diminuito'};
    return {kind:'stable',symbol:'●',label:'Stabile'}
  }

  function ensureControls(){
    const stationList = document.querySelector('.station-list');
    const title = stationList?.querySelector('.section-title');
    const stations = $('stations');
    if(!stationList || !title || !stations)return false;

    if(!$('stationListTools')){
      const tools = document.createElement('div');
      tools.id = 'stationListTools';
      tools.className = 'station-list-tools hidden';
      tools.innerHTML = `
        <label class="station-search-label" for="stationSearch">
          Cerca stazione
          <input
            id="stationSearch"
            class="station-search-input"
            type="search"
            list="stationSuggestions"
            placeholder="Nome, codice o Paese"
            autocomplete="off"
            spellcheck="false"
          >
          <datalist id="stationSuggestions"></datalist>
        </label>
        <div class="station-list-meta">
          <span id="stationResultRange">—</span>
          <strong id="stationFilteredCount"></strong>
        </div>
      `;
      title.insertAdjacentElement('afterend',tools);

      const pagination = document.createElement('nav');
      pagination.id = 'stationPagination';
      pagination.className = 'station-pagination hidden';
      pagination.setAttribute('aria-label','Pagine elenco stazioni');
      pagination.innerHTML = `
        <button id="stationPrevPage" type="button" aria-label="Pagina precedente">‹ Precedente</button>
        <span id="stationPageInfo" class="station-page-info">Pagina 1 di 1</span>
        <button id="stationNextPage" type="button" aria-label="Pagina successiva">Successiva ›</button>
      `;
      stations.insertAdjacentElement('afterend',pagination);

      $('stationSearch').addEventListener('input',event=>{
        listState.query = event.target.value;
        listState.page = 1;
        renderPage();
        updateSuggestions()
      });

      $('stationSearch').addEventListener('search',event=>{
        listState.query = event.target.value;
        listState.page = 1;
        renderPage();
        updateSuggestions()
      });

      $('stationPrevPage').addEventListener('click',()=>{
        if(listState.page <= 1)return;
        listState.page -= 1;
        renderPage();
        scrollListIntoView()
      });

      $('stationNextPage').addEventListener('click',()=>{
        const totalPages = getTotalPages(getFilteredRows().length);
        if(listState.page >= totalPages)return;
        listState.page += 1;
        renderPage();
        scrollListIntoView()
      });
    }

    return true
  }

  function rowSearchText(row){
    if(listState.mode === 'compare'){
      return normalize([
        row.name,
        row.id,
        row.country,
        row.provider
      ].filter(Boolean).join(' '))
    }

    return normalize([
      row.name,
      row.id,
      row.country,
      row.area,
      row.stationType,
      row.zone,
      row.provider
    ].filter(Boolean).join(' '))
  }

  function matchesQuery(row){
    const query = normalize(listState.query);
    if(!query)return true;

    const haystack = rowSearchText(row);
    const tokens = query.split(' ').filter(Boolean);
    return tokens.every(token=>haystack.includes(token))
  }

  function getFilteredRows(){
    return listState.rows.filter(matchesQuery)
  }

  function getTotalPages(filteredCount){
    return Math.max(1,Math.ceil(filteredCount / listState.pageSize))
  }

  function updateSuggestions(){
    const datalist = $('stationSuggestions');
    if(!datalist)return;

    const query = normalize(listState.query);
    const seen = new Set();
    const suggestions = [];

    for(const row of listState.rows){
      if(query && !matchesQuery(row))continue;

      const value = String(row.name || row.id || '').trim();
      if(!value)continue;

      const key = normalize(value);
      if(seen.has(key))continue;
      seen.add(key);

      const label = [row.country,row.id]
        .filter(Boolean)
        .join(' · ');

      suggestions.push({value,label});
      if(suggestions.length >= MAX_SUGGESTIONS)break
    }

    datalist.innerHTML = suggestions.map(item=>
      `<option value="${escapeHtml(item.value)}"${item.label?` label="${escapeHtml(item.label)}"`:''}></option>`
    ).join('')
  }

  function coordinatesForRow(row){
    const directLat=Number(row?.lat);
    const directLon=Number(row?.lon);

    if(Number.isFinite(directLat)&&Number.isFinite(directLon)){
      return{lat:directLat,lon:directLon}
    }

    /*
     * In EEA comparison mode mergeComparisonRows() keeps the station id but
     * not its coordinates. The two original annual datasets are already in
     * state.eeaCache, so recover the same station from there without another
     * network request.
     */
    const id=String(row?.id||'').trim();
    if(!id)return null;

    try{
      for(const cached of state?.eeaCache?.values?.()||[]){
        const match=(cached?.rows||[]).find(item=>String(item.id||'').trim()===id);
        if(!match)continue;

        const lat=Number(match.lat);
        const lon=Number(match.lon);
        if(Number.isFinite(lat)&&Number.isFinite(lon)){
          return{lat,lon}
        }
      }
    }catch{
      // If the main application state is unavailable, leave the row non-clickable.
    }

    return null
  }

  function stationRowAttributes(row,index){
    const coordinates=coordinatesForRow(row);
    if(!coordinates)return '';

    const name=escapeHtml(row.name||row.id||'stazione');
    return ` data-station-index="${index}" role="button" tabindex="0" aria-label="Centra la mappa sulla stazione ${name}"`
  }

  function focusStation(row){
    const coordinates=coordinatesForRow(row);
    if(!coordinates)return;

    const map=listState.mode==='compare'
      ?state?.mapBefore
      :state?.map;

    if(!map)return;

    /*
     * In comparison mode app.js already synchronizes mapBefore and mapAfter,
     * therefore moving mapBefore moves both maps to the same station.
     */
    const currentZoom=Number(map.getZoom?.()??0);
    const targetZoom=Math.max(currentZoom,11.5);

    map.easeTo({
      center:[coordinates.lon,coordinates.lat],
      zoom:targetZoom,
      duration:650,
      essential:true
    });

    const mapCard=document.querySelector('.map-card');
    if(mapCard){
      mapCard.scrollIntoView({behavior:'smooth',block:'center'})
    }
  }

  function bindStationRows(pageRows){
    const stations=$('stations');
    if(!stations)return;

    stations.querySelectorAll('[data-station-index]').forEach(element=>{
      const index=Number(element.dataset.stationIndex);
      const row=pageRows[index];
      if(!row)return;

      element.addEventListener('click',()=>focusStation(row));
      element.addEventListener('keydown',event=>{
        if(event.key==='Enter'||event.key===' '){
          event.preventDefault();
          focusStation(row)
        }
      })
    })
  }

  function normalRowHtml(row,index){
    const isDiff = listState.isDiff;

    const range = (!isDiff && row.kind === 'municipal' && row.min !== null && row.max !== null)
      ? `<div class="metric-range"><span>MIN ${fmtValue(row.min)}</span><span>MED ${fmtValue(row.value)}</span><span>MAX ${fmtValue(row.max)} µg/m³</span></div>`
      : '';

    const detail = row.kind === 'station'
      ? `${row.country?`${escapeHtml(row.country)} · `:''}${escapeHtml(row.id || '')}${row.coverage !== null && row.coverage !== undefined?` · copertura ${fmtValue(row.coverage)}%`:''}`
      : `Comune di Roma${row.zone?` · zona ${escapeHtml(row.zone)}`:''}`;

    const dotColor = isDiff
      ? (Number(row.value) <= 0 ? '#35d07f' : '#ff5864')
      : colorForValue(row.value);

    const value = `${isDiff && Number(row.value) > 0?'+':''}${fmtValue(row.value)}`;

    const clickable=coordinatesForRow(row)?' station-row-clickable':'';

    return `<div class="station-row${clickable}"${stationRowAttributes(row,index)}>
      <i style="background:${dotColor}"></i>
      <div><strong>${escapeHtml(row.name)}</strong><small>${detail}</small>${range}</div>
      <b>${value}</b>
    </div>`
  }

  function comparisonRowHtml(row,index){
    const left = row.valueA === null || row.valueA === undefined ? '—' : fmtValue(row.valueA);
    const right = row.valueB === null || row.valueB === undefined ? '—' : fmtValue(row.valueB);

    const leftColor = row.valueA === null || row.valueA === undefined
      ? '#64748b'
      : colorForValue(row.valueA);

    const rightColor = row.valueB === null || row.valueB === undefined
      ? '#64748b'
      : colorForValue(row.valueB);

    const trend = comparisonTrend(row.valueA,row.valueB);
    const trendHtml = trend
      ? ` <span class="trend-indicator trend-${trend.kind}" title="${trend.label}" aria-label="${trend.label}">${trend.symbol}</span>`
      : '';

    const detail = `${row.country?`${escapeHtml(row.country)} · `:''}${escapeHtml(row.id || '')}`;

    const clickable=coordinatesForRow(row)?' station-row-clickable':'';

    return `<div class="station-row${clickable}"${stationRowAttributes(row,index)}>
      <i style="background:linear-gradient(90deg,${leftColor} 0 50%,${rightColor} 50% 100%)"></i>
      <div><strong>${escapeHtml(row.name)}</strong><small>${detail}</small></div>
      <b class="comparison-values" aria-label="Valori a confronto: ${left} e ${right}${trend?`. ${trend.label}`:''}">${left}&nbsp;↔&nbsp;${right}${trendHtml}</b>
    </div>`
  }

  function renderPage(){
    if(!ensureControls())return;

    const stations = $('stations');
    const tools = $('stationListTools');
    const pagination = $('stationPagination');
    const filtered = getFilteredRows();

    if(!listState.rows.length){
      stations.innerHTML = '<div class="empty-state">Nessun dato reale disponibile per questa selezione.</div>';
      tools.classList.add('hidden');
      pagination.classList.add('hidden');
      return
    }

    const totalPages = getTotalPages(filtered.length);
    if(listState.page > totalPages)listState.page = totalPages;
    if(listState.page < 1)listState.page = 1;

    const start = (listState.page - 1) * listState.pageSize;
    const end = Math.min(start + listState.pageSize,filtered.length);
    const pageRows = filtered.slice(start,end);

    if(!filtered.length){
      stations.innerHTML = '<div class="empty-state">Nessuna stazione corrisponde alla ricerca.</div>'
    }else{
      stations.innerHTML = pageRows.map((row,index)=>
        listState.mode === 'compare'
          ? comparisonRowHtml(row,index)
          : normalRowHtml(row,index)
      ).join('');
      bindStationRows(pageRows)
    }

    const controlsNeeded = listState.rows.length > listState.pageSize || Boolean(normalize(listState.query));
    tools.classList.toggle('hidden',!controlsNeeded);

    $('stationResultRange').textContent = filtered.length
      ? `${start + 1}–${end} di ${filtered.length}`
      : '0 risultati';

    $('stationFilteredCount').textContent = normalize(listState.query)
      ? `${filtered.length} trovate`
      : `${listState.rows.length} totali`;

    $('stationPageInfo').textContent = `Pagina ${listState.page} di ${totalPages}`;
    $('stationPrevPage').disabled = listState.page <= 1;
    $('stationNextPage').disabled = listState.page >= totalPages;

    pagination.classList.toggle('hidden',filtered.length <= listState.pageSize);
    updateSuggestions()
  }

  function resetSearch(){
    listState.query = '';
    listState.page = 1;
    const input = $('stationSearch');
    if(input)input.value = ''
  }

  function setRows(rows,mode,isDiff=false){
    ensureControls();
    listState.rows = Array.isArray(rows)?rows:[];
    listState.mode = mode;
    listState.isDiff = Boolean(isDiff);
    resetSearch();
    renderPage()
  }

  function scrollListIntoView(){
    const list = document.querySelector('.station-list');
    if(!list)return;

    const rect = list.getBoundingClientRect();
    if(rect.top < 0 || rect.top > window.innerHeight * .65){
      list.scrollIntoView({behavior:'smooth',block:'start'})
    }
  }

  // app.js uses global classic-script function declarations. Replacing these
  // globals before the asynchronous map load gives true pagination: only the
  // current page is inserted into the DOM, even when Europe has many stations.
  globalThis.renderList = function(rows,isDiff=false){
    setRows(rows,'normal',isDiff)
  };

  globalThis.renderComparisonList = function(rows){
    setRows(rows,'compare',false)
  };

  ensureControls();
})();
