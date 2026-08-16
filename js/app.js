const state={
  mode:'map',
  map:null,mapBefore:null,mapAfter:null,
  deferredPrompt:null,swipe:50,syncing:false,
  toastTimer:null,renderToken:0,
  eeaCache:new Map(),arpaCache:new Map()
};

const $=id=>document.getElementById(id);
const MAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};
const EEA_QUERY='https://air.discomap.eea.europa.eu/arcgis/rest/services/AirQuality/AQ_Statistics_WM/MapServer/0/query';
const ARPA_API='https://dati.lazio.it/api/3/action/datastore_search';

const POLLUTANTS={
  'PM2.5':{eeaCode:'6001',label:'PM2.5',arpaPrefix:'PM2.5 media annua'},
  'PM10':{eeaCode:'5',label:'PM10',arpaPrefix:'PM10 media annua'},
  'NO2':{eeaCode:'8',label:'NO₂',arpaPrefix:'NO2 media annua'}
};

const EEA_YEARS=Array.from({length:13},(_,i)=>String(2025-i));

/*
 * Open Data Lazio - "Standard comunali della qualità dell'aria".
 * 2024 è pubblicato come CSV ma non viene esposto qui finché non è disponibile
 * via DataStore API, così l'app non promette anni che non può caricare in modo affidabile.
 */
const ARPA_RESOURCES={
  '2023':'a5141779-55c3-4f23-8927-8cd2ba644798',
  '2022':'f671c878-9c45-473c-9445-1491da97d123',
  '2021':'13df26b3-03bf-47ed-8725-9515ece6899c',
  '2020':'92a3f892-6bc7-4c2e-90ca-941832fae417',
  '2019':'fd145613-7d8e-4e3c-8861-e7d63f74d3bb',
  '2018':'60550f81-105b-460b-ad47-d4feb8aa0a2e',
  '2017':'15993ce0-6df3-4a1a-b116-61d841be6c33',
  '2016':'bd020cef-90b1-450f-ad17-c6c03602aa41',
  '2015':'948c1a63-81a5-48a2-a6e7-5f4bbbff0925',
  '2014':'2da682d2-df06-46b3-b92f-60c8368af193',
  '2013':'892d5160-4c24-408f-887f-21f109439462'
};

const SOURCE_INFO={
  eea:{
    name:'EEA',
    years:EEA_YEARS,
    description:'<strong>EEA:</strong> statistiche annuali derivate dalle misure delle stazioni ufficialmente riportate dai Paesi europei.',
    hint:"Le aree colorate sono un'interpolazione grafica dei valori delle stazioni EEA mostrate sulla mappa; non sono una superficie modellistica ufficiale."
  },
  arpa:{
    name:'ARPA Lazio',
    years:Object.keys(ARPA_RESOURCES).sort((a,b)=>Number(b)-Number(a)),
    description:'<strong>ARPA Lazio:</strong> valutazione annuale modellistica a livello comunale, ottenuta combinando rete di monitoraggio e modello di dispersione.',
    hint:'Per ARPA Lazio viene mostrato il valore MED del Comune di Roma; MIN e MAX sono riportati nel dettaglio. Non è il valore di una singola centralina.'
  }
};

function source(){return $('sourceSelect').value}
function currentYears(){return SOURCE_INFO[source()].years}
function normalizeText(v){return String(v??'').toLowerCase().replace(/\s+/g,' ').trim()}
function fmt(v){return Number(v).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}
function avg(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:0}
function colorFor(v){if(v<10)return'#35d07f';if(v<20)return'#e6cf43';if(v<30)return'#ff914d';return'#ff5864'}
function parseNumber(v){
  if(typeof v==='number')return Number.isFinite(v)?v:null;
  const n=Number(String(v??'').trim().replace(',','.'));
  return Number.isFinite(n)?n:null
}

