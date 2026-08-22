(() => {
  'use strict';

  const OPENAQ_MIN_ZOOM=5;
  const DEFAULT_MAX_AGE_DAYS=30;
  const OPENAQ_POLLUTANTS={
    'PM2.5':{proxy:'pm25',label:'PM2.5'},
    'PM10':{proxy:'pm10',label:'PM10'}
  };

  state.openaqCache=state.openaqCache||new Map();
  state.openaqSuppressMove=false;
  state.openaqLastViewportKey='';
  state.openaqMoveTimer=null;

  SOURCE_INFO.openaq={
    name:'OpenAQ',
    years:['latest'],
    description:'<strong>OpenAQ:</strong> monitor di riferimento fissi nell’area attualmente visibile. La mappa carica solo la zona inquadrata e impedisce di allontanarsi fino alla vista mondiale.',
    hint:'Sposta o ingrandisci la mappa per aggiornare le stazioni OpenAQ. Se una zona contiene troppe stazioni, aumenta lo zoom: il proxy non restituisce risultati parziali.'
  };

  const baseFillYears=fillYears;
  const baseConfigureSourceUI=configureSourceUI;
  const baseRowsFor=rowsFor;
  const baseFitCurrentScope=fitCurrentScope;
  const baseSetLoading=setLoading;
  const baseSourceNotice=sourceNotice;
  const baseRender=render;
  const baseInitMaps=initMaps;

  function isOpenAQ(){return source()==='openaq'}

  function openAqPollutant(){
    return OPENAQ_POLLUTANTS[$('pollutantSelect').value]||null
  }

  function maxAgeDays(){
    const value=Number($('monthSelect')?.value);
    return [7,15,30].includes(value)?value:DEFAULT_MAX_AGE_DAYS
  }

  function setMonthFieldLabel(text){
    const field=$('monthField');
    if(!field)return;

    let label=field.querySelector('[data-period-label]');
    if(!label){
      const first=[...field.childNodes].find(node=>node.nodeType===Node.TEXT_NODE);
      if(first){
        label=document.createElement('span');
        label.dataset.periodLabel='true';
        label.textContent=text;
        first.replaceWith(label)
      }
    }

    if(label)label.textContent=text
  }

  function configureRecencyControl(){
    const field=$('monthField');
    const select=$('monthSelect');
    if(!field||!select)return;

    field.classList.remove('hidden');
    setMonthFieldLabel('Recenza');

    const previous=Number(select.value);
    select.innerHTML=[
      '<option value="7">Ultimi 7 giorni</option>',
      '<option value="15">Ultimi 15 giorni</option>',
      '<option value="30">Ultimi 30 giorni</option>'
    ].join('');
    select.value=[7,15,30].includes(previous)?String(previous):String(DEFAULT_MAX_AGE_DAYS);
    select.disabled=false;
    select.title='Intervallo massimo entro cui cercare l’ultimo dato disponibile della stazione.'
  }

  function hideUnavailableMonthlyControl(){
    const field=$('monthField');
    const select=$('monthSelect');
    if(!field||!select)return;

    setMonthFieldLabel('Mese');
    field.classList.add('hidden');
    select.disabled=true;
    select.title='La vista attuale usa statistiche annuali. L’aggregazione mensile richiede un flusso dati dedicato.'
  }

  function firstBaseSymbolLayerId(map){
    const layers=map?.getStyle?.()?.layers||[];
    return layers.find(layer=>
      layer.type==='symbol' &&
      !/^(?:air|before|after|diff)-/.test(String(layer.id||''))
    )?.id||null
  }

  function keepGeographicLabelsVisible(map,prefix='air'){
    if(!map)return;
    const beforeId=firstBaseSymbolLayerId(map);
    if(!beforeId)return;

    [
      `${prefix}-boundary-fill`,
      `${prefix}-boundary-line`,
      `${prefix}-heat`,
      `${prefix}-points`
    ].forEach(id=>{
      if(!map.getLayer(id))return;
      try{map.moveLayer(id,beforeId)}
      catch(err){console.debug(`Impossibile riordinare il layer ${id}`,err)}
    })
  }

  function setModeLock(locked){
    document.querySelectorAll('.tab').forEach(button=>{
      const isMap=button.dataset.mode==='map';
      button.disabled=locked&&!isMap;
      button.setAttribute('aria-disabled',String(locked&&!isMap));
      if(locked&&!isMap){
        button.title='Il confronto OpenAQ sarà basato su periodi storici omogenei; la vista “ultimo dato” non è confrontabile direttamente.'
      }else{
        button.removeAttribute('title')
      }
    });

    if(locked&&state.mode!=='map'){
      state.mode='map';
      document.querySelectorAll('.tab').forEach(button=>{
        button.classList.toggle('active',button.dataset.mode==='map')
      })
    }
  }

  function setOpenAqPollutantAvailability(active){
    const select=$('pollutantSelect');
    if(!select)return;

    const no2=select.querySelector('option[value="NO2"]');
    if(no2)no2.disabled=active;

    if(active&&!OPENAQ_POLLUTANTS[select.value]){
      select.value='PM2.5'
    }

    select.title=active
      ?'OpenAQ usa per ora PM2.5 e PM10 in µg/m³, per mantenere unità omogenee.'
      :''
  }

  function cameraSnapshot(map){
    if(!map)return null;
    const center=map.getCenter?.();
    if(!center)return null;

    return{
      center:[Number(center.lng),Number(center.lat)],
      zoom:Number(map.getZoom?.()),
      bearing:Number(map.getBearing?.()||0),
      pitch:Number(map.getPitch?.()||0)
    }
  }

  function sameCamera(map,camera){
    if(!map||!camera)return true;
    const center=map.getCenter?.();
    if(!center)return true;

    return(
      Math.abs(Number(center.lng)-camera.center[0])<1e-7 &&
      Math.abs(Number(center.lat)-camera.center[1])<1e-7 &&
      Math.abs(Number(map.getZoom?.())-camera.zoom)<1e-7 &&
      Math.abs(Number(map.getBearing?.()||0)-camera.bearing)<1e-7 &&
      Math.abs(Number(map.getPitch?.()||0)-camera.pitch)<1e-7
    )
  }

  function restoreOpenAqCamera(map,camera){
    if(!map||!camera||sameCamera(map,camera))return;

    state.openaqSuppressMove=true;
    map.jumpTo(camera);

    /*
     * jumpTo emette gli eventi di movimento in modo sincrono, ma teniamo la
     * soppressione fino al prossimo task per evitare che un eventuale moveend
     * generato dal browser faccia partire una seconda chiamata OpenAQ.
     */
    setTimeout(()=>{state.openaqSuppressMove=false},0)
  }

  function applyOpenAqMapConstraints(active){
    const map=state.map;
    if(!map)return;

    const before=cameraSnapshot(map);

    try{map.setMinZoom(active?OPENAQ_MIN_ZOOM:0)}catch{}

    if(typeof map.setRenderWorldCopies==='function'){
      try{map.setRenderWorldCopies(!active)}catch{}
    }

    /*
     * Se la vista corrente è già abbastanza vicina, non tocchiamo mai la
     * camera. Se invece si entra in OpenAQ da uno zoom più lontano del limite,
     * manteniamo lo stesso centro e applichiamo soltanto il minZoom richiesto.
     */
    if(active&&before&&before.zoom<OPENAQ_MIN_ZOOM){
      state.openaqSuppressMove=true;
      map.jumpTo({
        center:before.center,
        zoom:OPENAQ_MIN_ZOOM,
        bearing:before.bearing,
        pitch:before.pitch
      });
      setTimeout(()=>{state.openaqSuppressMove=false},0)
    }
  }

  function currentViewportBbox(){
    const map=state.map;
    if(!map)throw new Error('Mappa OpenAQ non inizializzata.');

    const bounds=map.getBounds();
    let west=Number(bounds.getWest());
    let east=Number(bounds.getEast());
    let south=Number(bounds.getSouth());
    let north=Number(bounds.getNorth());

    west=Math.max(-180,Math.min(180,west));
    east=Math.max(-180,Math.min(180,east));
    south=Math.max(-85,Math.min(85,south));
    north=Math.max(-85,Math.min(85,north));

    if(!(west<east&&south<north)){
      throw new Error('Area visibile non valida. Sposta leggermente la mappa e riprova.')
    }

    return[west,south,east,north]
      .map(value=>Number(value.toFixed(4)))
      .join(',')
  }

  function viewportKey(){
    if(!state.map)return'';
    try{
      const bbox=currentViewportBbox()
        .split(',')
        .map(value=>Number(value).toFixed(2))
        .join(',');
      return `${openAqPollutant()?.proxy||'none'}:${maxAgeDays()}:${bbox}`
    }catch{
      return''
    }
  }

  function rememberCache(key,value){
    state.openaqCache.set(key,value);
    while(state.openaqCache.size>24){
      const first=state.openaqCache.keys().next().value;
      state.openaqCache.delete(first)
    }
  }

  fillYears=function(){
    if(!isOpenAQ())return baseFillYears();

    for(const id of ['yearSelect','compareYearA','compareYearB']){
      const select=$(id);
      if(!select)continue;
      select.innerHTML='<option value="latest">Ultimo dato disponibile</option>';
      select.value='latest'
    }
  };

  configureSourceUI=function(){
    if(!isOpenAQ()){
      setModeLock(false);
      setOpenAqPollutantAvailability(false);
      applyOpenAqMapConstraints(false);
      if($('yearFieldLabel'))$('yearFieldLabel').textContent='Anno';

      const result=baseConfigureSourceUI();
      hideUnavailableMonthlyControl();
      return result
    }

    const info=SOURCE_INFO.openaq;
    $('sourceDescription').innerHTML=info.description;
    $('eeaScopeField').classList.add('hidden');
    $('singleYearField')?.classList.add('hidden');

    configureRecencyControl();

    $('avgLabel').textContent='Media ultimi dati';
    $('countLabel').textContent='Stazioni';
    $('countUnit').textContent='reference-grade';
    $('listTitle').textContent='Stazioni OpenAQ nell’area visibile';

    setOpenAqPollutantAvailability(true);
    setModeLock(true);
    applyOpenAqMapConstraints(true)
  };

  function parseOpenAQRows(payload){
    const expected=openAqPollutant();
    if(!expected)throw new Error('OpenAQ supporta per ora PM2.5 e PM10.');

    const meta=payload?.meta||{};
    const unit=String(meta?.pollutant?.units||'');
    if(unit&&unit!=='µg/m³'&&!unit.includes('ug/m3')){
      throw new Error(`OpenAQ: unità ${unit} non compatibile con questa visualizzazione.`)
    }

    const raw=Array.isArray(payload?.results)?payload.results:[];
    return raw.map(item=>{
      const lat=parseNumber(item.latitude);
      const lon=parseNumber(item.longitude);
      const value=parseNumber(item.value);
      if(lat===null||lon===null||value===null||value<0)return null;

      return{
        id:`OpenAQ-${item.locationId}`,
        openaqLocationId:item.locationId,
        sensorId:item.sensorId,
        name:String(item.name||item.locality||`OpenAQ ${item.locationId}`),
        country:String(item.countryCode||''),
        lat,lon,value,
        coverage:null,
        verification:'reference monitor',
        area:String(item.locality||''),
        stationType:'reference monitor',
        kind:'station',
        provider:`OpenAQ${item.providerName?` · ${item.providerName}`:''}`,
        latestAt:String(item.datetimeUtc||''),
        ageHours:Number.isFinite(Number(item.ageHours))?Number(item.ageHours):null,
        unit:unit||'µg/m³'
      }
    }).filter(Boolean).sort((a,b)=>{
      const country=a.country.localeCompare(b.country);
      return country||a.name.localeCompare(b.name,'it')
    })
  }

  async function fetchOpenAQViewportRows(){
    const pollutant=openAqPollutant();
    if(!pollutant)throw new Error('OpenAQ supporta per ora PM2.5 e PM10.');
    if(!globalThis.QualitaAriaOpenAQProxy){
      throw new Error('Client proxy OpenAQ non disponibile.')
    }
    if(!state.map)throw new Error('Mappa OpenAQ non disponibile.');
    if(state.map.getZoom()<OPENAQ_MIN_ZOOM){
      throw new Error(`Aumenta lo zoom almeno a ${OPENAQ_MIN_ZOOM} per caricare OpenAQ.`)
    }

    const bbox=currentViewportBbox();
    const days=maxAgeDays();
    const cacheKey=`${pollutant.proxy}:${days}:${bbox}`;

    if(state.openaqCache.has(cacheKey)){
      const cached=state.openaqCache.get(cacheKey);
      diagnostics({...cached.diagnostic,cache:'memory'});
      return cached.rows
    }

    const response=await QualitaAriaOpenAQProxy.viewportLatest({
      pollutant:pollutant.proxy,
      bbox,
      maxAgeDays:days
    });

    const rows=parseOpenAQRows(response.data);
    const meta=response.data?.meta||{};
    const diagnostic={
      source:'OpenAQ API v3 · Cloudflare proxy',
      scope:'Area visibile',
      bbox,
      zoom:Number(state.map.getZoom().toFixed(2)),
      pollutant:pollutant.label,
      unit:meta?.pollutant?.units||'µg/m³',
      mode:'latest reference monitors in viewport',
      maxAgeDays:meta.maxAgeDays||days,
      locationsDiscovered:meta.locationsDiscovered??null,
      recentCandidates:meta.recentCandidates??null,
      staleLocationsSkipped:meta.staleLocationsSkipped??null,
      discoveryQueries:meta.discoveryQueries??null,
      splitApplied:Boolean(meta.splitApplied),
      rowsReceived:rows.length,
      generatedAt:meta.generatedAt||null,
      workerCache:response.cache,
      endpoint:response.endpoint
    };

    diagnostics(diagnostic);
    rememberCache(cacheKey,{rows,diagnostic});
    state.openaqLastViewportKey=viewportKey();
    return rows
  }

  rowsFor=async function(year){
    if(isOpenAQ())return fetchOpenAQViewportRows();
    return baseRowsFor(year)
  };

  fitCurrentScope=function(map,rows){
    if(isOpenAQ()){
      keepGeographicLabelsVisible(map,'air');
      return
    }
    return baseFitCurrentScope(map,rows)
  };

  setLoading=function(on){
    if(!isOpenAQ())return baseSetLoading(on);
    $('loadingOverlay').classList.toggle('hidden',!on);
    $('loadingText').textContent='Caricamento OpenAQ · area visibile…'
  };

  sourceNotice=function(rows){
    if(!isOpenAQ())return baseSourceNotice(rows);
    return `OpenAQ · area visibile · reference monitor · ultimo dato ≤ ${maxAgeDays()}gg`
  };

  render=async function(){
    /*
     * In OpenAQ la camera appartiene all'utente: cambiare inquinante, recenza
     * o ricaricare i dati non deve rifare fit/jump sulla mappa.
     */
    const preserveCamera=isOpenAQ()&&state.mode==='map'
      ?cameraSnapshot(state.map)
      :null;

    await baseRender();
    if(!isOpenAQ()||state.mode!=='map')return;

    // baseRender mostra il campo anno in modalità Mappa: OpenAQ non ha un
    // periodo selezionabile, quindi lo nascondiamo nuovamente. Resta soltanto
    // il controllo Recenza (7/15/30 giorni).
    $('singleYearField')?.classList.add('hidden');

    restoreOpenAqCamera(state.map,preserveCamera);
    keepGeographicLabelsVisible(state.map,'air');

    const pollutant=openAqPollutant();
    if(pollutant){
      $('mapBadge').textContent=`${pollutant.label} · ultimo dato ≤ ${maxAgeDays()}gg`
    }

    $('avgLabel').textContent='Media ultimi dati';
    $('periodValue').textContent=`≤ ${maxAgeDays()}gg`;
    $('sourceValue').textContent='OpenAQ · area visibile';
    $('mapHint').textContent=`${SOURCE_INFO.openaq.hint} Sono accettati dati fino a ${maxAgeDays()} giorni fa.`;
    state.openaqLastViewportKey=viewportKey()
  };

  function bindViewportRefresh(){
    const map=state.map;
    if(!map||map.__qaOpenAqViewportBound)return;
    map.__qaOpenAqViewportBound=true;

    map.on('moveend',()=>{
      if(!isOpenAQ()||state.openaqSuppressMove)return;

      clearTimeout(state.openaqMoveTimer);
      state.openaqMoveTimer=setTimeout(()=>{
        const key=viewportKey();
        if(!key||key===state.openaqLastViewportKey)return;
        state.openaqLastViewportKey=key;
        render()
      },220)
    })
  }

  initMaps=function(){
    baseInitMaps();
    bindViewportRefresh()
  };

  $('monthSelect')?.addEventListener('change',()=>{
    if(!isOpenAQ())return;
    state.openaqCache.clear();
    state.openaqLastViewportKey='';
    render()
  });

  const option=$('sourceSelect')?.querySelector('option[value="openaq"]');
  if(option)option.textContent='OpenAQ · area visibile';

  setModeLock(false);
  setOpenAqPollutantAvailability(false)
})();
