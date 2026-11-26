(()=>{
  'use strict';
  const SOURCES={nearby:'Intorno a me',diary:'Diario ambientale',alerts:'Allerte',snow:'Neve',earthquakes:'Terremoti',fires:'Incendi'};
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
  async function request(url,json=true,ttl=900000){
    const key=String(url);const saved=memory.get(key);if(saved&&Date.now()-saved.at<ttl)return saved.value;
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
    return payload.features.flatMap(f=>{const p=f.properties||{},c=f.geometry?.coordinates||[],where={lat:c[1],lon:c[0]},time=/(Z|[+-]\d{2}:\d{2})$/i.test(String(p.time||''))?String(p.time):`${p.time||''}Z`;if(!point(where)||stamp(time)===null||!finite(p.mag)||!p.eventId)return[];return[{id:`ingv-${p.eventId}`,category:'earthquakes',title:p.place||'Terremoto registrato',date:time,lat:Number(c[1]),lon:Number(c[0]),distance:point(city)?distance(city,where):null,magnitude:Number(p.mag),depth:finite(c[2])?Number(c[2]):null,magnitudeType:String(p.magType||''),status:'Registrato',detail:`Magnitudo ${p.magType||''} ${p.mag} · profondità ${finite(c[2])?`${c[2]} km`:'non disponibile'}`,source:'INGV',url:`https://terremoti.ingv.it/event/${encodeURIComponent(p.eventId)}`} ]})
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
  function latestQuakeUrl(){return 'https://webservices.ingv.it/fdsnws/event/1/query?format=geojson&orderby=time&limit=1&nodata=204'}
  function latestFireUrl(){
    const url=new URL('https://maps.effis.emergency.copernicus.eu/effis');
    url.search=new URLSearchParams({service:'WFS',version:'1.1.0',request:'GetFeature',typename:'modis.ba.poly',outputFormat:'application/json; subtype=geojson',srsName:'EPSG:4326',sortBy:'FIREDATE D',maxFeatures:'1'});return url.href
  }
  function fireEvent(payload){
    if(!Array.isArray(payload?.features))throw Error('Catalogo EFFIS non valido');
    const feature=payload.features[0];if(!feature)return null;
    const p=feature.properties||{},geometry=feature.geometry,coords=[];
    if(!['Polygon','MultiPolygon'].includes(geometry?.type))throw Error('Geometria EFFIS non valida');
    const visit=a=>{if(!Array.isArray(a))return;if(a.length>=2&&!Array.isArray(a[0])){if(point({lat:a[1],lon:a[0]}))coords.push([Number(a[0]),Number(a[1])])}else a.forEach(visit)};visit(geometry.coordinates);
    const raw=String(p.FIREDATE||''),dateOnly=raw.slice(0,10);
    if(!coords.length||!/^\d{4}-\d{2}-\d{2}/.test(raw)||stamp(dateOnly)===null||!p.id)throw Error('Rilevamento EFFIS incompleto');
    const bounds=[[Infinity,Infinity],[-Infinity,-Infinity]];for(const c of coords){bounds[0][0]=Math.min(bounds[0][0],c[0]);bounds[0][1]=Math.min(bounds[0][1],c[1]);bounds[1][0]=Math.max(bounds[1][0],c[0]);bounds[1][1]=Math.max(bounds[1][1],c[1])}
    let country=p.COUNTRY;try{if(/^[A-Z]{2}$/.test(country))country=new Intl.DisplayNames(['it'],{type:'region'}).of(country)}catch{}
    const place=[p.COMMUNE,p.PROVINCE,country].filter(v=>v&&v!=='N.A.');
    return {id:`effis-${p.id}`,category:'fires',title:place.join(' · ')||`Area bruciata ${p.id}`,date:dateOnly,sourceTime:raw,updated:String(p.LASTUPDATE||''),lat:(bounds[0][1]+bounds[1][1])/2,lon:(bounds[0][0]+bounds[1][0])/2,distance:null,bounds,geometry,status:'Area bruciata rilevata',detail:`Superficie ${finite(p.AREA_HA)?`${Number(p.AREA_HA).toLocaleString('it-IT')} ha`:'non disponibile'}`,source:'Copernicus EFFIS / JRC',url:EFFIS}
  }
  async function latestEvent(kind){
    const payload=await request(kind==='fires'?latestFireUrl():latestQuakeUrl(),true,60000);
    if(kind==='fires')return fireEvent(payload);
    const row=earthquakes(payload)[0];return row||null
  }
  function magnitudeHtml(e){return e.category==='earthquakes'&&finite(e.magnitude)?`<strong class="earthquake-magnitude"><span>Magnitudo ${esc(e.magnitudeType||'')}</span>${Number(e.magnitude).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}</strong>`:''}
  function eventHtml(e){return `<article class="environment-event" data-environment-focus="${esc(e.id)}"><span class="environment-tag">${e.category==='trees'?'Alberi':e.category==='fires'?'Incendi':'Terremoti'} · ${esc(e.status)}</span>${magnitudeHtml(e)}<h3><button type="button" class="environment-event-focus" data-environment-focus="${esc(e.id)}">${esc(e.title)}</button></h3><p>${esc(date(e.date))}${e.end?` – ${esc(date(e.end))}`:''}${e.distance===null?'':` · ${e.distance.toFixed(1)} km`}</p><p>${esc(e.category==='earthquakes'?`Profondità ${finite(e.depth)?`${e.depth} km`:'non disponibile'}`:e.detail)}</p>${link(e.url,e.source)}</article>`}
  const iconPaths={snow:'<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M3 10l4-1-1-4M18 19l-1-4 4-1M3 14l4 1-1 4M18 5l-1 4 4 1"/>',diary:'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',weather:'<circle cx="9" cy="8" r="3"/><path d="M9 1v1m0 12v1M2 8H1m15 0h1M3.3 2.3l1 1m9.4 9.4 1 1M3.3 13.7l1-1m9.4-9.4 1-1M9 19h10a4 4 0 0 0 0-8 5 5 0 0 0-9 2 3 3 0 0 0-1 6Z"/>',air:'<path d="M3 8h12a3 3 0 1 0-3-3M3 12h16a3 3 0 1 1-3 3M3 16h6a3 3 0 1 1-3 3"/>',trees:'<path d="m12 2-6 8h3l-5 7h6v5h4v-5h6l-5-7h3Z"/>',alerts:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',earthquakes:'<path d="M2 12h4l2-7 4 14 3-10 2 3h5"/>',fires:'<path d="M13 2c1 5-5 5-3 10 2-1 3-3 3-4 4 3 7 5 6 9a7 7 0 0 1-14-1c0-4 3-6 3-8 0 3 1 4 2 4"/>'};
  function icon(name){return `<span class="environment-icon environment-icon-${name}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${iconPaths[name]||''}</svg></span>`}
  function focusMap(target,event){
    if(!target||!point(event))return false;
    if(event.bounds)target.fitBounds(event.bounds,{padding:{top:130,bottom:35,left:45,right:45},maxZoom:13,duration:650});
    else target.flyTo({center:[Number(event.lon),Number(event.lat)],zoom:10,offset:[0,70],duration:650});
    return true
  }
  const alertLevels=[{key:'green',label:'Nessuna allerta segnalata',symbol:'check'},{key:'yellow',label:'Allerta gialla',symbol:'alert'},{key:'orange',label:'Allerta arancione',symbol:'alert'},{key:'red',label:'Allerta rossa',symbol:'alert'}];
  function alertLevel(text){const value=String(text||'').toLocaleUpperCase('it');if(/NESSUNA ALLERTA/.test(value))return 0;if(/ALLERTA ROSSA/.test(value))return 3;if(/ALLERTA ARANCIONE/.test(value))return 2;if(/ALLERTA GIALLA/.test(value))return 1;return null}
  function alertSymbol(name){const paths={check:'<path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z"/><path d="m8 12 3 3 5-6"/>',alert:'<path d="m12 3 10 18H2Z"/><path d="M12 9v5m0 3v1"/>',unknown:'<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 5m0 3v1"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',idraulico:'<path d="M2 17q3-3 6 0t6 0 8 0M2 21q3-3 6 0t6 0 8 0M6 13V8l6-5 6 5v5M10 13V9h4v4"/>',temporali:'<path d="M6 14a4 4 0 1 1 1-8 6 6 0 0 1 11 2 3 3 0 0 1 0 6h-3M12 11l-4 7h5l-2 5 7-9h-5l2-3"/>',idrogeologico:'<path d="m2 21 8-16 7 10h5M5 21h17M12 8l-2 5 5 3m4-13v5m-3-3 3 3 3-3M17 18h2m-7 1h1"/>'};return `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${paths[name]||paths.unknown}</svg>`}
  function alertStatus(data,now=Date.now()){
    const today=day(now),periods=(data?.current||[]).filter(p=>p.date>=today);
    if(!data)return {key:'unknown',symbol:'unknown',label:'Dati non disponibili',detail:'Non è possibile verificare le allerte. Consulta la fonte ufficiale.',periods:[]};
    if(data.stale||!periods.length)return {key:'unknown',symbol:'clock',label:'Bollettino scaduto',detail:'Le valutazioni disponibili non descrivono le allerte attuali.',periods:[]};
    let highest=null,selected=null,partial=false;
    for(const p of periods){if(!p.zones?.length)partial=true;for(const z of p.zones||[]){if(z.risks?.length!==3)partial=true;for(const r of z.risks||[]){const level=alertLevel(r.text);if(level===null)partial=true;else if(highest===null||level>highest){highest=level;selected={date:p.date,zone:z.name,type:r.type}}}}}
    if(highest===null||(highest===0&&partial))return {key:'unknown',symbol:'unknown',label:'Valutazione incompleta',detail:'Zona o valutazioni mancanti: non è possibile escludere allerte.',periods};
    return {...alertLevels[highest],level:highest,selected,partial,periods,detail:highest>0?`${selected.date===today?'Oggi':'Prevista'} · ${date(selected.date)} · ${selected.zone}`:`Per le giornate coperte dal bollettino: ${periods.map(p=>date(p.date)).join(' · ')}.`};
  }
  function alertHeadingIcon(data){const status=alertStatus(data);return `<span class="environment-icon alert-heading-icon alert-tone-${status.key}">${alertSymbol(status.symbol)}</span>`}
  function alertHeroHtml(data,compact=false){const status=alertStatus(data);return `<div class="alert-hero alert-tone-${status.key}${compact?' is-compact':''}"><span class="alert-hero-symbol">${alertSymbol(status.symbol)}</span><div><span class="alert-eyebrow">${compact?'Nella zona selezionata':'Protezione Civile · quadro della zona'}</span><${compact?'strong':'h2'} class="alert-hero-title">${esc(status.label)}</${compact?'strong':'h2'}><p>${esc(status.detail)}</p>${status.partial?'<span class="alert-partial">Alcune valutazioni non sono disponibili.</span>':''}</div></div>`}
  function alertHtml(data){
    const status=alertStatus(data),today=day(Date.now()),names={idraulico:'Rischio idraulico',temporali:'Temporali',idrogeologico:'Rischio idrogeologico'};
    const periods=status.periods,selected=status.level>0?status.selected.date:periods[0]?.date;
    return `<div class="alerts-page">${alertHeroHtml(data)}<div class="alert-bulletin-meta"><span>${alertSymbol('clock')}${esc(data?.title||'Bollettino non disponibile')}</span>${link(DPC,'Apri fonte ufficiale ↗')}</div>${periods.length?`<div class="alert-days" role="group" aria-label="Giornate del bollettino">${periods.map(p=>`<button type="button" data-alert-day="${esc(p.date)}" aria-pressed="${p.date===selected}"><span>${p.date===today?'Oggi':'Prossima giornata'}</span><strong>${esc(date(p.date))}</strong></button>`).join('')}</div>${periods.map(p=>`<section class="alert-day-panel" data-alert-panel="${esc(p.date)}" ${p.date===selected?'':'hidden'}><h2>Validità ${esc(date(p.date))}${p.date===today?' · oggi':''}</h2>${p.zones?.length?p.zones.map(z=>`<p class="alert-zone-label">⌖ ${esc(z.name)}</p><div class="alert-risk-grid">${z.risks.map(r=>{const level=alertLevel(r.text),tone=level===null?'unknown':alertLevels[level].key;return `<article class="alert-risk alert-tone-${tone}"><span class="alert-risk-symbol">${alertSymbol(r.type)}</span><h3>${esc(names[r.type]||r.type)}</h3><span class="alert-level-badge">${esc(level===null?'Da verificare':level===0?'Nessuna allerta':alertLevels[level].label)}</span><p>${esc(r.text)}</p></article>`}).join('')}</div>`).join(''):'<div class="alert-empty">'+alertSymbol('unknown')+'<p>Nessuna zona individuata per queste coordinate. Non equivale ad assenza di allerta.</p></div>'}</section>`).join('')}`:''}<section class="alert-reading"><h2>Come leggere i livelli</h2><div class="alert-legend">${alertLevels.map((l,i)=>`<span><i class="alert-dot alert-tone-${l.key}" aria-hidden="true"></i>${['Nessuna allerta','Gialla · ordinaria','Arancione · moderata','Rossa · elevata'][i]}</span>`).join('')}</div><p>Il livello si riferisce alla zona di allerta, non al singolo indirizzo. Un bollettino scaduto o una valutazione mancante non indicano assenza di rischio. Per le indicazioni operative consulta Regione e Comune.</p><a href="https://www.protezionecivile.gov.it/it/dipartimento/contact-center/contatti-utili/" target="_blank" rel="noopener noreferrer">Protezione Civile e centri funzionali regionali ↗</a></section><div class="alert-snow-link">${icon('snow')}<div><strong>Neve e ghiaccio</strong><p>Gli avvisi MeteoAlarm sono nella sezione Neve, con aree e scadenze.</p></div><button type="button" data-environment-open="snow">Consulta neve</button></div></div>`;
  }
  globalThis.Environment={alertLevel,alertStatus,alertHeroHtml,alertHtml,point,distance,quakeUrl,earthquakes,contains,alertZones,treeEvents,filterEvents,alerts,fireTile,latestQuakeUrl,latestFireUrl,fireEvent,latestEvent,magnitudeHtml,eventHtml,focusMap,icon,esc,link};
  if(typeof document==='undefined'||typeof source!=='function')return;
  for(const [key,name] of Object.entries(SOURCES))SOURCE_INFO[key]={name,years:['recent'],description:'',hint:''};
  const $=id=>document.getElementById(id),active=()=>Object.hasOwn(SOURCES,source());
  const baseConfigure=configureSourceUI,baseRender=render;
  let events=[],city=null,view='',map=null,markers=[],renderSequence=0,loadKey='',loadPromise=null,loaded=null,latest=null,focusMarker=null,pendingFocus=null;
  function stopMap(){globalThis.Snow?.suspend();focusMarker?.remove();focusMarker=null;for(const marker of markers)marker.remove();markers=[];map?.remove();map=null}
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
  function focusEvent(event){
    if(!map||!point(event))return;
    const target=map;
    const show=()=>{
      if(map!==target)return;
      focusMap(target,event);focusMarker?.remove();
      focusMarker=new maplibregl.Marker({color:event.category==='fires'?'#fb923c':event.category==='earthquakes'?'#f0b657':event.detail.startsWith('Abbattimento')?'#ef7272':'#35d07f'}).setLngLat([event.lon,event.lat]).setPopup(new maplibregl.Popup({maxWidth:'320px',anchor:'bottom',offset:20}).setHTML(eventHtml(event))).addTo(target);
      focusMarker.togglePopup();
      if(event.geometry){
        const feature={type:'Feature',properties:{},geometry:event.geometry};
        if(target.getSource('focused-fire'))target.getSource('focused-fire').setData(feature);
        else{target.addSource('focused-fire',{type:'geojson',data:feature});target.addLayer({id:'focused-fire-fill',type:'fill',source:'focused-fire',paint:{'fill-color':'#fb923c','fill-opacity':.35}});target.addLayer({id:'focused-fire-line',type:'line',source:'focused-fire',paint:{'line-color':'#fb923c','line-width':3}})}
      }
    };
    if(target.isStyleLoaded())show();else target.once('load',show);
    $('environmentMap')?.scrollIntoView({behavior:'smooth',block:'center'});
  }
  function drawEvents(){
    const list=point(city)?filterEvents(events,{category:view==='earthquakes'?'earthquakes':$('environmentCategory')?.value||'all',query:$('environmentSearch')?.value||'',days:Number($('environmentDays')?.value||7),radius:Number($('environmentRadius')?.value||100)}):[];
    $('environmentCount').textContent=`${list.length} eventi nei filtri selezionati`;
    $('environmentEvents').innerHTML=list.length?list.map(eventHtml).join(''):'<p>Nessun evento disponibile nei filtri selezionati. Non indica necessariamente assenza di eventi sul territorio.</p>';
    for(const m of markers)m.remove();markers=[];
    if(map)for(const e of list){const marker=new maplibregl.Marker({color:e.category==='earthquakes'?'#f0b657':e.detail.startsWith('Piantumazione')?'#35d07f':'#ef7272'}).setLngLat([e.lon,e.lat]).setPopup(new maplibregl.Popup({maxWidth:'320px'}).setHTML(eventHtml(e))).addTo(map);markers.push(marker)}
    if(map&&list.length){const bounds=new maplibregl.LngLatBounds([Number(city.lon),Number(city.lat)],[Number(city.lon),Number(city.lat)]);for(const e of list)bounds.extend([e.lon,e.lat]);map.fitBounds(bounds,{padding:45,maxZoom:11,duration:0})}
  }
  function makeMap(){if(!globalThis.maplibregl)return;map=new maplibregl.Map({container:'environmentMap',style:MAP_STYLE,cooperativeGestures:true,center:[Number((city||latest).lon),Number((city||latest).lat)],zoom:8});map.addControl(new maplibregl.NavigationControl({showCompass:false}));const current=map;map.on('load',()=>{if(map===current){drawEvents();if(pendingFocus){const selected=pendingFocus;pendingFocus=null;focusEvent(selected)}}})}
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
  function openSource(name){$('sourceSelect').value=name;const shared=globalThis.SharedLocation?.peek();if(shared&&name==='trees'){const nearest=Object.values(TREE_CITY_CONFIG).sort((a,b)=>distance(shared,{lat:a.center[1],lon:a.center[0]})-distance(shared,{lat:b.center[1],lon:b.center[0]}))[0];state.sourceSettings.delete(name);configureTreeCityOptions(true);$('eeaCitySelect').value=nearest.id}if(shared&&['eea','openaq','forecast'].includes(name)){state.eeaCities.set('shared-location',{...shared,id:'shared-location'});state.sourceSettings.delete(name);$('eeaCitySelect').dataset[`${name}Default`]='true';configureTreeCityOptions(false);$('eeaCitySelect').value='shared-location'}changeSource()}
  async function overview(token,data){
    $('environmentBody').innerHTML=`<div class="environment-grid">
      <article class="environment-card"><h3 class="environment-card-title">${alertHeadingIcon(data.alerts)}<span>Allerte</span></h3>${alertHeroHtml(data.alerts,true)}<button data-environment-open="alerts">Consulta allerte</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('weather')}<span>Meteo</span></h3><div id="nearbyWeather">Caricamento…</div><button data-environment-open="weather">Apri meteo</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('snow')}<span>Neve</span></h3><div id="nearbySnow">Caricamento…</div><p id="nearbySnowAlerts">Verifica avvisi neve/ghiaccio…</p><button data-environment-open="snow">Apri neve</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('air')}<span>Qualità dell’aria</span></h3><div id="nearbyAir">Caricamento…</div><button data-environment-open="forecast">Apri previsioni aria</button><button data-environment-open="eea">Stazioni EEA</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('trees')}<span>Alberi · entro 50 km</span></h3><div id="nearbyTrees"></div><button data-environment-open="trees">Fonti comunali</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('fires')}<span>Incendi</span></h3><p>Aree bruciate sulla mappa Copernicus EFFIS; accesso al portale per punti caldi e pericolo previsto.</p><button data-environment-open="fires">Apri incendi</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('earthquakes')}<span>Terremoti · entro 100 km</span></h3><p>${data.quakeAvailable?`${filterEvents(data.events,{category:'earthquakes',days:7,radius:100}).length} eventi registrati negli ultimi 7 giorni`:'Catalogo non disponibile'}</p><button data-environment-open="earthquakes">Apri terremoti</button></article>
      <article class="environment-card"><h3 class="environment-card-title">${icon('diary')}<span>Diario ambientale</span></h3><p>Esplora gli eventi arborei documentati e i terremoti intorno alla località scelta, con ricerca e filtri per periodo e distanza.</p><button data-environment-open="diary">Apri diario</button></article>
    </div>`;
    const trees=filterEvents(data.events,{category:'trees',days:30,radius:50}).slice(0,1);$('nearbyTrees').innerHTML=trees.length?trees.map(eventHtml).join(''):data.trees?'<p>Nessun evento documentato nei filtri. Raccolta parziale, non censimento completo.</p>':'<p>Nessuna fonte comunale coperta in questa zona. Attualmente Roma e Guidonia Montecelio.</p>';
    await Promise.allSettled([
      WeatherForecast.fetchWeather(city).then(r=>{if(token!==renderSequence)return;const c=r.payload.current,[symbol,label]=WeatherForecast.condition(c?.weather_code,c?.is_day);$('nearbyWeather').innerHTML=`<div class="environment-weather-condition"><span class="environment-weather-symbol" aria-hidden="true">${esc(symbol)}</span><strong>${esc(label)}</strong></div><p class="environment-weather-temperature">${finite(c?.temperature_2m)?`${esc(c.temperature_2m)} °C`:'Temperatura non disponibile'}</p><p>Open-Meteo · stima modellistica · scaricato ${esc(date(new Date(r.savedAt).toISOString()))}</p>`;try{$('nearbySnow').innerHTML=Snow.localHtml(Snow.report(r.payload))}catch{$('nearbySnow').textContent='Dati neve non disponibili.'}}).catch(()=>{if(token===renderSequence){$('nearbyWeather').textContent='Meteo non disponibile: riprova dalla sezione Meteo.';$('nearbySnow').textContent='Dati neve non disponibili.'}}),
      Snow.alerts().then(data=>{if(token===renderSequence)$('nearbySnowAlerts').textContent=Snow.alertSummary(data)}).catch(()=>{if(token===renderSequence)$('nearbySnowAlerts').textContent='Avvisi neve/ghiaccio non disponibili: consulta la sezione Neve.'}),
      AirQualityForecast.fetchForecast(city).then(p=>{if(token!==renderSequence)return;const localNow=new Date(Date.now()+(Number(p.utc_offset_seconds)||0)*1000).toISOString().slice(0,13),i=p.hourly.time.findIndex(t=>t.slice(0,13)>=localNow),a=p.hourly;$('nearbyAir').innerHTML=`<p>PM2.5: ${i>=0&&finite(a.pm2_5?.[i])?esc(a.pm2_5[i]):'—'} µg/m³<br>PM10: ${i>=0&&finite(a.pm10?.[i])?esc(a.pm10[i]):'—'} µg/m³</p><p>Previsione modellistica CAMS / Open-Meteo · ${i>=0?esc(a.time[i].replace('T',' ')):'ora non disponibile'} (${esc(p.timezone||'fuso non disponibile')}). Non sono misure di una stazione.</p>`}).catch(()=>{if(token===renderSequence)$('nearbyAir').textContent='Previsioni aria non disponibili.'})
    ])
  }
  render=async function(){
    if(!active())return baseRender();configureSourceUI();const token=++renderSequence;++state.renderToken;view=source();if(view!=='diary')pendingFocus=null;stopMap();$('environmentPlace').textContent='';$('environmentTitle').textContent=SOURCES[view];$('environmentBody').textContent='Caricamento della località…';$('environmentStatus').textContent='';
    try{
      const independent=['earthquakes','fires','snow'].includes(view),catalog=['earthquakes','fires'].includes(view);
      const [locationResult,latestResult]=await Promise.allSettled([SharedLocation.get(),catalog?latestEvent(view):Promise.resolve(null)]);
      if(token!==renderSequence)return;
      city=locationResult.status==='fulfilled'?locationResult.value:null;
      if(!city&&!independent)throw locationResult.reason;
      latest=latestResult.status==='fulfilled'?latestResult.value:null;
      $('weatherSearchStatus').textContent='';
      $('environmentPlace').textContent=city?`${city.name} · ${Number(city.lat).toFixed(4)}, ${Number(city.lon).toFixed(4)}`:view==='snow'?'Italia · località campione e avvisi neve/ghiaccio':'Località non impostata · ultimo evento del catalogo';
      if(view==='snow'){await Snow.render(city,()=>token===renderSequence);return}
      const latestHtml=independent?`<section class="environment-latest" aria-labelledby="environmentLatestTitle"><h2 id="environmentLatestTitle">${view==='earthquakes'?'Ultimo terremoto · catalogo INGV':'Ultima area bruciata rilevata · catalogo EFFIS'}</h2><p>Senza filtro di distanza dalla tua posizione.</p>${latest?eventHtml(latest):`<p>${latestResult.status==='rejected'?'Ultimo evento non disponibile. Premi Aggiorna per riprovare.':'Nessun evento restituito dal catalogo.'}</p>`}${view==='fires'&&latest?`<p>Prima rilevazione: ${esc(latest.sourceTime)} · orario della fonte, fuso non indicato. Le date del rilevamento non coincidono necessariamente con inizio e fine dell’incendio.</p>`:''}</section>`:'';
      if(view==='fires'){
        const center=city||latest;
        if(!center){$('environmentBody').innerHTML=latestHtml+'<p>Cerca una località per visualizzare la mappa.</p>';return}
        const x=Number(center.lon)*20037508.34/180,y=Math.log(Math.tan((90+Math.max(-85.05112878,Math.min(85.05112878,Number(center.lat))))*Math.PI/360))*20037508.34/Math.PI;
        const url=new URL(EFFIS);url.search=new URLSearchParams({c:`${x},${y}`,z:'8'});
        $('environmentBody').innerHTML=`${latestHtml}<label>Periodo delle aree bruciate<select id="firePeriod"><option value="today">Ultime 24 ore</option><option value="week" selected>Ultimi 7 giorni</option><option value="month">Ultimi 30 giorni</option></select></label><p>Copernicus EFFIS · aree bruciate rilevate, evidenziate sulla mappa. L’assenza di poligoni non esclude incendi piccoli, recenti o non rilevati. Per punti caldi satellitari e pericolo previsto consulta ${link(url.href,'il visualizzatore ufficiale')}.</p><div id="environmentMap" class="environment-map" aria-label="Mappa delle aree bruciate"></div><p id="fireStatus" role="status">Caricamento aree bruciate…</p>`;
        map=new maplibregl.Map({container:'environmentMap',style:MAP_STYLE,cooperativeGestures:true,center:[Number(center.lon),Number(center.lat)],zoom:8});
        map.addControl(new maplibregl.NavigationControl({showCompass:false}));
        const current=map;
        map.on('load',()=>{if(map!==current)return;map.addSource('effis',{type:'raster',tiles:[fireTile()],tileSize:256,attribution:'Copernicus EFFIS / European Commission JRC'});map.addLayer({id:'effis',type:'raster',source:'effis',paint:{'raster-opacity':.85}})});
        let failed=false;
        map.on('error',e=>{if(map===current&&e.sourceId==='effis'){failed=true;$('fireStatus').textContent='Livello EFFIS non disponibile. Riprova o consulta il visualizzatore ufficiale.'}});
        map.on('idle',()=>{if(map===current&&!failed)$('fireStatus').textContent='Aree bruciate · Copernicus EFFIS. Periodo selezionato; dati satellitari soggetti a revisione.'});
        $('firePeriod').addEventListener('change',()=>{failed=false;$('fireStatus').textContent='Caricamento aree bruciate…';map?.getSource('effis')?.setTiles([fireTile($('firePeriod').value)])});
        return
      }
      $('environmentBody').innerHTML=latestHtml+'<p>Caricamento delle fonti ambientali…</p>';
      const data=city?await load(city):{at:Date.now(),events:[],quakeAvailable:false};if(token!==renderSequence)return;events=data.events;
      $('environmentStatus').textContent=`Consultato ${date(new Date(data.at).toISOString())}. ${data.errors?'Una o più fonti non disponibili. ':''}${data.partial?'Archivio arboreo aggiornato non raggiungibile; dati consolidati parziali. ':''}${data.limited&&view!=='alerts'?'INGV: raggiunto il limite di 500 eventi; elenco parziale. ':''}${!data.quakeAvailable&&city?'Catalogo sismico locale non disponibile. ':''}`;
      if(view==='nearby'){await overview(token,data);return}
      if(view==='alerts'){$('environmentBody').innerHTML=alertHtml(data.alerts);return}
      $('environmentBody').innerHTML=`${latestHtml}${!city?'<p>Cerca una località per consultare anche gli eventi vicini.</p>':''}${controls()}<p>${view==='earthquakes'?'INGV · terremoti registrati, non previsioni. Catalogo dell’ultimo anno entro 200 km, fino a 500 eventi più recenti.':'Eventi arborei documentati di Roma e Guidonia Montecelio e terremoti INGV. Include gli interventi programmati futuri; esclude dalla mappa gli eventi senza posizione o data.'}</p><div id="environmentMap" class="environment-map" aria-label="Mappa degli eventi"></div><p id="environmentCount" role="status"></p><div id="environmentEvents"></div>`;
      if(view==='earthquakes'){$('environmentCategory').value='earthquakes';$('environmentCategory').disabled=true;$('environmentDays').value='7';$('environmentRadius').value='100'}
      if(city||latest)makeMap();drawEvents();
    }catch(error){if(token!==renderSequence)return;$('environmentBody').innerHTML=`<p role="alert">${esc(error.message||'Dati non disponibili')}</p>`}
  };
  $('environmentPanel').addEventListener('click',event=>{
    const dayButton=event.target.closest('[data-alert-day]');if(dayButton){$('environmentBody').querySelectorAll('[data-alert-day]').forEach(b=>b.setAttribute('aria-pressed',String(b===dayButton)));$('environmentBody').querySelectorAll('[data-alert-panel]').forEach(p=>p.hidden=p.dataset.alertPanel!==dayButton.dataset.alertDay);return}
    const button=event.target.closest('[data-environment-open]');if(button){openSource(button.dataset.environmentOpen);return}
    if(event.target.closest('a'))return;
    const target=event.target.closest('[data-environment-focus]');
    if(target){const id=target.dataset.environmentFocus;const selected=latest?.id===id?latest:events.find(e=>e.id===id);if(selected){if(!map&&view==='nearby'){pendingFocus=selected;openSource('diary')}else focusEvent(selected)}}
  });
  $('environmentPanel').addEventListener('input',event=>{if(event.target.id==='environmentSearch')drawEvents()});
  $('environmentPanel').addEventListener('change',event=>{if(['environmentCategory','environmentDays','environmentRadius'].includes(event.target.id))drawEvents()});
  $('environmentRefresh').addEventListener('click',()=>{loaded=null;memory.clear();globalThis.Snow?.clear();render()});
  $('eeaCitySelect').addEventListener('change',()=>{
    if(!['eea','openaq','forecast'].includes(source()))return;
    const selected=state.eeaCities.get(eeaCity());if(selected&&selected.id!=='shared-location')SharedLocation.set(selected);
  });
  globalThis.Environment.openSource=openSource;
})();