function fillYears(){
  const years=currentYears();
  const latest=years[0];
  const preferredA=years.includes('2015')?'2015':years.at(-1);
  const preferredB=years.includes('2023')?'2023':latest;

  for(const id of ['yearSelect','compareYearA','compareYearB']){
    const old=$(id).value;
    $(id).innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('');
    if(old&&years.includes(old))$(id).value=old;
  }
  if(!years.includes($('yearSelect').value))$('yearSelect').value=latest;
  if(!years.includes($('compareYearA').value))$('compareYearA').value=preferredA;
  if(!years.includes($('compareYearB').value))$('compareYearB').value=preferredB;
}
function configureSourceUI(){
  const info=SOURCE_INFO[source()];
  $('sourceDescription').innerHTML=info.description;
  $('monthSelect').disabled=true;
  $('monthSelect').title='Le fonti reali attive in questa versione espongono statistiche annuali.';
  if(source()==='eea'){
    $('avgLabel').textContent='Media stazioni';
    $('countLabel').textContent='Stazioni';
    $('countUnit').textContent='visualizzate';
    $('listTitle').textContent='Stazioni visualizzate';
  }else{
    $('avgLabel').textContent='Valore MED';
    $('countLabel').textContent='Ambito';
    $('countUnit').textContent='comunale';
    $('listTitle').textContent='Valutazione visualizzata';
  }
}

function pollutantCodeMatches(raw,code){
  const v=String(raw??'').trim();
  return v===code||v.endsWith('/'+code)||v.endsWith(':'+code)
}
function isAnnualMean(p){
  const a=normalizeText(p.DataAggregationName_orig);
  const proc=normalizeText(p.DataAggregationProcess);
  const metric=normalizeText(p.ReportingMetric);
  return a.includes('annual mean')||a.includes('annual average')||
         proc==='p1y'||proc.includes('p1y')||
         metric.includes('annual mean')||metric.includes('annual average')
}
function isMicrogramUnit(raw){
  const v=normalizeText(raw).replaceAll('³','3');
  return !v||v.includes('µg')||v.includes('μg')||v.includes('ug')||v.includes('microgram')
}
function eeaScore(p){
  let score=0;
  const ver=normalizeText(p.DataVerification);
  const prelim=normalizeText(p.Preliminary);
  if(ver.includes('verified')&&!ver.includes('unverified'))score+=100;
  if(['','0','false','n'].includes(prelim))score+=30;
  const coverage=Number(p.DataCoverage??p.DataCapture??0);
  if(Number.isFinite(coverage))score+=Math.min(coverage,100)/10;
  return score
}

async function fetchEeaRows(year,pollutant){
  const cacheKey=`${year}:${pollutant}`;
  if(state.eeaCache.has(cacheKey))return state.eeaCache.get(cacheKey);

  const cfg=POLLUTANTS[pollutant];
  const params=new URLSearchParams({
    where:`Country_ISO='IT' AND YearOfStatistics=${Number(year)}`,
    geometry:ROME.bbox.join(','),
    geometryType:'esriGeometryEnvelope',
    inSR:'4326',
    spatialRel:'esriSpatialRelIntersects',
    outFields:[
      'AirPollutant','AirPollutantName','AirPollutionLevel','AirQualityEoICode',
      'AirQualityStation','DataAggregationName_orig','DataAggregationProcess',
      'DataCapture','DataCoverage','DataVerification','LatitudeOfMeasurementStation',
      'LongitudeOfMeasurementStation','Preliminary','ReportingMetric','StationName',
      'Timecoverage','UnitOfAirpollutionLevel','YearOfStatistics'
    ].join(','),
    returnGeometry:'true',
    outSR:'4326',
    resultRecordCount:'1000',
    f:'geojson'
  });

  const response=await fetch(`${EEA_QUERY}?${params}`,{cache:'no-store'});
  if(!response.ok)throw new Error(`EEA: HTTP ${response.status}`);
  const data=await response.json();
  if(data.error)throw new Error(`EEA: ${data.error.message||'errore API'}`);

  const candidates=(data.features||[]).filter(f=>{
    const p=f.properties||{};
    return pollutantCodeMatches(p.AirPollutant,cfg.eeaCode) &&
           isAnnualMean(p) &&
           isMicrogramUnit(p.UnitOfAirpollutionLevel) &&
           Number.isFinite(Number(p.AirPollutionLevel))
  });

  const best=new Map();
  for(const f of candidates){
    const p=f.properties||{};
    const id=String(p.AirQualityEoICode||p.AirQualityStation||p.StationName||'').trim();
    if(!id)continue;
    const coverage=Number(p.DataCoverage??p.Timecoverage??p.DataCapture);
    if(Number.isFinite(coverage)&&coverage>0&&coverage<75)continue;
    const score=eeaScore(p);
    if(!best.has(id)||score>best.get(id).score)best.set(id,{f,score})
  }

  const rows=[...best.entries()].map(([id,{f}])=>{
    const p=f.properties||{};
    const coords=f.geometry?.coordinates||[];
    const lon=Number(coords[0]??p.LongitudeOfMeasurementStation);
    const lat=Number(coords[1]??p.LatitudeOfMeasurementStation);
    const coverage=Number(p.DataCoverage??p.Timecoverage??p.DataCapture);
    const verification=String(p.DataVerification||'');
    const prelim=normalizeText(p.Preliminary);
    return{
      id,
      name:String(p.StationName||p.AirQualityStation||id),
      lat,lon,
      value:Number(p.AirPollutionLevel),
      coverage:Number.isFinite(coverage)?coverage:null,
      verification,
      provisional:prelim==='1'||prelim==='true'||prelim==='y'||normalizeText(verification).includes('unverified'),
      kind:'station',
      provider:'EEA'
    }
  }).filter(r=>Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&Number.isFinite(r.value))
    .sort((a,b)=>a.name.localeCompare(b.name,'it'));

  if(!rows.length)throw new Error(`EEA: nessuna media annuale ${pollutant} trovata nell'area di Roma per il ${year}.`);
  state.eeaCache.set(cacheKey,rows);
  return rows
}

