(()=>{
  'use strict';
  const TTL=15*60*1000,cache=new Map(),inflight=new Map();
  const fields={current:'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,is_day,snowfall',hourly:'temperature_2m,precipitation_probability,precipitation,weather_code,wind_speed_10m,is_day,snowfall,snow_depth',daily:'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,snowfall_sum'};
  const number=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))?Number(value):null;
  const format=(value,unit='')=>number(value)===null?'—':`${Number(value).toLocaleString('it-IT',{maximumFractionDigits:1})}${unit}`;
  const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const locationCache=new Map(),locationInflight=new Map();
  function coordinateLabel(lat,lon){
    if(number(lat)===null||number(lon)===null||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)return 'Coordinate non disponibili';
    return `${Math.abs(Number(lat)).toFixed(5)}° ${Number(lat)<0?'S':'N'} · ${Math.abs(Number(lon)).toFixed(5)}° ${Number(lon)<0?'O':'E'}`
  }
  function distanceKm(a,b){
    const rad=value=>Number(value)*Math.PI/180;
    const dlat=rad(b.lat-a.lat),dlon=rad(b.lon-a.lon);
    const h=Math.sin(dlat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dlon/2)**2;
    return 6371*2*Math.asin(Math.sqrt(Math.min(1,h)))
  }
  function localityName(payload,city){
    // Never present an IP-derived place as the browser's detected position.
    if(!/coordinate|reverse/i.test(String(payload?.lookupSource||'')))return null;
    const lat=number(payload.latitude),lon=number(payload.longitude);
    if(lat===null||lon===null||distanceKm(city,{lat,lon})>1)return null;
    if(!payload.locality&&!payload.city)return null;
    return [...new Set([payload.locality,payload.city,payload.principalSubdivision,payload.countryName].filter(value=>typeof value==='string'&&value.trim()).map(value=>value.trim()))].join(' · ')
  }
  async function resolveLocation(city){
    if(!city.geolocated)return city;
    const key=`${Number(city.lat).toFixed(5)}:${Number(city.lon).toFixed(5)}`;
    const saved=locationCache.get(key);
    if(saved&&Date.now()-saved.savedAt<TTL)return {...city,name:saved.name,locationResolved:true};
    if(locationInflight.has(key))return {...city,...await locationInflight.get(key)};
    const task=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
      try{
        // Client-side endpoint: only freshly consented device coordinates, never catalog cities or IP fallback.
        const url=new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
        url.search=new URLSearchParams({latitude:String(city.lat),longitude:String(city.lon),localityLanguage:'it'}).toString();
        const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw Error('Località non disponibile');
        const name=localityName(await response.json(),city);
        if(!name)throw Error('Località non identificata');
        locationCache.set(key,{name,savedAt:Date.now()});
        return {name,locationResolved:true}
      }catch{return {name:'La tua posizione',locationResolved:false}}
      finally{clearTimeout(timer)}
    })();
    locationInflight.set(key,task);
    try{return {...city,...await task}}finally{locationInflight.delete(key)}
  }
  function locationDetails(payload,city){
    return `<p class="weather-position">${escape(coordinateLabel(city.lat,city.lon))}${city.geolocated&&number(city.accuracy)!==null?` · accuratezza circa ${format(city.accuracy,' m')}`:''}${city.geolocated&&!city.locationResolved?' · nome della località non disponibile':''}${city.postalCode?' · punto di riferimento della località, non indirizzo preciso':''}</p>`
  }
  function searchUrl(query){
    const name=String(query||'').trim();
    if(name.length<3||name.length>100)throw Error('Inserisci almeno 3 caratteri, massimo 100.');
    const url=new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search=new URLSearchParams({name,count:'6',language:'it',format:'json'}).toString();return url.href
  }
  function searchLocations(payload){
    return (Array.isArray(payload?.results)?payload.results:[]).filter(item=>item?.name&&number(item.latitude)!==null&&number(item.longitude)!==null&&Math.abs(Number(item.latitude))<=90&&Math.abs(Number(item.longitude))<=180).map(item=>({id:String(item.id),lat:Number(item.latitude),lon:Number(item.longitude),timezone:item.timezone,name:[...new Set([item.name,item.admin2,item.admin1,item.country].filter(Boolean))].join(' · ')}))
  }
  function postalCode(query){
    return String(query||'').trim().match(/^(?:IT[-\s]*)?(\d{5})(?:\s*,?\s*(?:Italia|Italy|IT))?$/i)?.[1]||null
  }
  function postalLocations(payload,code){
    const entries=payload?.codes?.[code];
    if(!Array.isArray(entries))return[];
    return entries.filter(row=>Array.isArray(row)&&row[0]&&number(row[3])!==null&&number(row[4])!==null&&Math.abs(Number(row[3]))<=90&&Math.abs(Number(row[4]))<=180).map((row,i)=>({id:`it-postal-${code}-${i}`,postalCode:code,lat:Number(row[3]),lon:Number(row[4]),timezone:'Europe/Rome',coordinatePrecision:'locality',name:[code,...new Set([row[0],row[1],row[2],'Italia'].filter(Boolean))].join(' · ')}))
  }
  let postalData=null,postalPending=null;
  async function findLocations(query,signal){
    const code=postalCode(query);
    if(code){
      if(!postalData){
        if(!postalPending)postalPending=(async()=>{
          const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
          try{
          const response=await fetch('data/italian-postal-codes.json?v=1.1.8',{signal:controller.signal});
          if(!response.ok)throw Error('Catalogo CAP temporaneamente non disponibile. Cerca il nome del comune.');
          const payload=await response.json();if(!payload?.codes||typeof payload.codes!=='object')throw Error('Catalogo CAP non valido. Cerca il nome del comune.');
          postalData=payload;return payload
          }finally{clearTimeout(timer)}
        })().finally(()=>postalPending=null);
        await postalPending;
      }
      if(signal?.aborted)throw new DOMException('Ricerca annullata','AbortError');
      return postalLocations(postalData,code)
    }
    if(/^\d+$/.test(String(query).trim()))throw Error('Per un CAP italiano inserisci tutte le 5 cifre, compresi gli zeri iniziali.');
    const response=await fetch(searchUrl(query),{signal,cache:'no-store'});
    if(!response.ok)throw Error('Ricerca temporaneamente non disponibile.');
    return searchLocations(await response.json())
  }
  function condition(code,day=1){
    const n=number(code);
    if(n===null)return['🌡️','Condizioni non disponibili'];
    if(n===0)return[day?'☀️':'🌙','Sereno'];
    if([1,2,3].includes(n))return[n===3?'☁️':'⛅',n===3?'Coperto':'Parzialmente nuvoloso'];
    if([45,48].includes(n))return['🌫️','Nebbia'];
    if([51,53,55,56,57].includes(n))return['🌦️','Pioviggine'];
    if([61,63,65,66,67,80,81,82].includes(n))return['🌧️','Pioggia'];
    if([71,73,75,77,85,86].includes(n))return['🌨️','Neve'];
    if([95,96,99].includes(n))return['⛈️','Temporali'];
    return['🌡️','Condizioni non disponibili']
  }
  function buildUrl(city){
    const lat=number(city?.lat),lon=number(city?.lon);
    if(lat===null||lon===null||Math.abs(lat)>90||Math.abs(lon)>180)throw Error('Coordinate meteo non valide.');
    const url=new URL('https://api.open-meteo.com/v1/forecast');
    url.search=new URLSearchParams({latitude:String(lat),longitude:String(lon),...fields,timezone:'auto',forecast_days:'7',temperature_unit:'celsius',wind_speed_unit:'kmh',precipitation_unit:'mm'}).toString();
    return url.href
  }
  function validate(payload){
    if(!payload?.current||!Array.isArray(payload?.hourly?.time)||!Array.isArray(payload?.daily?.time)||!payload.daily.time.length||!payload.timezone)throw Error('Risposta meteo non valida.');
    if(number(payload.current.temperature_2m)===null&&!payload.hourly.temperature_2m?.some(v=>number(v)!==null))throw Error('Previsioni meteo prive di temperature.');
    return payload
  }
  async function fetchWeather(city){
    const url=buildUrl(city),key=`aria-weather-snow:${city.lat}:${city.lon}`;
    let saved=cache.get(key);
    if(!saved)try{saved=JSON.parse(localStorage.getItem(key)||'null')}catch{}
    if(saved&&Date.now()-saved.savedAt>=0&&Date.now()-saved.savedAt<TTL){try{validate(saved.payload);return saved}catch{}}
    if(inflight.has(key))return inflight.get(key);
    const task=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
      try{
        const response=await fetch(url,{signal:controller.signal,cache:'no-store'});
        if(!response.ok)throw Error(response.status===429?'Limite meteo raggiunto. Riprova tra qualche minuto.':`Servizio meteo non disponibile (HTTP ${response.status}).`);
        const result={payload:validate(await response.json()),savedAt:Date.now()};cache.set(key,result);
        try{localStorage.setItem(key,JSON.stringify(result))}catch{}
        return result
      }catch(error){if(error.name==='AbortError')throw Error('Il servizio meteo non risponde. Riprova.');throw error}finally{clearTimeout(timer)}
    })();
    inflight.set(key,task);try{return await task}finally{inflight.delete(key)}
  }
  function hourlyRows(payload){
    const start=String(payload.current.time||'').slice(0,13)+':00';
    return payload.hourly.time.map((time,i)=>({time,temperature:payload.hourly.temperature_2m?.[i],rain:payload.hourly.precipitation?.[i],probability:payload.hourly.precipitation_probability?.[i],code:payload.hourly.weather_code?.[i],isDay:payload.hourly.is_day?.[i],wind:payload.hourly.wind_speed_10m?.[i]})).filter(row=>row.time>=start).slice(0,24)
  }
  const dayLabel=date=>new Intl.DateTimeFormat('it-IT',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(`${date}T12:00:00Z`));
  function renderContent(payload,city,savedAt){
    const c=payload.current,[icon,label]=condition(c.weather_code,c.is_day);
    return`<header class="weather-head ui-panel"><div><p class="weather-kicker">Previsioni meteo · ${escape(city.name)}</p><h2><span aria-hidden="true">${icon}</span> ${format(c.temperature_2m,' °C')}</h2><p>${label} · percepita ${format(c.apparent_temperature,' °C')}</p></div><p class="weather-update">Ora locale ${escape(c.time?.slice(11,16))}<br>${escape(payload.timezone)}<br>Scaricato alle ${new Date(savedAt).toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'})}</p></header>
      ${locationDetails(payload,city)}
      <div class="weather-metrics ui-panel"><article class="ui-card">Umidità<strong>${format(c.relative_humidity_2m,' %')}</strong></article><article class="ui-card">Vento<strong>${format(c.wind_speed_10m,' km/h')}</strong></article><article class="ui-card">Precipitazioni<strong>${format(c.precipitation,' mm')}</strong></article></div>
      <!--weather-radar--><h3>Prossime 24 ore</h3><div class="weather-scroll" tabindex="0" role="region" aria-label="Previsioni orarie, scorri orizzontalmente"><div class="weather-hours">${hourlyRows(payload).map(row=>{const [symbol,text]=condition(row.code,row.isDay);return`<article class="ui-card"><time datetime="${escape(row.time)}">${escape(row.time.slice(8,10))}/${escape(row.time.slice(5,7))} · ${escape(row.time.slice(11,16))}</time><span role="img" aria-label="${text}">${symbol}</span><strong>${format(row.temperature,'°')}</strong><small>Pioggia ${format(row.probability,'%')}<br>${format(row.rain,' mm')} · ${format(row.wind,' km/h')}</small></article>`}).join('')}</div></div>
      <h3>Previsioni a 7 giorni</h3><p class="weather-kicker">Temperature minime / massime</p><div class="weather-days ui-panel">${payload.daily.time.slice(0,7).map((date,i)=>{const d=payload.daily,[symbol,text]=condition(d.weather_code?.[i]);return`<article class="ui-card"><time datetime="${escape(date)}">${escape(dayLabel(date))}</time><span class="weather-condition"><span aria-hidden="true">${symbol}</span> ${text}</span><strong>${format(d.temperature_2m_min?.[i],'°')} / ${format(d.temperature_2m_max?.[i],'°')}</strong><small>Pioggia ${format(d.precipitation_probability_max?.[i],'%')} · ${format(d.precipitation_sum?.[i],' mm')}<br>Vento max ${format(d.wind_speed_10m_max?.[i],' km/h')}</small></article>`}).join('')}</div>
      <p class="weather-attribution">Dati e previsioni modellistiche di <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a>. Le condizioni attuali sono stime del modello. Orari della località selezionata. Ricerca località: <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noopener noreferrer">Open-Meteo / GeoNames</a>. CAP italiani: <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a> (CC BY 4.0).</p>${city.geolocated?'<p class="weather-attribution">Nome località tramite coordinate: <a href="https://www.bigdatacloud.com/" target="_blank" rel="noopener noreferrer">BigDataCloud</a> · <a href="https://www.bigdatacloud.com/privacy-policy" target="_blank" rel="noopener noreferrer">Privacy</a>.</p>':''}`
  }
  globalThis.WeatherForecast={buildUrl,fetchWeather,condition,hourlyRows,renderContent,validate,coordinateLabel,distanceKm,localityName,resolveLocation,locationDetails,searchUrl,searchLocations,postalCode,postalLocations,findLocations};
  if(typeof document==='undefined'||typeof source!=='function')return;
  SOURCE_INFO.weather={name:'Meteo · Open-Meteo',years:['forecast'],description:'<strong>Meteo:</strong> situazione attuale stimata, prossime 24 ore e previsioni a 7 giorni per la città selezionata. Dati Open-Meteo.',hint:''};
  const baseConfigure=configureSourceUI,baseRender=render;
  let selection=null,geoPromise=null,geoSaved=null,searchTimer=null,searchController=null,searchSequence=0,results=[];
  const locationSource=()=>['weather','nearby','diary','alerts','earthquakes','fires','snow'].includes(source());
  const weather=()=>source()==='weather'&&!isTemperature();
  function layout(active){
    $('weatherPanel').classList.toggle('hidden',!active);
    if(!active)return;
    document.documentElement.classList.remove('trees-source','forecast-source');
    for(const selector of ['.mode-tabs','.legend-bar','.map-card','.summary','.station-list'])document.querySelector(selector)?.classList.add('hidden');
    for(const id of ['forecastPanel','eeaScopeField','pollutantField','temperatureMetricField','singleYearField','monthField','comparePanel','mapHint'])$(id)?.classList.add('hidden');
  }
  configureSourceUI=function(){
    $('weatherPanel').classList.add('hidden');
    document.documentElement.classList.toggle('weather-source',weather());
    $('weatherLocationField')?.classList.toggle('hidden',!weather());
    if(!weather()){globalThis.WeatherRadar?.suspend();searchSequence++;searchController?.abort();clearTimeout(searchTimer);return baseConfigure()}
    state.mode='map';
    setTemperatureModeLock(false);
    $('eeaCityField').classList.add('hidden');
    $('sourceDescription').innerHTML=SOURCE_INFO.weather.description;
    layout(true)
  };
  async function selectedCity(){
    if(selection)return selection;
    if(geoSaved&&Date.now()-geoSaved.savedAt<300000)return geoSaved.city;
    if(geoPromise)return geoPromise;
    if(!navigator.geolocation)throw Error('Geolocalizzazione non disponibile. Cerca una località.');
    geoPromise=new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(position=>{
      const city={name:'La tua posizione',lat:position.coords.latitude,lon:position.coords.longitude,geolocated:true,accuracy:position.coords.accuracy,locatedAt:position.timestamp};
      geoSaved={savedAt:Date.now(),city};resolve(city)
    },()=>reject(Error('Posizione non disponibile. Consenti la geolocalizzazione oppure cerca una località.')),{enableHighAccuracy:false,timeout:10000,maximumAge:300000}));
    try{return await geoPromise}finally{geoPromise=null}
  }
  function chooseLocation(city){
    if(city){buildUrl(city);if(!city.name)throw Error('Nome della località mancante')}
    selection=city;searchSequence++;searchController?.abort();clearTimeout(searchTimer);
    $('weatherSearchResults').innerHTML='';
    $('weatherSearchStatus').textContent=city?'':'Ricerca della tua posizione…';
    if(city)$('weatherSearch').value=city.name;
    else{$('weatherSearch').value='';geoSaved=null}
    return render()
  }
  async function runSearch(){
    clearTimeout(searchTimer);const token=++searchSequence;searchController?.abort();
    const query=$('weatherSearch').value.trim();results=[];$('weatherSearchResults').innerHTML='';
    if(selection&&query===selection.name){$('weatherSearchStatus').textContent='';return}
    if(query.length<3){$('weatherSearchStatus').textContent='Digita almeno 3 caratteri.';return}
    searchController=new AbortController();const controller=searchController;
    const timeout=setTimeout(()=>controller.abort(),10000);
    $('weatherSearchStatus').textContent='Ricerca località…';
    try{
      const found=await findLocations(query,controller.signal);if(token!==searchSequence||!locationSource())return;
      results=found;
      $('weatherSearchResults').innerHTML=results.map((city,i)=>`<li><button type="button" data-weather-place="${i}">${escape(city.name)}</button></li>`).join('');
      $('weatherSearchStatus').textContent=results.length?`${results.length} risultati. Scegli la località.`:postalCode(query)?'CAP italiano non trovato nel catalogo. Cerca il nome del comune.':'Nessuna località trovata. Prova con un nome diverso.'
    }catch(error){if(token===searchSequence&&locationSource())$('weatherSearchStatus').textContent=error.name==='AbortError'?'Ricerca interrotta. Riprova.':error.message}
    finally{clearTimeout(timeout)}
  }
  render=async function(){
    if(!weather())return baseRender();
    const token=++state.renderToken;
    configureSourceUI();clearTemperatureOverlays();window.TreeStats?.clear?.();
    $('weatherContent').innerHTML='<p role="status">Caricamento delle previsioni…</p>';
    $('weatherForecastContent').innerHTML='';
    globalThis.WeatherRadar?.suspend();
    $('weatherPanel').setAttribute('aria-busy','true');
    try{
      const city=await selectedCity();if(token!==state.renderToken)return;
      globalThis.WeatherRadar?.show(city);
      const [result,locatedCity]=await Promise.all([fetchWeather(city),resolveLocation(city)]);if(token!==state.renderToken)return;
      const [current,forecast]=renderContent(result.payload,locatedCity,result.savedAt).split('<!--weather-radar-->');
      $('weatherContent').innerHTML=current;
      $('weatherForecastContent').innerHTML=forecast||'';
      if(!$('weatherSearch').value||$('weatherSearch').value===locatedCity.name)$('weatherSearchStatus').textContent='';
    }catch(error){if(token!==state.renderToken)return;$('weatherContent').innerHTML=`<p role="alert">${escape(error.message||'Meteo temporaneamente non disponibile.')}</p><button type="button" data-weather-retry>Riprova</button>`}
    finally{if(token===state.renderToken)$('weatherPanel').setAttribute('aria-busy','false')}
  };
  $('weatherSearchForm').addEventListener('submit',event=>{event.preventDefault();return runSearch()});
  $('weatherSearch').addEventListener('input',()=>{searchSequence++;searchController?.abort();clearTimeout(searchTimer);$('weatherSearchResults').innerHTML='';searchTimer=setTimeout(runSearch,450)});
  $('weatherSearchResults').addEventListener('click',event=>{const button=event.target.closest('[data-weather-place]');if(button&&results[Number(button.dataset.weatherPlace)])chooseLocation(results[Number(button.dataset.weatherPlace)])});
  $('weatherGeolocate').addEventListener('click',()=>chooseLocation(null));
  globalThis.SharedLocation={
    get:async()=>resolveLocation(await selectedCity()),
    peek:()=>selection||geoSaved?.city||null,
    set:city=>{buildUrl(city);selection=city;$('weatherSearch').value=city.name;$('weatherSearchStatus').textContent='';$('weatherSearchResults').innerHTML='';searchSequence++;searchController?.abort();clearTimeout(searchTimer)}
  };
  Object.assign(globalThis.WeatherForecast,{chooseLocation});
  $('weatherPanel').addEventListener('click',event=>{if(event.target.closest('[data-weather-retry]')&&weather())render()});
})();
