(()=>{
  'use strict';

  const API_URL='https://air-quality-api.open-meteo.com/v1/air-quality';
  const FORECAST_DAYS=5;
  const CACHE_TTL_MS=15*60*1000;
  const PERIODS=[
    {id:'night',label:'Notte',from:0,to:5},
    {id:'morning',label:'Mattina',from:6,to:11},
    {id:'afternoon',label:'Pomeriggio',from:12,to:17},
    {id:'evening',label:'Sera',from:18,to:23}
  ];
  const POLLUTANTS={
    PM10:{label:'PM10',variable:'pm10',aqiVariable:'european_aqi_pm10',aqiScale:'eu'},
    'PM2.5':{label:'PM2.5',variable:'pm2_5',aqiVariable:'european_aqi_pm2_5',aqiScale:'eu'},
    CO:{label:'CO',variable:'carbon_monoxide',aqiVariable:'us_aqi_carbon_monoxide',aqiScale:'us'},
    SO2:{label:'SO₂',variable:'sulphur_dioxide',aqiVariable:'european_aqi_sulphur_dioxide',aqiScale:'eu'},
    O3:{label:'O₃',variable:'ozone',aqiVariable:'european_aqi_ozone',aqiScale:'eu'},
    NO2:{label:'NO₂',variable:'nitrogen_dioxide',aqiVariable:'european_aqi_nitrogen_dioxide',aqiScale:'eu'}
  };
  const QUALITY_LABELS=['Ottima','Buona','Moderata','Scarsa','Molto scarsa','Pessima'];
  const cache=new Map();

  function finite(value){
    if(value===null||value===undefined||value==='')return null;
    const number=Number(value);
    return Number.isFinite(number)?number:null
  }

  function average(values){
    const usable=values.map(finite).filter(value=>value!==null);
    return usable.length?usable.reduce((sum,value)=>sum+value,0)/usable.length:null
  }

  function maximum(values){
    const usable=values.map(finite).filter(value=>value!==null);
    return usable.length?Math.max(...usable):null
  }

  function qualityFromAqi(value,scale='eu'){
    const aqi=finite(value);
    if(aqi===null)return null;
    const limits=scale==='us'?[50,100,150,200,300]:[20,40,60,80,100];
    const level=limits.findIndex(limit=>aqi<=limit);
    const normalizedLevel=level===-1?5:level;
    const visualMax=scale==='us'?500:120;
    return{
      value:aqi,
      level:normalizedLevel,
      label:QUALITY_LABELS[normalizedLevel],
      position:Math.max(0,Math.min(100,aqi/visualMax*100)),
      scale
    }
  }

  function buildUrl(city){
    const latitude=finite(city?.lat);
    const longitude=finite(city?.lon);
    if(latitude===null||longitude===null)throw new Error('Coordinate della città non disponibili.');
    const hourly=[...new Set(Object.values(POLLUTANTS).flatMap(item=>[
      item.variable,item.aqiVariable
    ]))];
    const url=new URL(API_URL);
    url.search=new URLSearchParams({
      latitude:String(latitude),
      longitude:String(longitude),
      hourly:hourly.join(','),
      timezone:'auto',
      forecast_days:String(FORECAST_DAYS)
    }).toString();
    return url.toString()
  }

  function periodForHour(hour){
    return PERIODS.find(period=>hour>=period.from&&hour<=period.to)||null
  }

  function aggregateForecast(payload,pollutantKey){
    const config=POLLUTANTS[pollutantKey];
    if(!config)throw new Error(`Inquinante non supportato: ${pollutantKey}`);
    const hourly=payload?.hourly||{};
    const times=Array.isArray(hourly.time)?hourly.time:[];
    const values=Array.isArray(hourly[config.variable])?hourly[config.variable]:[];
    const indices=Array.isArray(hourly[config.aqiVariable])?hourly[config.aqiVariable]:[];
    if(!times.length||!values.length)throw new Error('La previsione non contiene dati orari utilizzabili.');

    const grouped=new Map();
    times.forEach((time,index)=>{
      const text=String(time||'');
      const date=text.slice(0,10);
      const hour=Number(text.slice(11,13));
      const value=finite(values[index]);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(hour)||value===null)return;
      if(!grouped.has(date))grouped.set(date,[]);
      grouped.get(date).push({time:text,hour,value,aqi:finite(indices[index])})
    });

    const days=[...grouped].map(([date,entries])=>{
      const periods=PERIODS.map(period=>{
        const matches=entries.filter(entry=>periodForHour(entry.hour)?.id===period.id);
        const value=average(matches.map(entry=>entry.value));
        const aqi=maximum(matches.map(entry=>entry.aqi));
        return{
          id:period.id,
          label:period.label,
          value,
          max:maximum(matches.map(entry=>entry.value)),
          quality:qualityFromAqi(aqi,config.aqiScale),
          samples:matches.length
        }
      });
      return{
        date,
        mean:average(entries.map(entry=>entry.value)),
        max:maximum(entries.map(entry=>entry.value)),
        quality:qualityFromAqi(maximum(entries.map(entry=>entry.aqi)),config.aqiScale),
        periods,
        samples:entries.length
      }
    });

    const rawUnit=String(payload?.hourly_units?.[config.variable]||'µg/m³');
    return{
      pollutant:pollutantKey,
      label:config.label,
      unit:rawUnit.replace('μ','µ'),
      timezone:String(payload?.timezone_abbreviation||payload?.timezone||''),
      latitude:finite(payload?.latitude),
      longitude:finite(payload?.longitude),
      days
    }
  }

  async function fetchForecast(city,{fetchImpl=globalThis.fetch}={}){
    if(typeof fetchImpl!=='function')throw new Error('Servizio di rete non disponibile.');
    const key=`${Number(city?.lat).toFixed(4)}:${Number(city?.lon).toFixed(4)}`;
    const cached=cache.get(key);
    if(cached&&Date.now()-cached.savedAt<CACHE_TTL_MS)return cached.payload;
    const response=await fetchImpl(buildUrl(city),{cache:'no-store',headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error(`Previsioni qualità dell’aria non disponibili (HTTP ${response.status}).`);
    const payload=await response.json();
    if(!Array.isArray(payload?.hourly?.time))throw new Error('Risposta previsionale non valida.');
    cache.set(key,{savedAt:Date.now(),payload});
    return payload
  }

  const api={
    API_URL,FORECAST_DAYS,PERIODS,POLLUTANTS,
    buildUrl,qualityFromAqi,aggregateForecast,fetchForecast,
    clearCache:()=>cache.clear()
  };
  globalThis.AirQualityForecast=api;

  if(typeof document==='undefined'||typeof source!=='function')return;

  const BASE_POLLUTANTS=[
    {value:'PM2.5',label:'PM2.5'},
    {value:'PM10',label:'PM10'},
    {value:'NO2',label:'NO₂'}
  ];
  const FORECAST_POLLUTANTS=Object.entries(POLLUTANTS).map(([value,item])=>({value,label:item.label}));
  const baseFillYears=fillYears;
  const baseConfigureSourceUI=configureSourceUI;
  const baseSetLoading=setLoading;
  const baseRender=render;

  SOURCE_INFO.forecast={
    name:'Previsioni qualità dell’aria',
    years:['forecast'],
    description:'<strong>Previsioni:</strong> andamento atteso nei prossimi cinque giorni per la città selezionata. Sono stime modellistiche, non misure di stazione.',
    hint:'Valori previsti per la città selezionata.'
  };

  function isForecast(){return source()==='forecast'}

  function setPollutantOptions(forecast){
    const select=$('pollutantSelect');
    if(!select)return;
    const desired=forecast?FORECAST_POLLUTANTS:BASE_POLLUTANTS;
    const signature=forecast?'forecast':'observed';
    if(select.dataset.pollutantSet===signature)return;
    const previous=select.value;
    select.replaceChildren(...desired.map(item=>{
      const option=document.createElement('option');
      option.value=item.value;
      option.textContent=item.label;
      return option
    }));
    select.value=desired.some(item=>item.value===previous)?previous:'PM2.5';
    select.dataset.pollutantSet=signature
  }

  function forceMapMode(){
    state.mode='map';
    document.querySelectorAll('.tab').forEach(button=>{
      button.classList.toggle('active',button.dataset.mode==='map')
    })
  }

  function setForecastLayout(active){
    document.documentElement.classList.toggle('forecast-source',active);
    $('forecastPanel')?.classList.toggle('hidden',!active);
    document.querySelector('.mode-tabs')?.classList.toggle('hidden',active);
    document.querySelector('.legend-bar')?.classList.toggle('hidden',active);
    document.querySelector('.map-card')?.classList.toggle('hidden',active);
    document.querySelector('.summary')?.classList.toggle('hidden',active);
    document.querySelector('.station-list')?.classList.toggle('hidden',active);
    $('mapHint')?.classList.toggle('hidden',active);
    $('arpaHistoryPanel')?.classList.add('hidden');
    if(active){
      $('comparePanel')?.classList.add('hidden');
      $('singleYearField')?.classList.add('hidden');
      $('monthField')?.classList.add('hidden')
    }
  }

  function configureForecastUi(){
    forceMapMode();
    setPollutantOptions(true);
    setForecastLayout(true);
    configureTreeCityOptions(false);
    $('sourceDescription').innerHTML=SOURCE_INFO.forecast.description;
    $('eeaScopeField')?.classList.add('hidden');
    $('eeaCityField')?.classList.remove('hidden');
    $('arpaCityField')?.classList.add('hidden');
    $('pollutantField')?.classList.remove('hidden');
    $('treeLegend')?.classList.add('hidden');
    $('temperatureMetricField')?.classList.add('hidden')
  }

  fillYears=function(){
    if(!isForecast())return baseFillYears();
    for(const id of ['yearSelect','compareYearA','compareYearB']){
      const select=$(id);
      if(!select)continue;
      select.innerHTML='<option value="forecast">Prossimi 5 giorni</option>';
      select.value='forecast'
    }
  };

  configureSourceUI=function(){
    if(isForecast())return configureForecastUi();
    setForecastLayout(false);
    setPollutantOptions(false);
    return baseConfigureSourceUI()
  };

  setLoading=function(on){
    if(!isForecast())return baseSetLoading(on);
    $('loadingOverlay').classList.toggle('hidden',!on);
    $('loadingText').textContent='Caricamento previsioni qualità dell’aria…'
  };

  function escapeHtml(value){
    return String(value??'').replace(/[&<>"]/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'
    })[char])
  }

  function formatValue(value){
    if(!Number.isFinite(value))return'—';
    return Number(value).toLocaleString('it-IT',{
      minimumFractionDigits:value>=100?0:1,
      maximumFractionDigits:value>=100?0:1
    })
  }

  function dayLabel(date,index){
    const parsed=new Date(`${date}T12:00:00`);
    if(Number.isNaN(parsed.getTime()))return date;
    const formatted=new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric'}).format(parsed);
    return index===0?`Oggi · ${formatted}`:formatted
  }

  function qualityBadge(quality){
    if(!quality)return'<span class="forecast-quality forecast-quality-neutral">Valore previsto</span>';
    return`<span class="forecast-quality forecast-quality-${quality.level}">${escapeHtml(quality.label)}</span>`
  }

  function scaleHtml(quality){
    if(!quality)return'<span class="forecast-scale forecast-scale-neutral"></span>';
    return`<span class="forecast-scale"><i style="--forecast-position:${quality.position.toFixed(1)}%"></i></span>`
  }

  function renderPeriod(period,unit){
    return`<div class="forecast-period">
      <span class="forecast-period-name">${escapeHtml(period.label)}</span>
      <strong>${formatValue(period.value)} <small>${escapeHtml(unit)}</small></strong>
      ${scaleHtml(period.quality)}
      ${qualityBadge(period.quality)}
    </div>`
  }

  function renderDay(day,index,unit){
    return`<details class="forecast-day" ${index===0?'open':''}>
      <summary>
        <span class="forecast-date">${escapeHtml(dayLabel(day.date,index))}</span>
        ${qualityBadge(day.quality)}
        <span><small>Max</small> ${formatValue(day.max)} ${escapeHtml(unit)}</span>
        <span><small>Media</small> ${formatValue(day.mean)} ${escapeHtml(unit)}</span>
      </summary>
      <div class="forecast-day-detail">
        <h3>Dettaglio della giornata</h3>
        ${day.periods.map(period=>renderPeriod(period,unit)).join('')}
      </div>
    </details>`
  }

  function selectedCity(){
    return state.eeaCities.get(eeaCity())||state.eeaCities.get(EEA_DEFAULT_CITY)
  }

  function focusCity(city){
    if(!state.map||!city)return;
    withMapRefreshSuppressed(()=>state.map.jumpTo({center:[Number(city.lon),Number(city.lat)],zoom:9.5}))
  }

  async function renderForecast(){
    if(!state.map)return;
    const token=++state.renderToken;
    setLoading(true);
    configureForecastUi();
    clearTemperatureOverlays();
    window.TreeStats?.clear?.();
    showAirOnSingle([]);
    const panel=$('forecastPanel');
    const days=$('forecastDays');
    if(days)days.innerHTML='<div class="forecast-empty">Caricamento delle previsioni…</div>';
    try{
      const city=selectedCity();
      if(!city)throw new Error('Città non disponibile.');
      const pollutant=$('pollutantSelect').value;
      const payload=await fetchForecast(city);
      const forecast=aggregateForecast(payload,pollutant);
      if(token!==state.renderToken)return;
      focusCity(city);
      $('forecastTitle').textContent=`${forecast.label} · ${city.name}`;
      $('forecastSubtitle').textContent='Previsione per i prossimi cinque giorni';
      days.innerHTML=forecast.days.length
        ?forecast.days.map((day,index)=>renderDay(day,index,forecast.unit)).join('')
        :'<div class="forecast-empty">Nessuna previsione disponibile.</div>';
      $('forecastAttribution').innerHTML='Previsioni modellistiche · <a href="https://open-meteo.com/en/docs/air-quality-api" target="_blank" rel="noopener noreferrer">Open-Meteo / CAMS</a>. Non sono misure di stazione.';
      diagnostics({
        source:'Open-Meteo / CAMS',city:city.name,pollutant:forecast.label,
        timezone:forecast.timezone,days:forecast.days.length,
        latitude:forecast.latitude,longitude:forecast.longitude
      })
    }catch(error){
      console.error(error);
      if(token!==state.renderToken)return;
      panel?.classList.remove('hidden');
      if(days)days.innerHTML='<div class="forecast-empty">Previsioni temporaneamente non disponibili.</div>';
      showToast(error.message||'Errore nel caricamento delle previsioni')
    }finally{
      if(token===state.renderToken)setLoading(false)
    }
  }

  render=async function(){
    if(isForecast())return renderForecast();
    return baseRender()
  };

  $('eeaCitySelect')?.addEventListener('change',()=>{
    if(!isForecast())return;
    render()
  });

})();