function jsonp(url,params,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const callback=`__qa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    let done=false;
    const cleanup=()=>{
      if(done)return;done=true;
      clearTimeout(timer);script.remove();
      try{delete window[callback]}catch{window[callback]=undefined}
    };
    window[callback]=data=>{cleanup();resolve(data)};
    params={...params,callback};
    script.src=`${url}?${new URLSearchParams(params)}`;
    script.onerror=()=>{cleanup();reject(new Error('ARPA Lazio: errore di collegamento al Data API'))};
    const timer=setTimeout(()=>{cleanup();reject(new Error('ARPA Lazio: timeout Data API'))},timeoutMs);
    document.head.appendChild(script)
  })
}

function arpaField(record,prefix,suffix){
  const p=normalizeText(prefix);
  const s=normalizeText(suffix);
  return Object.keys(record).find(k=>{
    const n=normalizeText(k);
    return n.includes(p)&&n.endsWith(s)
  })
}
function isRomeRecord(record){
  const code=String(record['cod ISTAT']??'').replace(/\D/g,'').padStart(6,'0');
  return code==='058091'||normalizeText(record.nome)==='roma'||normalizeText(record.nome)==='roma capitale'
}

async function fetchArpaRows(year,pollutant){
  const cacheKey=`${year}:${pollutant}`;
  if(state.arpaCache.has(cacheKey))return state.arpaCache.get(cacheKey);

  const resourceId=ARPA_RESOURCES[year];
  if(!resourceId)throw new Error(`ARPA Lazio: anno ${year} non disponibile nel Data API configurato.`);

  const payload=await jsonp(ARPA_API,{resource_id:resourceId,limit:500});
  if(!payload?.success)throw new Error('ARPA Lazio: risposta Data API non valida.');

  const records=payload.result?.records||[];
  const record=records.find(isRomeRecord);
  if(!record)throw new Error(`ARPA Lazio: record del Comune di Roma non trovato per il ${year}.`);

  const prefix=POLLUTANTS[pollutant].arpaPrefix;
  const fieldMed=arpaField(record,prefix,'MED');
  const fieldMin=arpaField(record,prefix,'MIN');
  const fieldMax=arpaField(record,prefix,'MAX');

  const med=parseNumber(record[fieldMed]);
  const min=parseNumber(record[fieldMin]);
  const max=parseNumber(record[fieldMax]);

  if(med===null)throw new Error(`ARPA Lazio: valore MED ${pollutant} non disponibile per Roma nel ${year}.`);

  const rows=[{
    id:'ARPA-ROMA-058091',
    name:'Roma · valutazione comunale',
    lat:ROME.center[1],lon:ROME.center[0],
    value:med,min,max,
    zone:String(record.zona||''),
    kind:'municipal',
    provider:'ARPA Lazio'
  }];
  state.arpaCache.set(cacheKey,rows);
  return rows
}

async function rowsFor(year){
  const pollutant=$('pollutantSelect').value;
  if(source()==='eea')return fetchEeaRows(year,pollutant);
  if(source()==='arpa')return fetchArpaRows(year,pollutant);
  throw new Error('Fonte dati non supportata.')
}

async function differenceRows(){
  const [a,b]=await Promise.all([rowsFor($('compareYearA').value),rowsFor($('compareYearB').value)]);
  const index=new Map(a.map(r=>[r.id,r]));
  return b.filter(r=>index.has(r.id)).map(r=>({
    ...r,
    value:+(r.value-index.get(r.id).value).toFixed(1),
    min:null,max:null
  }))
}

function toGeoJSON(rows){
  return{
    type:'FeatureCollection',
    features:rows.map(r=>({
      type:'Feature',
      properties:{
        id:r.id,name:r.name,value:r.value,label:fmt(r.value),
        coverage:r.coverage??'',kind:r.kind||'station',
        min:r.min??'',max:r.max??'',provider:r.provider||''
      },
      geometry:{type:'Point',coordinates:[r.lon,r.lat]}
    }))
  }
}
function toDifferenceGeoJSON(rows){
  return{
    type:'FeatureCollection',
    features:rows.map(r=>({
      type:'Feature',
      properties:{
        id:r.id,name:r.name,delta:r.value,absDelta:Math.abs(r.value),
        label:`${r.value>0?'+':''}${fmt(r.value)}`,kind:r.kind||'station'
      },
      geometry:{type:'Point',coordinates:[r.lon,r.lat]}
    }))
  }
}

function addAirLayers(map,prefix='air'){
  if(map.getSource(`${prefix}-source`))return;
  map.addSource(`${prefix}-source`,{type:'geojson',data:{type:'FeatureCollection',features:[]}});

  map.addLayer({
    id:`${prefix}-heat`,type:'heatmap',source:`${prefix}-source`,
    filter:['==',['get','kind'],'station'],
    maxzoom:15,
    paint:{
      'heatmap-weight':['interpolate',['linear'],['get','value'],0,0,40,1],
      'heatmap-intensity':['interpolate',['linear'],['zoom'],8,.72,12,1.3],
      'heatmap-radius':['interpolate',['linear'],['zoom'],8,38,10,68,12,105],
      'heatmap-opacity':['interpolate',['linear'],['zoom'],8,.56,12,.7,15,.22],
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],
        0,'rgba(53,208,127,0)',.12,'rgba(53,208,127,.72)',
        .35,'rgba(230,207,67,.78)',.58,'rgba(255,145,77,.82)',
        .82,'rgba(255,88,100,.9)',1,'rgba(174,22,31,.94)']
    }
  });

  map.addLayer({
    id:`${prefix}-municipal-halo`,type:'circle',source:`${prefix}-source`,
    filter:['==',['get','kind'],'municipal'],
    paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],8,34,10,56,12,88],
      'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'circle-opacity':.22,
      'circle-stroke-width':1.5,'circle-stroke-color':'rgba(255,255,255,.55)'
    }
  });

  map.addLayer({
    id:`${prefix}-points`,type:'circle',source:`${prefix}-source`,
    paint:{
      'circle-radius':['case',['==',['get','kind'],'municipal'],17,
        ['interpolate',['linear'],['zoom'],8,8,10,11,13,14]],
      'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-opacity':.98
    }
  });

  map.addLayer({
    id:`${prefix}-labels`,type:'symbol',source:`${prefix}-source`,
    layout:{
      'text-field':['get','label'],
      'text-size':['case',['==',['get','kind'],'municipal'],11,
        ['interpolate',['linear'],['zoom'],8,8,10,9,13,11]],
      'text-allow-overlap':true,'text-ignore-placement':true
    },
    paint:{'text-color':'#07111d','text-halo-color':'rgba(255,255,255,.92)','text-halo-width':1}
  });

  map.on('click',`${prefix}-points`,e=>{
    const f=e.features?.[0];if(!f)return;
    const p=f.properties;
    let extra='';
    if(p.kind==='municipal'){
      if(p.min!==''&&p.max!=='')extra=`<br>MIN ${fmt(p.min)} · MAX ${fmt(p.max)} µg/m³`;
    }else{
      const coverage=Number(p.coverage);
      if(Number.isFinite(coverage)&&coverage>0)extra=`<br>Copertura dati: ${fmt(coverage)}%`;
    }
    new maplibregl.Popup({offset:18})
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${p.name}</strong><br>${fmt(p.value)} µg/m³${extra}`)
      .addTo(map)
  });
}

