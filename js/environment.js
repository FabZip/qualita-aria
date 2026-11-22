(()=>{
  'use strict';
  const SOURCES={nearby:'Intorno a me',diary:'Diario ambientale',alerts:'Allerte',earthquakes:'Terremoti',fires:'Incendi'};
  const DPC='https://mappe.protezionecivile.gov.it/it/mappe-rischi/bollettino-di-criticita/';
  const EFFIS='https://forest-fire.emergency.copernicus.eu/apps/effis.csv/';
  const REPO='pcm-dpc/DPC-Bollettini-Criticita-Idrogeologica-Idraulica';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const finite=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v));
  const point=p=>p&&finite(p.lat)&&finite(p.lon)&&Math.abs(Number(p.lat))<=90&&Math.abs(Number(p.lon))<=180;
  const distance=(a,b)=>{const r=x=>x*Math.PI/180,h=Math.sin(r(b.lat-a.lat)/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(r(b.lon-a.lon)/2)**2;return 12742*Math.asin(Math.sqrt(Math.min(1,h)))};
  const stamp=v=>{const t=Date.parse(v||'');return Number.isFinite(t)?t:null};
  const date=v=>{if(/^\d{4}-\d{2}-\d{2}$/.test(String(v)))return new Date(`${v}T12:00:00Z`).toLocaleDateString('it-IT',{timeZone:'Europe/Rome'});const t=stamp(v);return t===null?'Data non disponibile':new Date(t).toLocaleString('it-IT',{timeZone:'Europe/Rome'})};
  const day=v=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const link=(url,label)=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?`<a href="${esc(u.href)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`:''}catch{return ''}};
  const memory=new Map(),pending=new Map();
  async function request(url,json=true){
    const key=String(url);const saved=memory.get(key);if(saved&&Date.now()-saved.at<900000)return saved.value;
    if(pending.has(key))return pending.get(key);
    const task=(async()=>{const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);try{const r=await fetch(url,{signal:controller.signal,cache:'no-store'});if(r.status===204)return json?{features:[]}:'';if(!r.ok)throw Error(`Servizio non disponibile (HTTP ${r.status})`);const value=json?await r.json():await r.text();if(memory.size>=64)memory.delete(memory.keys().next().value);memory.set(key,{at:Date.now(),value});return value}finally{clearTimeout(timer)}})();
    pending.set(key,task);try{return await task}finally{pending.delete(key)}
  }
  function quakeUrl(city,days=7,radius=100,now=Date.now()){
    if(!point(city))throw Error('Località non valida');
    const url=new URL('https://webservices.ingv.it/fdsnws/event/1/query');
    url.search=new URLSearchParams({format:'geojson',starttime:new Date(now-days*86400000).toISOString().slice(0,19),endtime:new Date(now).toISOString().slice(0,19),latitude:city.lat,longitude:city.lon,maxradiuskm:radius,orderby:'time',limit:'500',nodata:'204'});return url.href
  }
  function earthquakes(payload,city){
    if(!Array.isArray(payload?.features))throw Error('Catalogo INGV non valido');
    return payload.features.flatMap(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[],where={lat:c[1],lon:c[0]},time=/(Z|[+-]\d{2}:\d{2})$/i.test(String(p.time||''))?String(p.time):`${p.time||''}Z`;if(!point(where)||stamp(time)===null||!finite(p.mag)||!p.eventId)return[];return[{id:`ingv-${p.eventId}`,category:'earthquakes',title:p.place||'Terremoto registrato',date:time,lat:Number(c[1]),lon:Number(c[0]),distance:distance(city,where),status:'Registrato',detail:`Magnitudo ${p.magType||''} ${p.mag} · profondità ${finite(c[2])?`${c[2]} km`:'non disponibile'}`,source:'INGV',url:`https://terremoti.ingv.it/event/${encodeURIComponent(p.eventId)}`} ]})
  }
  function ringContains(ring,x,y){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
  function contains(geometry,city){const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];return polygons.some(rings=>rings?.length&&ringContains(rings[0],Number(city.lon),Number(city.lat))&&!rings.slice(1).some(r=>ringContains(r,Number(city.lon),Number(city.lat))))}
  function alertZones(payload,city){if(!Array.isArray(payload?.features))throw Error('Bollettino geografico non valido');return payload.features.filter(f=>contains(f.geometry,city)).map(f=>({name:f.properties?.['Nome zona']||'Zona di allerta',risks:['idraulico','temporali','idrogeologico'].map(type=>({type,text:f.properties?.[`Per rischio ${type}`]||'Informazione non disponibile'}))}))}
  async function alerts(city){
    const commits=await request(`https://api.github.com/repos/${REPO}/commits?path=files&per_page=1`);
    if(!commits?.[0]?.sha)throw Error('Bollettino ufficiale non disponibile');
    const commit=await request(`https://api.github.com/repos/${REPO}/commits/${commits[0].sha}`);
    const file=(commit.files||[]).map(f=>f.filename?.match(/(?:^|\/)(\d{8}_\d{4})(?:_|\.)/)).find(Boolean)?.[1];
    if(!file)throw Error('Ultimo bollettino non identificabile');
    const root=`https://raw.githubusercontent.com/${REPO}/${commits[0].sha}/files/`;
    const metadata=await request(`${root}${file}.json`);
    const issued=`${file.slice(0,4)}-${file.slice(4,6)}-${file.slice(6,8)}`;
    const tomorrow=new Date(`${issued}T12:00:00Z`);tomorrow.setUTCDate(tomorrow.getUTCDate()+1);
    const dates=[issued,tomorrow.toISOString().slice(0,10)],today=day(Date.now());
    const periods=await Promise.all(['today','tomorrow'].map(async(key,i)=>({date:dates[i],zones:alertZones(await request(`${root}geojson/${file}_${key}.json`),city)})));
    return {title:metadata.name||'Bollettino Protezione Civile',issued,periods,current:periods.filter(p=>p.date>=today),stale:dates[1]<today,url:DPC}
  }
  function treeEvents(events,city){return events.flatMap(e=>{const c=e.coordinates||[],where={lat:c[1],lon:c[0]};return [{id:`tree-${e.id}`,category:'trees',title:e.title||e.locationName||'Intervento arboreo',date:e.eventDate||e.date||null,end:e.eventEndDate||null,lat:point(where)?Number(c[1]):null,lon:point(where)?Number(c[0]):null,distance:point(where)?distance(city,where):null,status:e.status==='planned'&&stamp(e.eventEndDate||e.eventDate||e.date)!==null&&stamp(e.eventEndDate||e.eventDate||e.date)<Date.parse(`${day(Date.now())}T00:00:00Z`)?'Programmato · periodo trascorso':({planned:'Programmato',completed:'Eseguito',emergency_completed:'Urgente eseguito',reported:'Comunicazione ufficiale'})[e.status]||'Da verificare',detail:`${e.eventType==='planting'?'Piantumazione':e.eventType==='decrement'?'Abbattimento':'Tipo da verificare'} · ${finite(e.quantity)?e.quantity:'quantità non indicata'}`,source:e.source?.publisher||'Fonte comunale',url:e.source?.url||e.sourceUrl}]})}
  function filterEvents(events,{category='all',query='',days=30,radius=50,now=Date.now()}={}){
    const q=query.trim().toLocaleLowerCase('it');return events.filter(e=>(category==='all'||e.category===category)&&(!q||`${e.title} ${e.detail} ${e.source} ${e.status}`.toLocaleLowerCase('it').includes(q))&&e.distance!==null&&e.distance<=radius&&stamp(e.end||e.date)!==null&&stamp(e.end||e.date)>=now-days*86400000).sort((a,b)=>(stamp(b.date)||0)-(stamp(a.date)||0)||a.id.localeCompare(b.id))
  }
  function fireTile(period='week'){
    if(!['today','week','month'].includes(period))throw Error('Periodo incendi non valido');
    return `https://maps.effis.emergency.copernicus.eu/effis?service=WMS&version=1.1.1&request=GetMap&layers=modis.ba.${period}&styles=&srs=EPSG:3857&bbox={bbox-epsg-3857}&width=256&height=256&format=image/png&transparent=true`
  }
  globalThis.Environment={point,distance,quakeUrl,earthquakes,contains,alertZones,treeEvents,filterEvents,alerts,fireTile,esc,link};
  if(typeof document==='undefined'||typeof source!=='function')return;
  for(const [key,name] of Object.entries(SOURCES))SOURCE_INFO[key]={name,years:['recent'],description:'',hint:''};
  const $=id=>document.getElementById(id),active=()=>Object.hasOwn(SOURCES,source());
  const baseConfigure=configureSourceUI,baseRender=render;
  let events=[],city=null,view='',map=null,markers=[],renderSequence=0,loadKey='',loadPromise=null,loaded=null;
  function stopMap(){for(const marker of markers)marker.remove();markers=[];map?.remove();map=null}
  const sharedApplied=new Map();
  configureSourceUI=function(){
    $('environmentPanel').classList.toggle('hidden',!active());
    if(!active()){
      const shared=globalThis.SharedLocation?.peek(),key=shared?`${shared.lat}:${shared.lon}`:'';
      if(shared&&['eea','openaq','forecast'].includes(source())&&sharedApplied.get(source())!==key){
        state.eeaCities.set('shared-location',{...shared,id:'shared-location'});
        $('eeaCitySelect').dataset[`${source()}Default`]='true';
        configureTreeCityOptions(false);$('eeaCitySelect').value='shared-location';
        const saved=state.sourceSettings.get(source());if(saved)saved.values.eeaCitySelect='shared-location';
        sharedApplied.set(source(),key);
      }
      if(view){++renderSequence;stopMap();$('environmentBody').replaceChildren();view=''}return baseConfigure()}
    state.mode='map';setTemperatureModeLock(false);globalThis.WeatherRadar?.suspend();clearTemperatureOverlays();window.TreeStats?.clear?.();
    document.documentElement.classList.remove('trees-source','forecast-source');document.documentElement.classList.add('weather-source');
    for(const selector of ['.mode-tabs','.legend-bar','.map-card','.summary','.station-list'])document.querySelector(selector)?.classList.add('hidden');
    for(const id of ['weatherPanel','forecastPanel','eeaScopeField','eeaCityField','pollutantField','temperatureMetricField','singleYearField','monthField','comparePanel','mapHint'])$(id)?.classList.add('hidden');
    $('pollutantSourceField').classList.remove('hidden');$('weatherLocationField').classList.remove('hidden');$('sourceDescription').textContent='';
  };
  function controls(){return `<div class="environment-filters"><label>Ricerca eventi<input id="environmentSearch" type="search" placeholder="Indirizzo, evento o fonte"></label><label>Categoria<select id="environmentCategory"><option value="all">Tutte</option><option value="trees">Alberi</option><option value="earthquakes">Terremoti</option></select></label><label>Periodo<select id="environmentDays"><option value="7">Da 7 giorni fa</option><option value="30" selected>Da 30 giorni fa</option><option value="365">Da un anno fa</option></select></label><label>Distanza<select id="environmentRadius"><option value="10">10 km</option><option value="50" selected>50 km</option><option value="100">100 km</option><option value="200">200 km</option></select></label></div>`}
  function eventHtml(e){return `<article class="environment-event"><span class="environment-tag">${e.category==='trees'?'Alberi':'Terremoti'} · ${esc(e.status)}</span><h3>${esc(e.title)}</h3><p>${esc(date(e.date))}${e.end?` – ${esc(date(e.end))}`:''} · ${e.distance===null?'Posizione non disponibile':`${e.distance.toFixed(1)} km`}</p><p>${esc(e.detail)}</p>${link(e.url,e.source)}</article>`}
  function drawEvents(){
    const list=filterEvents(events,{category:view==='earthquakes'?'earthquakes':$('environmentCategory')?.value||'all',query:$('environmentSearch')?.value||'',days:Number($('environmentDays')?.value||7),radius:Number($('environmentRadius')?.value||100)});
    $('environmentCount').textContent=`${list.length} eventi nei filtri selezionati`;
    $('environmentEvents').innerHTML=list.length?list.map(eventHtml).join(''):'<p>Nessun evento disponibile nei filtri selezionati. Non indica necessariamente assenza di eventi sul territorio.</p>';
    for(const m of markers)m.remove();markers=[];
    if(map)for(const e of list){const marker=new maplibregl.Marker({color:e.category==='earthquakes'?'#f0b657':e.detail.startsWith('Piantumazione')?'#35d07f':'#ef7272'}).setLngLat([e.lon,e.lat]).setPopup(new maplibregl.Popup().setHTML(eventHtml(e))).addTo(map);markers.push(marker)}
    if(map&&list.length){const bounds=new maplibregl.LngLatBounds([Number(city.lon),Number(city.lat)],[Number(city.lon),Number(city.lat)]);for(const e of list)bounds.extend([e.lon,e.lat]);map.fitBounds(bounds,{padding:45,maxZoom:11,duration:0})}
  }
  function makeMap(){if(!globalThis.maplibregl)return;map=new maplibregl.Map({container:'environmentMap',style:MAP_STYLE,cooperativeGestures:true,center:[Number(city.lon),Number(city.lat)],zoom:8});map.addControl(new maplibregl.NavigationControl({showCompass:false}));const current=map;map.on('load',()=>{if(map===current)drawEvents()})}
  async function bounded(task){let timer;try{return await Promise.race([task,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Archivio arboreo non disponibile')),20000))])}finally{clearTimeout(timer)}}
  async function load(city){
    const key=`${city.lat}:${city.lon}`;if(loaded&&loadKey===key&&Date.now()-loaded.at<900000)return loaded;if(loadPromise&&loadKey===key)return loadPromise;
    loadKey=key;const task=(async()=>{
      const year=new Date().getFullYear(),jobs=[request(quakeUrl(city,365,200)).then(p=>({kind:'earthquakes',events:earthquakes(p,city),limited:p.features?.length>=500})),alerts(city).then(data=>({kind:'alerts',data}))];
      for(const cfg of Object.values(TREE_CITY_CONFIG))if(distance(city,{lat:cfg.center[1],lon:cfg.center[0]})<=250)for(const y of [year-1,year])jobs.push(bounded(window.TreeStats.rows(cfg.id,String(y))).then(data=>({kind:'trees',events:treeEvents(data.documentedEvents||[],city),partial:data.diagnostic?.dynamicAvailable===false})));
      const settled=await Promise.allSettled(jobs),items=settled.filter(r=>r.status==='fulfilled').map(r=>r.value),all=[...new Map(items.flatMap(r=>r.events||[]).map(e=>[e.id,e])).values()];
      const result={at:Date.now(),events:all,alerts:items.find(r=>r.kind==='alerts')?.data,errors:settled.filter(r=>r.status==='rejected').length,trees:items.some(r=>r.kind==='trees'),partial:items.some(r=>r.partial),limited:items.some(r=>r.limited),quakeAvailable:items.some(r=>r.kind==='earthquakes')};if(loadKey===key)loaded=result;return result
    })();loadPromise=task;try{return await task}finally{if(loadPromise===task)loadPromise=null}
  }
  function alertHtml(data){if(!data)return `<p>Bollettino non disponibile. ${link(DPC,'Consulta Protezione Civile')}</p>`;return `<h3>${esc(data.title)}</h3>${data.stale?'<p class="environment-warning">Il bollettino disponibile è scaduto: non descrive le allerte attuali.</p>':data.current.map(p=>`<article class="environment-event"><h3>Validità ${esc(p.date)}</h3>${p.zones.length?p.zones.map(z=>`<strong>${esc(z.name)}</strong>${z.risks.map(r=>`<p>${esc(r.type)}: ${esc(r.text)}</p>`).join('')}`).join(''):'<p>Nessuna zona individuata per queste coordinate. Non equivale ad assenza di allerta.</p>'}</article>`).join('')}${link(DPC,'Bollettino ufficiale e aggiornamenti regionali')}<p>La classificazione riguarda la zona di allerta del punto scelto, non una previsione puntuale. Verifica le comunicazioni della tua Regione e del Comune.</p>`}
  function openSource(name){$('sourceSelect').value=name;const shared=globalThis.SharedLocation?.peek();if(shared&&name==='trees'){const nearest=Object.values(TREE_CITY_CONFIG).sort((a,b)=>distance(shared,{lat:a.center[1],lon:a.center[0]})-distance(shared,{lat:b.center[1],lon:b.center[0]}))[0];state.sourceSettings.delete(name);configureTreeCityOptions(true);$('eeaCitySelect').value=nearest.id}if(shared&&['eea','openaq','forecast'].includes(name)){state.eeaCities.set('shared-location',{...shared,id:'shared-location'});state.sourceSettings.delete(name);$('eeaCitySelect').dataset[`${name}Default`]='true';configureTreeCityOptions(false);$('eeaCitySelect').value='shared-location'}changeSource()}
  async function overview(token,data){
    $('environmentBody').innerHTML=`<div class="environment-grid"><article class="environment-card"><h3>Meteo</h3><div id="nearbyWeather">Caricamento…</div><button data-environment-open="weather">Apri meteo</button></article><article class="environment-card"><h3>Qualità dell’aria</h3><div id="nearbyAir">Caricamento…</div><button data-environment-open="forecast">Apri previsioni aria</button><button data-environment-open="eea">Stazioni EEA</button></article><article class="environment-card"><h3>Alberi · entro 50 km</h3><div id="nearbyTrees"></div><button data-environment-open="diary">Apri diario</button><button data-environment-open="trees">Fonti comunali</button></article><article class="environment-card"><h3>Allerte</h3><p>${data.alerts?.stale?'Bollettino scaduto':data.alerts?'Bollettino disponibile: consulta livelli e validità':'Bollettino non disponibile'}</p><button data-environment-open="alerts">Consulta allerte</button></article><article class="environment-card"><h3>Terremoti · entro 100 km</h3><p>${data.quakeAvailable?`${filterEvents(data.events,{category:'earthquakes',days:7,radius:100}).length} eventi registrati negli ultimi 7 giorni`:'Catalogo non disponibile'}</p><button data-environment-open="earthquakes">Apri terremoti</button></article><article class="environment-card"><h3>Incendi</h3><p>Aree bruciate sulla mappa Copernicus EFFIS; accesso al portale per punti caldi e pericolo previsto.</p><button data-environment-open="fires">Apri incendi</button></article></div>`;
    const trees=filterEvents(data.events,{category:'trees',days:30,radius:50}).slice(0,3);$('nearbyTrees').innerHTML=trees.length?trees.map(eventHtml).join(''):data.trees?'<p>Nessun evento documentato nei filtri. Raccolta parziale, non censimento completo.</p>':'<p>Nessuna fonte comunale coperta in questa zona. Attualmente Roma e Guidonia Montecelio.</p>';
    await Promise.allSettled([
      WeatherForecast.fetchWeather(city).then(r=>{if(token!==renderSequence)return;const c=r.payload.current;$('nearbyWeather').innerHTML=`<strong class="environment-value">${finite(c?.temperature_2m)?`${esc(c.temperature_2m)} °C`:'—'}</strong><p>${esc(WeatherForecast.condition(c?.weather_code,c?.is_day)[1])}</p><p>Open-Meteo · stima modellistica · scaricato ${esc(date(new Date(r.savedAt).toISOString()))}</p>`}).catch(()=>{if(token===renderSequence)$('nearbyWeather').textContent='Meteo non disponibile: riprova dalla sezione Meteo.'}),
      AirQualityForecast.fetchForecast(city).then(p=>{if(token!==renderSequence)return;const localNow=new Date(Date.now()+(Number(p.utc_offset_seconds)||0)*1000).toISOString().slice(0,13),i=p.hourly.time.findIndex(t=>t.slice(0,13)>=localNow),a=p.hourly;$('nearbyAir').innerHTML=`<p>PM2.5: ${i>=0&&finite(a.pm2_5?.[i])?esc(a.pm2_5[i]):'—'} µg/m³<br>PM10: ${i>=0&&finite(a.pm10?.[i])?esc(a.pm10[i]):'—'} µg/m³</p><p>Previsione modellistica CAMS / Open-Meteo · ${i>=0?esc(a.time[i].replace('T',' ')):'ora non disponibile'} (${esc(p.timezone||'fuso non disponibile')}). Non sono misure di una stazione.</p>`}).catch(()=>{if(token===renderSequence)$('nearbyAir').textContent='Previsioni aria non disponibili.'})
    ])
  }
  render=async function(){
    if(!active())return baseRender();configureSourceUI();const token=++renderSequence;++state.renderToken;view=source();stopMap();$('environmentPlace').textContent='';$('environmentTitle').textContent=SOURCES[view];$('environmentBody').textContent='Caricamento della località…';$('environmentStatus').textContent='';
    try{city=await SharedLocation.get();if(token!==renderSequence)return;$('weatherSearchStatus').textContent='';$('environmentPlace').textContent=`${city.name} · ${Number(city.lat).toFixed(4)}, ${Number(city.lon).toFixed(4)}`;
      if(view==='fires'){
        const x=Number(city.lon)*20037508.34/180,y=Math.log(Math.tan((90+Math.max(-85.05112878,Math.min(85.05112878,Number(city.lat))))*Math.PI/360))*20037508.34/Math.PI;
        const url=new URL(EFFIS);url.search=new URLSearchParams({c:`${x},${y}`,z:'8'});
        $('environmentBody').innerHTML=`<label>Periodo delle aree bruciate<select id="firePeriod"><option value="today">Ultime 24 ore</option><option value="week" selected>Ultimi 7 giorni</option><option value="month">Ultimi 30 giorni</option></select></label><p>Copernicus EFFIS · aree bruciate rilevate, evidenziate sulla mappa. L’assenza di poligoni non esclude incendi piccoli, recenti o non rilevati. Per punti caldi satellitari e pericolo previsto consulta ${link(url.href,'il visualizzatore ufficiale')}.</p><div id="environmentMap" class="environment-map" aria-label="Mappa delle aree bruciate"></div><p id="fireStatus" role="status">Caricamento aree bruciate…</p>`;
        map=new maplibregl.Map({container:'environmentMap',style:MAP_STYLE,cooperativeGestures:true,center:[Number(city.lon),Number(city.lat)],zoom:8});
        map.addControl(new maplibregl.NavigationControl({showCompass:false}));
        const current=map;
        map.on('load',()=>{if(map!==current)return;map.addSource('effis',{type:'raster',tiles:[fireTile()],tileSize:256,attribution:'Copernicus EFFIS / European Commission JRC'});map.addLayer({id:'effis',type:'raster',source:'effis',paint:{'raster-opacity':.85}})});
        let failed=false;
        map.on('error',e=>{if(map===current&&e.sourceId==='effis'){failed=true;$('fireStatus').textContent='Livello EFFIS non disponibile. Riprova o consulta il visualizzatore ufficiale.'}});
        map.on('idle',()=>{if(map===current&&!failed)$('fireStatus').textContent='Aree bruciate · Copernicus EFFIS. Periodo selezionato; dati satellitari soggetti a revisione.'});
        $('firePeriod').addEventListener('change',()=>{failed=false;$('fireStatus').textContent='Caricamento aree bruciate…';map?.getSource('effis')?.setTiles([fireTile($('firePeriod').value)])});
        return
      }
      $('environmentBody').textContent='Caricamento delle fonti ambientali…';
      const data=await load(city);if(token!==renderSequence)return;events=data.events;
      $('environmentStatus').textContent=`Consultato ${date(new Date(data.at).toISOString())}. ${data.errors?'Una o più fonti non disponibili. ':''}${data.partial?'Archivio arboreo aggiornato non raggiungibile; dati consolidati parziali. ':''}${data.limited&&view!=='alerts'?'INGV: raggiunto il limite di 500 eventi; elenco parziale. ':''}${!data.quakeAvailable?'Catalogo sismico non disponibile. ':''}`;
      if(view==='nearby'){await overview(token,data);return}
      if(view==='alerts'){$('environmentBody').innerHTML=alertHtml(data.alerts);return}
      $('environmentBody').innerHTML=`${controls()}<p>${view==='earthquakes'?'INGV · terremoti registrati, non previsioni. Catalogo dell’ultimo anno entro 200 km, fino a 500 eventi più recenti.':'Eventi arborei documentati di Roma e Guidonia Montecelio e terremoti INGV. Include gli interventi programmati futuri; esclude dalla mappa gli eventi senza posizione o data.'}</p><div id="environmentMap" class="environment-map" aria-label="Mappa degli eventi"></div><p id="environmentCount" role="status"></p><div id="environmentEvents"></div>`;
      if(view==='earthquakes'){$('environmentCategory').value='earthquakes';$('environmentCategory').disabled=true;$('environmentDays').value='7';$('environmentRadius').value='100'}
      makeMap();drawEvents();
    }catch(error){if(token!==renderSequence)return;$('environmentBody').innerHTML=`<p role="alert">${esc(error.message||'Dati non disponibili')}</p>`}
  };
  $('environmentPanel').addEventListener('click',event=>{const button=event.target.closest('[data-environment-open]');if(button)openSource(button.dataset.environmentOpen)});
  $('environmentPanel').addEventListener('input',event=>{if(event.target.id==='environmentSearch')drawEvents()});
  $('environmentPanel').addEventListener('change',event=>{if(['environmentCategory','environmentDays','environmentRadius'].includes(event.target.id))drawEvents()});
  $('environmentRefresh').addEventListener('click',()=>{loaded=null;memory.clear();render()});
  $('eeaCitySelect').addEventListener('change',()=>{
    if(!['eea','openaq','forecast'].includes(source()))return;
    const selected=state.eeaCities.get(eeaCity());if(selected&&selected.id!=='shared-location')SharedLocation.set(selected);
  });
  globalThis.Environment.openSource=openSource;
})();
