const state={
  mode:'map',demo:null,map:null,mapBefore:null,mapAfter:null,deferredPrompt:null,
  swipe:50,syncing:false,toastTimer:null,renderToken:0,eeaCache:new Map()
};
const $=id=>document.getElementById(id);
const EEA_YEARS=Array.from({length:13},(_,i)=>String(2025-i));
const DEMO_YEARS=['2015','2020','2025'];
const monthNames=['Intero anno','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};
const EEA_QUERY='https://air.discomap.eea.europa.eu/arcgis/rest/services/AirQuality/AQ_Statistics_WM/MapServer/0/query';
const POLLUTANTS={
  'PM2.5':{eeaCode:'6001',label:'PM2.5'},
  'PM10':{eeaCode:'5',label:'PM10'},
  'NO2':{eeaCode:'8',label:'NO₂'}
};

function activeYears(){return $('sourceSelect').value==='eea'?EEA_YEARS:DEMO_YEARS}
function fillYears(preserve=true){
  const years=activeYears();
  for(const id of ['yearSelect','compareYearA','compareYearB']){
    const old=preserve?$(id).value:'';
    $(id).innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
    if(old&&years.includes(old))$(id).value=old;
  }
  $('yearSelect').value=years.includes('2024')?'2024':years[0];
  $('compareYearA').value=years.includes('2015')?'2015':years.at(-1);
  $('compareYearB').value=years.includes('2024')?'2024':years[0];
}
function configurePeriod(){
  const annualOnly=$('sourceSelect').value==='eea';
  $('monthSelect').disabled=annualOnly;
  if(annualOnly)$('monthSelect').value='0';
  $('monthSelect').title=annualOnly?'EEA: in questa versione usiamo le statistiche annuali delle stazioni.':'';
}
function colorFor(v){if(v<10)return'#35d07f';if(v<20)return'#e6cf43';if(v<30)return'#ff914d';return'#ff5864'}
function avg(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:0}
function fmt(v){return Number(v).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}
function normalizeText(v){return String(v??'').toLowerCase().replace(/\s+/g,' ').trim()}
function pollutantCodeMatches(raw,code){
  const v=String(raw??'').trim();
  return v===code || v.endsWith('/'+code) || v.endsWith(':'+code);
}
function isAnnualMean(props){
  const a=normalizeText(props.DataAggregationName_orig);
  const p=normalizeText(props.DataAggregationProcess);
  const r=normalizeText(props.ReportingMetric);
  return a.includes('annual mean')||a.includes('annual average')||p==='p1y'||p.includes('p1y')||r.includes('annual mean')||r.includes('annual average');
}
function isMicrogramUnit(raw){
  const v=normalizeText(raw).replaceAll('³','3');
  return !v || v.includes('µg') || v.includes('μg') || v.includes('ug') || v.includes('microgram');
}
function recordScore(props){
  let score=0;
  const ver=normalizeText(props.DataVerification);
  const prelim=normalizeText(props.Preliminary);
  if(ver.includes('verified')&&!ver.includes('unverified'))score+=100;
  if(prelim===''||prelim==='0'||prelim==='false'||prelim==='n')score+=30;
  const coverage=Number(props.DataCoverage??props.DataCapture??0);
  if(Number.isFinite(coverage))score+=Math.min(coverage,100)/10;
  return score;
}
function verificationLabel(rows){
  const provisional=rows.some(r=>r.provisional);
  return provisional?'EEA · dati annuali, presenza di valori provvisori':'EEA · statistiche annuali delle stazioni';
}
function toGeoJSON(rows){
  return{type:'FeatureCollection',features:rows.map(r=>({
    type:'Feature',
    properties:{id:r.id,name:r.name,value:r.value,label:fmt(r.value),coverage:r.coverage??'',verification:r.verification??''},
    geometry:{type:'Point',coordinates:[r.lon,r.lat]}
  }))};
}
function toDifferenceGeoJSON(rows){
  return{type:'FeatureCollection',features:rows.map(r=>({
    type:'Feature',
    properties:{id:r.id,name:r.name,delta:r.value,absDelta:Math.abs(r.value),label:`${r.value>0?'+':''}${fmt(r.value)}`},
    geometry:{type:'Point',coordinates:[r.lon,r.lat]}
  }))};
}

async function fetchEeaRows(year,pollutant){
  const cacheKey=`${year}:${pollutant}`;
  if(state.eeaCache.has(cacheKey))return state.eeaCache.get(cacheKey);
  const cfg=POLLUTANTS[pollutant];
  if(!cfg)throw new Error(`Inquinante ${pollutant} non ancora supportato per EEA.`);

  const params=new URLSearchParams({
    where:`Country_ISO='IT' AND YearOfStatistics=${Number(year)}`,
    geometry:ROME.bbox.join(','),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:[
      'AirPollutant','AirPollutantName','AirPollutionLevel','AirQualityEoICode','AirQualityStation',
      'DataAggregationName_orig','DataAggregationProcess','DataCapture','DataCoverage','DataVerification',
      'LatitudeOfMeasurementStation','LongitudeOfMeasurementStation','Preliminary','ReportingMetric',
      'StationName','UnitOfAirpollutionLevel','YearOfStatistics'
    ].join(','),
    returnGeometry:'true',
    outSR:'4326',
    resultRecordCount:'1000',
    f:'geojson'
  });

  const response=await fetch(`${EEA_QUERY}?${params}`,{cache:'no-store'});
  if(!response.ok)throw new Error(`EEA HTTP ${response.status}`);
  const data=await response.json();
  if(data.error)throw new Error(data.error.message||'Errore API EEA');

  const candidates=(data.features||[]).filter(f=>{
    const p=f.properties||{};
    return pollutantCodeMatches(p.AirPollutant,cfg.eeaCode)
      && isAnnualMean(p)
      && isMicrogramUnit(p.UnitOfAirpollutionLevel)
      && Number.isFinite(Number(p.AirPollutionLevel));
  });

  const best=new Map();
  for(const f of candidates){
    const p=f.properties||{};
    const id=String(p.AirQualityEoICode||p.AirQualityStation||p.StationName||'').trim();
    if(!id)continue;
    const coverage=Number(p.DataCoverage??p.DataCapture);
    if(Number.isFinite(coverage)&&coverage>0&&coverage<75)continue;
    const score=recordScore(p);
    if(!best.has(id)||score>best.get(id).score)best.set(id,{f,score});
  }

  const rows=[...best.entries()].map(([id,{f}])=>{
    const p=f.properties||{};
    const coords=f.geometry?.coordinates||[];
    const lon=Number(coords[0]??p.LongitudeOfMeasurementStation);
    const lat=Number(coords[1]??p.LatitudeOfMeasurementStation);
    const verification=String(p.DataVerification||'');
    const prelim=normalizeText(p.Preliminary);
    const provisional=(prelim==='1'||prelim==='true'||prelim==='y'||normalizeText(verification).includes('unverified'));
    return{
      id,name:String(p.StationName||p.AirQualityStation||id),lat,lon,
      value:Number(p.AirPollutionLevel),
      coverage:Number.isFinite(Number(p.DataCoverage))?Number(p.DataCoverage):null,
      verification,provisional
    };
  }).filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Number.isFinite(r.value))
    .sort((a,b)=>a.name.localeCompare(b.name,'it'));

  state.eeaCache.set(cacheKey,rows);
  return rows;
}
function demoRows(year){return state.demo?.years?.[year]||[]}
async function rowsFor(year){
  if($('sourceSelect').value==='eea')return fetchEeaRows(year,$('pollutantSelect').value);
  return demoRows(year);
}
async function differenceRows(){
  const [a,b]=await Promise.all([rowsFor($('compareYearA').value),rowsFor($('compareYearB').value)]);
  const index=new Map(a.map(r=>[r.id,r]));
  return b.filter(r=>index.has(r.id)).map(r=>({...r,value:+(r.value-index.get(r.id).value).toFixed(1)}));
}