function addDifferenceLayers(map){
  if(map.getSource('diff-source'))return;
  map.addSource('diff-source',{type:'geojson',data:{type:'FeatureCollection',features:[]}});

  const heatBase={
    type:'heatmap',source:'diff-source',
    filter:['==',['get','kind'],'station'],
    maxzoom:15,
    paint:{
      'heatmap-weight':['interpolate',['linear'],['get','absDelta'],0,0,15,1],
      'heatmap-intensity':1.2,
      'heatmap-radius':['interpolate',['linear'],['zoom'],8,42,10,75,12,110],
      'heatmap-opacity':.68
    }
  };
  map.addLayer({...heatBase,id:'diff-good',
    filter:['all',['==',['get','kind'],'station'],['<=',['get','delta'],0]],
    paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],
      0,'rgba(24,165,91,0)',.18,'rgba(24,165,91,.35)',.5,'rgba(24,165,91,.62)',1,'rgba(0,117,58,.88)']}
  });
  map.addLayer({...heatBase,id:'diff-bad',
    filter:['all',['==',['get','kind'],'station'],['>',['get','delta'],0]],
    paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],
      0,'rgba(229,71,71,0)',.18,'rgba(229,71,71,.35)',.5,'rgba(229,71,71,.62)',1,'rgba(183,22,22,.9)']}
  });
  map.addLayer({
    id:'diff-points',type:'circle',source:'diff-source',
    paint:{
      'circle-radius':['case',['==',['get','kind'],'municipal'],17,
        ['interpolate',['linear'],['zoom'],8,8,10,11,13,14]],
      'circle-color':['case',['<=',['get','delta'],0],'#21b866','#ef4f4f'],
      'circle-stroke-width':2,'circle-stroke-color':'#fff'
    }
  });
  map.addLayer({
    id:'diff-labels',type:'symbol',source:'diff-source',
    layout:{
      'text-field':['get','label'],
      'text-size':['case',['==',['get','kind'],'municipal'],10,
        ['interpolate',['linear'],['zoom'],8,7,10,9,13,10]],
      'text-allow-overlap':true,'text-ignore-placement':true
    },
    paint:{'text-color':'#07111d','text-halo-color':'rgba(255,255,255,.92)','text-halo-width':1}
  });
}

