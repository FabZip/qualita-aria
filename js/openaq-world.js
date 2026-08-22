(() => {
  'use strict';

  const MAX_AGE_HOURS=72;
  const WORLD_CENTER=[0,20];
  const WORLD_ZOOM=1.55;
  const OPENAQ_POLLUTANTS={
    'PM2.5':{proxy:'pm25',label:'PM2.5'},
    'PM10':{proxy:'pm10',label:'PM10'}
  };

  state.openaqCache=state.openaqCache||new Map();

  SOURCE_INFO.openaq={
    name:'OpenAQ',
    years:['latest'],
    description:'<strong>OpenAQ:</strong> ultimi dati disponibili dei monitor di riferimento fissi nel mondo. OpenAQ aggrega dati di molte reti e provider; in questa vista non vengono mescolati sensori mobili o non-reference.',
    hint:`OpenAQ mostra l’ultimo dato disponibile entro ${MAX_AGE_HOURS} ore per ciascuna stazione reference-grade. I punti non sono medie annuali e possono riferirsi a orari diversi.`
  };

  const baseFillYears=fillYears;
  const baseConfigureSourceUI=configureSourceUI;
  const baseRowsFor=rowsFor;
  const baseFitCurrentScope=fitCurrentScope;
  const baseSetLoading=setLoading;
  const baseSourceNotice=sourceNotice;
  const baseRender=render;

  function isOpenAQ(){return source()==='openaq'}

  function openAqPollutant(){
    return OPENAQ_POLLUTANTS[$('pollutantSelect').value]||null
  }

  /*
   * I layer della qualità dell'aria vengono creati dopo lo stile base e,
   * senza un riordino, finiscono sopra le etichette geografiche.
   * Troviamo il primo layer simbolo appartenente alla mappa base e spostiamo
   * heatmap/marker sotto di esso. Le etichette di città, Paesi e strade
   * rimangono così leggibili anche quando la mappa dell'inquinamento è densa.
   */
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
        button.title='Confronto e Differenza mondiali richiedono snapshot storici globali e non sono ancora attivi per OpenAQ.'
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
      ?'OpenAQ Mondo usa per ora PM2.5 e PM10 in µg/m³, per mantenere unità confrontabili con la mappa.'
      :''
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
      if($('yearFieldLabel'))$('yearFieldLabel').textContent='Anno';
      $('monthField')?.classList.remove('hidden');
      return baseConfigureSourceUI()
    }

    const info=SOURCE_INFO.openaq;
    $('sourceDescription').innerHTML=info.description;
    $('eeaScopeField').classList.add('hidden');
    $('monthField')?.classList.add('hidden');
    if($('yearFieldLabel'))$('yearFieldLabel').textContent='Periodo';

    $('monthSelect').disabled=true;
    $('monthSelect').title='OpenAQ Mondo mostra l’ultimo dato disponibile, non una media annuale.';

    $('avgLabel').textContent='Media ultimi dati';
    $('countLabel').textContent='Stazioni';
    $('countUnit').textContent='reference-grade';
    $('listTitle').textContent='Stazioni OpenAQ visualizzate';

    setOpenAqPollutantAvailability(true);
    setModeLock(true)
  };

  function parseOpenAQRows(payload){
    const expected=openAqPollutant();
    if(!expected)throw new Error('OpenAQ Mondo supporta per ora PM2.5 e PM10.');

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
        unit:unit||'µg/m³'
      }
    }).filter(Boolean).sort((a,b)=>{
      const country=a.country.localeCompare(b.country);
      return country||a.name.localeCompare(b.name,'it')
    })
  }

  async function fetchOpenAQWorldRows(){
    const pollutant=openAqPollutant();
    if(!pollutant)throw new Error('OpenAQ Mondo supporta per ora PM2.5 e PM10.');
    if(!globalThis.QualitaAriaOpenAQProxy){
      throw new Error('Client proxy OpenAQ non disponibile.')
    }

    const cacheKey=`${pollutant.proxy}:${MAX_AGE_HOURS}`;
    if(state.openaqCache.has(cacheKey)){
      const cached=state.openaqCache.get(cacheKey);
      diagnostics({...cached.diagnostic,cache:'memory'});
      return cached.rows
    }

    const response=await QualitaAriaOpenAQProxy.worldLatest({
      pollutant:pollutant.proxy,
      maxAgeHours:MAX_AGE_HOURS
    });

    const rows=parseOpenAQRows(response.data);
    const meta=response.data?.meta||{};
    const diagnostic={
      source:'OpenAQ API v3 · Cloudflare proxy',
      scope:'Mondo',
      pollutant:pollutant.label,
      unit:meta?.pollutant?.units||'µg/m³',
      mode:'latest reference monitors',
      maxAgeHours:meta.maxAgeHours||MAX_AGE_HOURS,
      locationsFound:meta.locationsFound??null,
      latestFound:meta.latestFound??null,
      locationPages:meta.locationPages??null,
      latestPages:meta.latestPages??null,
      locationsTruncated:Boolean(meta.locationsTruncated),
      latestTruncated:Boolean(meta.latestTruncated),
      rowsReceived:rows.length,
      generatedAt:meta.generatedAt||null,
      workerCache:response.cache,
      endpoint:response.endpoint
    };

    diagnostics(diagnostic);
    state.openaqCache.set(cacheKey,{rows,diagnostic});
    return rows
  }

  rowsFor=async function(year){
    if(isOpenAQ())return fetchOpenAQWorldRows();
    return baseRowsFor(year)
  };

  fitCurrentScope=function(map,rows){
    if(isOpenAQ()){
      map?.jumpTo({center:WORLD_CENTER,zoom:WORLD_ZOOM,bearing:0,pitch:0});
      keepGeographicLabelsVisible(map,'air');
      return
    }
    return baseFitCurrentScope(map,rows)
  };

  setLoading=function(on){
    if(!isOpenAQ())return baseSetLoading(on);
    $('loadingOverlay').classList.toggle('hidden',!on);
    $('loadingText').textContent='Caricamento OpenAQ · Mondo…'
  };

  sourceNotice=function(rows){
    if(!isOpenAQ())return baseSourceNotice(rows);
    return `OpenAQ · Mondo · reference monitor · ultimo dato ≤ ${MAX_AGE_HOURS}h`
  };

  render=async function(){
    await baseRender();
    if(!isOpenAQ()||state.mode!=='map')return;

    // baseRender aggiorna i dati; dopo l'aggiornamento riportiamo il contesto
    // geografico sopra heatmap e marker.
    keepGeographicLabelsVisible(state.map,'air');

    const pollutant=openAqPollutant();
    if(pollutant){
      $('mapBadge').textContent=`${pollutant.label} · ultimo dato ≤ ${MAX_AGE_HOURS}h`
    }
    $('avgLabel').textContent='Media ultimi dati';
    $('periodValue').textContent=`≤ ${MAX_AGE_HOURS}h`;
    $('sourceValue').textContent='OpenAQ · Mondo'
  };

  // Initial source is EEA, but normalize controls after the base application
  // has installed its listeners so future source changes use the overrides.
  setModeLock(false);
  setOpenAqPollutantAvailability(false)
})();