function addAirLayers(map,prefix='air'){
  if(map.getSource(`${prefix}-source`))return;
  map.addSource(`${prefix}-source`,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:`${prefix}-heat`,type:'heatmap',source:`${prefix}-source`,maxzoom:15,paint:{
    'heatmap-weight':['interpolate',['linear'],['get','value'],0,0,40,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],8,.72,12,1.3],
    'heatmap-radius':['interpolate',['linear'],['zoom'],8,38,10,68,12,105],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],8,.56,12,.7,15,.22],
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(53,208,127,0)',.12,'rgba(53,208,127,.72)',.35,'rgba(230,207,67,.78)',.58,'rgba(255,145,77,.82)',.82,'rgba(255,88,100,.9)',1,'rgba(174,22,31,.94)']
  }});
  map.addLayer({id:`${prefix}-points`,type:'circle',source:`${prefix}-source`,paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],8,8,10,11,13,14],
    'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
    'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-opacity':.98
  }});
  map.addLayer({id:`${prefix}-labels`,type:'symbol',source:`${prefix}-source`,layout:{
    'text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],8,8,10,9,13,11],
    'text-allow-overlap':true,'text-ignore-placement':true
  },paint:{'text-color':'#07111d','text-halo-color':'rgba(255,255,255,.92)','text-halo-width':1}});
  map.on('click',`${prefix}-points`,e=>{
    const f=e.features?.[0];if(!f)return;
    const coverage=Number(f.properties.coverage);
    const coverageText=Number.isFinite(coverage)&&coverage>0?`<br>Copertura dati: ${fmt(coverage)}%`:'';
    new maplibregl.Popup({offset:16}).setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${f.properties.name}</strong><br>${fmt(f.properties.value)} µg/m³${coverageText}`).addTo(map)
  });
  map.on('mouseenter',`${prefix}-points`,()=>map.getCanvas().style.cursor='pointer');
  map.on('mouseleave',`${prefix}-points`,()=>map.getCanvas().style.cursor='');
}
function addDifferenceLayers(map){
  if(map.getSource('diff-source'))return;
  map.addSource('diff-source',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const heatBase={type:'heatmap',source:'diff-source',maxzoom:15,paint:{
    'heatmap-weight':['interpolate',['linear'],['get','absDelta'],0,0,15,1],
    'heatmap-intensity':1.2,'heatmap-radius':['interpolate',['linear'],['zoom'],8,42,10,75,12,110],'heatmap-opacity':.68
  }};
  map.addLayer({...heatBase,id:'diff-good',filter:['<=',['get','delta'],0],paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(24,165,91,0)',.18,'rgba(24,165,91,.35)',.5,'rgba(24,165,91,.62)',1,'rgba(0,117,58,.88)']}});
  map.addLayer({...heatBase,id:'diff-bad',filter:['>',['get','delta'],0],paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(229,71,71,0)',.18,'rgba(229,71,71,.35)',.5,'rgba(229,71,71,.62)',1,'rgba(183,22,22,.9)']}});
  map.addLayer({id:'diff-points',type:'circle',source:'diff-source',paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],8,8,10,11,13,14],
    'circle-color':['case',['<=',['get','delta'],0],'#21b866','#ef4f4f'],'circle-stroke-width':2,'circle-stroke-color':'#fff'
  }});
  map.addLayer({id:'diff-labels',type:'symbol',source:'diff-source',layout:{
    'text-field':['get','label'],'text-size':['interpolate',['linear'],['zoom'],8,7,10,9,13,10],
    'text-allow-overlap':true,'text-ignore-placement':true
  },paint:{'text-color':'#07111d','text-halo-color':'rgba(255,255,255,.92)','text-halo-width':1}});
  map.on('click','diff-points',e=>{
    const f=e.features?.[0];if(!f)return;const d=Number(f.properties.delta);
    new maplibregl.Popup({offset:16}).setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${f.properties.name}</strong><br>Δ ${d>0?'+':''}${fmt(d)} µg/m³`).addTo(map)
  });
}
function setAirData(map,rows,prefix='air'){const src=map?.getSource(`${prefix}-source`);if(src)src.setData(toGeoJSON(rows))}
function setDifferenceData(map,rows){const src=map?.getSource('diff-source');if(src)src.setData(toDifferenceGeoJSON(rows))}
function setLayerVisibility(map,ids,visible){ids.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')})}
function showAirOnSingle(rows){
  setAirData(state.map,rows);
  setLayerVisibility(state.map,['air-heat','air-points','air-labels'],true);
  setLayerVisibility(state.map,['diff-good','diff-bad','diff-points','diff-labels'],false);
}
function showDifferenceOnSingle(rows){
  setDifferenceData(state.map,rows);
  setLayerVisibility(state.map,['air-heat','air-points','air-labels'],false);
  setLayerVisibility(state.map,['diff-good','diff-bad','diff-points','diff-labels'],true);
}
function renderStationList(rows,isDiff=false){
  if(!rows.length){$('stations').innerHTML='<div class="empty-state">Nessuna stazione compatibile trovata per questa selezione.</div>';return}
  $('stations').innerHTML=rows.map(r=>`<div class="station-row">
    <i style="background:${isDiff?(r.value<=0?'#35d07f':'#ff5864'):colorFor(r.value)}"></i>
    <div><strong>${r.name}</strong><small>${r.id}${r.coverage?` · copertura ${fmt(r.coverage)}%`:''}</small></div>
    <b>${isDiff&&r.value>0?'+':''}${fmt(r.value)}</b>
  </div>`).join('')
}
async function updateCompareMaps(){
  if(!state.mapBefore||!state.mapAfter)return{a:[],b:[]};
  const [a,b]=await Promise.all([rowsFor($('compareYearA').value),rowsFor($('compareYearB').value)]);
  setAirData(state.mapBefore,a,'before');setAirData(state.mapAfter,b,'after');
  $('beforeBadge').textContent=$('compareYearA').value;$('afterBadge').textContent=$('compareYearB').value;
  return{a,b}
}
function updateSwipe(percent){
  const p=Math.max(2,Math.min(98,percent));state.swipe=p;
  $('afterClip').style.clipPath=`inset(0 0 0 ${p}%)`;
  $('swipeDivider').style.left=`${p}%`;
  $('swipeDivider').setAttribute('aria-valuenow',String(Math.round(p)))
}
function setLoading(on){$('loadingOverlay').classList.toggle('hidden',!on)}
function sourceNotice(rows){return $('sourceSelect').value==='eea'?verificationLabel(rows):'Dati dimostrativi locali'}
async function render(){
  if(!state.map)return;
  const token=++state.renderToken;setLoading($('sourceSelect').value==='eea');
  const year=$('yearSelect').value,month=+$('monthSelect').value,source=$('sourceSelect').value;
  const sourceName=$('sourceSelect').selectedOptions[0].textContent.replace(' · stazioni ufficiali','');

  $('comparePanel').classList.toggle('hidden',state.mode==='map');
  $('singleYearField').classList.toggle('hidden',state.mode!=='map');
  $('singleMapWrap').classList.toggle('hidden',state.mode==='compare');
  $('compareMapWrap').classList.toggle('hidden',state.mode!=='compare');
  $('standardLegend').classList.toggle('hidden',state.mode==='difference');
  $('differenceLegend').classList.toggle('hidden',state.mode!=='difference');
  $('mapBadge').classList.toggle('hidden',state.mode==='compare');

  try{
    let rows=[];
    if(state.mode==='difference'){
      rows=await differenceRows();if(token!==state.renderToken)return;
      showDifferenceOnSingle(rows);renderStationList(rows,true);
      $('mapBadge').textContent=`Δ ${$('compareYearB').value} − ${$('compareYearA').value}`;
      $('avgLabel').textContent='Differenza media stazioni';
      const a=avg(rows);$('avgValue').textContent=`${a>0?'+':''}${fmt(a)}`;
      $('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
    }else if(state.mode==='compare'){
      const pair=await updateCompareMaps();if(token!==state.renderToken)return;
      rows=pair.b||[];renderStationList(rows);
      $('avgLabel').textContent=`Media stazioni ${$('compareYearB').value}`;
      $('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=`${$('compareYearA').value}↔${$('compareYearB').value}`;
      requestAnimationFrame(()=>{state.mapBefore.resize();state.mapAfter.resize()});
    }else{
      rows=await rowsFor(year);if(token!==state.renderToken)return;
      showAirOnSingle(rows);renderStationList(rows);
      $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value]?.label||$('pollutantSelect').value} · ${year}`;
      $('avgLabel').textContent='Media stazioni';$('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=month?monthNames[month]:year;
    }
    $('stationCount').textContent=rows.length;$('sourceValue').textContent=sourceName;
    $('dataNotice').textContent=sourceNotice(rows);$('unitValue').textContent='µg/m³';
    $('mapHint').textContent=source==='eea'
      ?"Le aree colorate sono un'interpolazione grafica dei valori delle stazioni EEA visualizzate; non rappresentano una superficie modellistica ufficiale."
      :'Le aree colorate sono una visualizzazione interpolata a partire dai punti disponibili.';
  }catch(err){
    console.error(err);if(token!==state.renderToken)return;
    showAirOnSingle([]);renderStationList([]);$('stationCount').textContent='0';$('avgValue').textContent='—';
    $('dataNotice').textContent='Errore nel caricamento dei dati EEA';
    showToast(`Dati EEA non disponibili: ${err.message}`)
  }finally{if(token===state.renderToken)setLoading(false)}
}

async function loadLocalData(){
  const [demo,appVersion,dataVersion]=await Promise.all([
    fetch('data/rome-demo.json?v=0.1.2',{cache:'no-store'}).then(r=>r.json()),
    fetch('version.json?v=0.1.2',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.1.2',{cache:'no-store'}).then(r=>r.json())
  ]);
  state.demo=demo;$('appVersion').textContent=appVersion.version;$('dataVersion').textContent=dataVersion.version
}
function baseMap(container){return new maplibregl.Map({container,style:MAP_STYLE,center:ROME.center,zoom:ROME.zoom,attributionControl:true})}
function initMaps(){
  state.map=baseMap('map');state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  state.map.on('load',()=>{addAirLayers(state.map);addDifferenceLayers(state.map);render()});
  state.mapBefore=baseMap('mapBefore');state.mapAfter=baseMap('mapAfter');
  state.mapBefore.on('load',()=>{addAirLayers(state.mapBefore,'before');if(state.mapAfter.loaded())render()});
  state.mapAfter.on('load',()=>{addAirLayers(state.mapAfter,'after');if(state.mapBefore.loaded())render()});
  const sync=(from,to)=>{if(state.syncing||!to)return;state.syncing=true;to.jumpTo({center:from.getCenter(),zoom:from.getZoom(),bearing:from.getBearing(),pitch:from.getPitch()});state.syncing=false};
  state.mapBefore.on('move',()=>sync(state.mapBefore,state.mapAfter));state.mapAfter.on('move',()=>sync(state.mapAfter,state.mapBefore))
}
function bindSwipe(){
  const wrap=$('compareMapWrap');let dragging=false;
  const apply=e=>{const r=wrap.getBoundingClientRect();updateSwipe((e.clientX-r.left)/r.width*100)};
  $('swipeDivider').addEventListener('pointerdown',e=>{dragging=true;$('swipeDivider').setPointerCapture(e.pointerId);e.preventDefault()});
  $('swipeDivider').addEventListener('pointermove',e=>{if(dragging)apply(e)});
  $('swipeDivider').addEventListener('pointerup',()=>dragging=false);$('swipeDivider').addEventListener('pointercancel',()=>dragging=false);
  $('swipeDivider').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){updateSwipe(state.swipe-3);e.preventDefault()}
    if(e.key==='ArrowRight'){updateSwipe(state.swipe+3);e.preventDefault()}
  })
}
function showToast(text){
  clearTimeout(state.toastTimer);$('toast').textContent=text;$('toast').classList.remove('hidden');
  state.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5200)
}
async function installApp(){
  if(window.matchMedia('(display-mode: standalone)').matches){showToast('L’app è già installata sul dispositivo.');return}
  if(state.deferredPrompt){state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;return}
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isiOS?'Su iPhone/iPad: apri Condividi e scegli “Aggiungi alla schermata Home”.':'Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.')
}
function bind(){
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.mode=btn.dataset.mode;render()
  }));
  $('sourceSelect').addEventListener('change',()=>{fillYears(false);configurePeriod();render()});
  ['pollutantSelect','yearSelect','monthSelect','compareYearA','compareYearB'].forEach(id=>$(id).addEventListener('change',render));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e});
  $('installBtn').addEventListener('click',installApp);bindSwipe()
}
async function boot(){
  fillYears(false);configurePeriod();bind();await loadLocalData();initMaps();
  if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js?v=0.1.2').then(reg=>reg.update()).catch(console.error)
}
boot().catch(err=>{console.error(err);$('dataNotice').textContent='Errore di inizializzazione'})