function setAirData(map,rows,prefix='air'){
  map?.getSource(`${prefix}-source`)?.setData(toGeoJSON(rows))
}
function setDifferenceData(map,rows){
  map?.getSource('diff-source')?.setData(toDifferenceGeoJSON(rows))
}
function setLayerVisibility(map,ids,visible){
  ids.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')})
}
function showAirOnSingle(rows){
  setAirData(state.map,rows);
  setLayerVisibility(state.map,['air-heat','air-municipal-halo','air-points','air-labels'],true);
  setLayerVisibility(state.map,['diff-good','diff-bad','diff-points','diff-labels'],false)
}
function showDifferenceOnSingle(rows){
  setDifferenceData(state.map,rows);
  setLayerVisibility(state.map,['air-heat','air-municipal-halo','air-points','air-labels'],false);
  setLayerVisibility(state.map,['diff-good','diff-bad','diff-points','diff-labels'],true)
}

function renderList(rows,isDiff=false){
  if(!rows.length){
    $('stations').innerHTML='<div class="empty-state">Nessun dato reale disponibile per questa selezione.</div>';
    return
  }
  $('stations').innerHTML=rows.map(r=>{
    const range=(!isDiff&&r.kind==='municipal'&&r.min!==null&&r.max!==null)
      ?`<div class="metric-range"><span>MIN ${fmt(r.min)}</span><span>MED ${fmt(r.value)}</span><span>MAX ${fmt(r.max)} µg/m³</span></div>`
      :'';
    const detail=r.kind==='station'
      ?`${r.id}${r.coverage?` · copertura ${fmt(r.coverage)}%`:''}`
      :`Comune di Roma${r.zone?` · zona ${r.zone}`:''}`;
    return `<div class="station-row">
      <i style="background:${isDiff?(r.value<=0?'#35d07f':'#ff5864'):colorFor(r.value)}"></i>
      <div><strong>${r.name}</strong><small>${detail}</small>${range}</div>
      <b>${isDiff&&r.value>0?'+':''}${fmt(r.value)}</b>
    </div>`
  }).join('')
}

function setLoading(on){
  $('loadingOverlay').classList.toggle('hidden',!on);
  $('loadingText').textContent=source()==='eea'?'Caricamento dati EEA…':'Caricamento dati ARPA Lazio…'
}
function sourceNotice(rows){
  if(source()==='arpa')return'ARPA Lazio · Standard comunali';
  return rows.some(r=>r.provisional)
    ?'EEA · presenti dati provvisori'
    :'EEA · statistiche annuali'
}

async function updateCompareMaps(){
  const [a,b]=await Promise.all([rowsFor($('compareYearA').value),rowsFor($('compareYearB').value)]);
  setAirData(state.mapBefore,a,'before');
  setAirData(state.mapAfter,b,'after');
  $('beforeBadge').textContent=$('compareYearA').value;
  $('afterBadge').textContent=$('compareYearB').value;
  return{a,b}
}

async function render(){
  if(!state.map)return;
  const token=++state.renderToken;
  setLoading(true);

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
      rows=await differenceRows();
      if(token!==state.renderToken)return;
      showDifferenceOnSingle(rows);
      renderList(rows,true);
      $('mapBadge').textContent=`Δ ${$('compareYearB').value} − ${$('compareYearA').value}`;
      $('avgLabel').textContent=source()==='arpa'?'Differenza MED':'Differenza media stazioni';
      const a=avg(rows);$('avgValue').textContent=`${a>0?'+':''}${fmt(a)}`;
      $('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
    }else if(state.mode==='compare'){
      const pair=await updateCompareMaps();
      if(token!==state.renderToken)return;
      rows=pair.b;
      renderList(rows);
      $('avgLabel').textContent=source()==='arpa'?`MED ${$('compareYearB').value}`:`Media stazioni ${$('compareYearB').value}`;
      $('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=`${$('compareYearA').value}↔${$('compareYearB').value}`;
      requestAnimationFrame(()=>{state.mapBefore.resize();state.mapAfter.resize()});
    }else{
      rows=await rowsFor($('yearSelect').value);
      if(token!==state.renderToken)return;
      showAirOnSingle(rows);
      renderList(rows);
      $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · ${$('yearSelect').value}`;
      $('avgLabel').textContent=source()==='arpa'?'Valore MED':'Media stazioni';
      $('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=$('yearSelect').value;
    }

    $('stationCount').textContent=source()==='arpa'?'Roma':rows.length;
    $('sourceValue').textContent=SOURCE_INFO[source()].name;
    $('dataNotice').textContent=sourceNotice(rows);
    $('mapHint').textContent=SOURCE_INFO[source()].hint;
  }catch(err){
    console.error(err);
    if(token!==state.renderToken)return;
    showAirOnSingle([]);
    renderList([]);
    $('stationCount').textContent='—';
    $('avgValue').textContent='—';
    $('dataNotice').textContent='Dati non disponibili';
    showToast(err.message||'Errore nel caricamento dei dati')
  }finally{
    if(token===state.renderToken)setLoading(false)
  }
}

function updateSwipe(percent){
  const p=Math.max(2,Math.min(98,percent));
  state.swipe=p;
  $('afterClip').style.clipPath=`inset(0 0 0 ${p}%)`;
  $('swipeDivider').style.left=`${p}%`;
  $('swipeDivider').setAttribute('aria-valuenow',String(Math.round(p)))
}
function bindSwipe(){
  const wrap=$('compareMapWrap');
  let dragging=false;
  const apply=e=>{
    const r=wrap.getBoundingClientRect();
    updateSwipe((e.clientX-r.left)/r.width*100)
  };
  $('swipeDivider').addEventListener('pointerdown',e=>{
    dragging=true;$('swipeDivider').setPointerCapture(e.pointerId);e.preventDefault()
  });
  $('swipeDivider').addEventListener('pointermove',e=>{if(dragging)apply(e)});
  $('swipeDivider').addEventListener('pointerup',()=>dragging=false);
  $('swipeDivider').addEventListener('pointercancel',()=>dragging=false);
  $('swipeDivider').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){updateSwipe(state.swipe-3);e.preventDefault()}
    if(e.key==='ArrowRight'){updateSwipe(state.swipe+3);e.preventDefault()}
  })
}

function baseMap(container){
  return new maplibregl.Map({
    container,style:MAP_STYLE,center:ROME.center,zoom:ROME.zoom,attributionControl:true
  })
}
function initMaps(){
  state.map=baseMap('map');
  state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  state.map.on('load',()=>{
    addAirLayers(state.map);
    addDifferenceLayers(state.map);
    render()
  });

  state.mapBefore=baseMap('mapBefore');
  state.mapAfter=baseMap('mapAfter');
  state.mapBefore.on('load',()=>{
    addAirLayers(state.mapBefore,'before');
    if(state.mapAfter.loaded())render()
  });
  state.mapAfter.on('load',()=>{
    addAirLayers(state.mapAfter,'after');
    if(state.mapBefore.loaded())render()
  });

  const sync=(from,to)=>{
    if(state.syncing||!to)return;
    state.syncing=true;
    to.jumpTo({
      center:from.getCenter(),zoom:from.getZoom(),
      bearing:from.getBearing(),pitch:from.getPitch()
    });
    state.syncing=false
  };
  state.mapBefore.on('move',()=>sync(state.mapBefore,state.mapAfter));
  state.mapAfter.on('move',()=>sync(state.mapAfter,state.mapBefore))
}

function showToast(text){
  clearTimeout(state.toastTimer);
  $('toast').textContent=text;
  $('toast').classList.remove('hidden');
  state.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),5200)
}
async function installApp(){
  if(window.matchMedia('(display-mode: standalone)').matches){
    showToast('L’app è già installata sul dispositivo.');return
  }
  if(state.deferredPrompt){
    state.deferredPrompt.prompt();
    await state.deferredPrompt.userChoice;
    state.deferredPrompt=null;
    return
  }
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  showToast(isiOS
    ?'Su iPhone/iPad: apri Condividi e scegli “Aggiungi alla schermata Home”.'
    :'Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.')
}

function bind(){
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.mode=btn.dataset.mode;
    configureSourceUI();
    render()
  }));

  $('sourceSelect').addEventListener('change',()=>{
    fillYears();
    configureSourceUI();
    render()
  });
  ['pollutantSelect','yearSelect','compareYearA','compareYearB']
    .forEach(id=>$(id).addEventListener('change',render));

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();state.deferredPrompt=e
  });
  $('installBtn').addEventListener('click',installApp);
  bindSwipe()
}

async function loadVersion(){
  const [appVersion,dataVersion]=await Promise.all([
    fetch('version.json?v=0.1.3',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.1.3',{cache:'no-store'}).then(r=>r.json())
  ]);
  $('appVersion').textContent=appVersion.version;
  $('dataVersion').textContent=dataVersion.version
}

async function boot(){
  fillYears();
  configureSourceUI();
  bind();
  await loadVersion();
  initMaps();
  if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./service-worker.js?v=0.1.3')
      .then(reg=>reg.update()).catch(console.error)
  }
}
boot().catch(err=>{
  console.error(err);
  $('dataNotice').textContent='Errore di inizializzazione';
  showToast(err.message||'Errore di inizializzazione')
})
