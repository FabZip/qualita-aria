const state={
  mode:'map',
  map:null,mapBefore:null,mapAfter:null,
  deferredPrompt:null,swipe:50,syncing:false,
  toastTimer:null,renderToken:0,
  eeaCache:new Map(),arpaCache:new Map(),
  romeBoundary:null,
  diagnostics:{}
};

const $=id=>document.getElementById(id);
const MAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};

/*
 * EEA:
 * Use Discodata AirQualityStatistics instead of the AQ_Statistics_WM "Exceedance"
 * ArcGIS layer. The table exposes station-level annual statistics directly.
 */
const EEA_SQL_API='https://discodata.eea.europa.eu/sql';

/*
 * ARPA Lazio:
 * Annual municipal indicators are loaded from Open Data Lazio (CKAN DataStore).
 */
const ARPA_API='https://dati.lazio.it/api/3/action/datastore_search';

/*
 * Geographic scope for the Comune di Roma:
 * public Rome/ATAC ArcGIS municipality polygons. We render the polygons rather
 * than a screen-pixel circle so their geographic extent remains fixed on zoom.
 */
const ROME_MUNICIPI_QUERY='https://viaggiacon.atac.roma.it/server/rest/services/Viaggiacon/IdentifyMunicipiWgs84/MapServer/0/query';

const POLLUTANTS={
  'PM2.5':{eeaCode:6001,label:'PM2.5',arpaPrefix:'PM2.5 media annua'},
  'PM10':{eeaCode:5,label:'PM10',arpaPrefix:'PM10 media annua'},
  'NO2':{eeaCode:8,label:'NO₂',arpaPrefix:'NO2 media annua'}
};

const EEA_YEARS=Array.from({length:13},(_,i)=>String(2025-i));

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
    description:'<strong>EEA:</strong> statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.',
    hint:"Le aree colorate sono un'interpolazione grafica dei valori delle stazioni EEA mostrate sulla mappa; non sono una superficie modellistica ufficiale."
  },
  arpa:{
    name:'ARPA Lazio',
    years:Object.keys(ARPA_RESOURCES).sort((a,b)=>Number(b)-Number(a)),
    description:'<strong>ARPA Lazio:</strong> valutazione annuale modellistica a livello comunale, ottenuta combinando rete di monitoraggio e modello di dispersione.',
    hint:'Il colore copre il territorio amministrativo di Roma per mostrare a quale area si riferisce il dato comunale. Non significa che la concentrazione sia uniforme in ogni punto del Comune.'
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
function diagnostics(payload){
  state.diagnostics=payload;
  if($('diagnosticsContent')){
    $('diagnosticsContent').textContent=JSON.stringify(payload,null,2)
  }
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
    $('countUnit').textContent='Comune di Roma';
    $('listTitle').textContent='Valutazione visualizzata';
  }
}

function eeaSql(year,pollutant){
  const code=POLLUTANTS[pollutant].eeaCode;
  const [minLon,minLat,maxLon,maxLat]=ROME.bbox;
  return `
SELECT
  AcceptedforProducts,
  AirPollutant,
  AirPollutantCode,
  AirPollutantDescription,
  AirPollutionLevel,
  AirQualityStation,
  AirQualityStationEoICode,
  AQStationName,
  AirQualityStationArea,
  AirQualityStationType,
  component_code,
  CountryCode,
  DataAggregationProcess,
  DataAggregationProcessId,
  DataCapture,
  DataCoverage,
  Latitude,
  Longitude,
  potentialOutlier,
  Timecoverage,
  UnitOfAirpollutionLevel,
  Verification,
  YearOfStatistics
FROM [AirQualityDataFlows].[latest].[AirQualityStatistics]
WHERE CountryCode='IT'
  AND YearOfStatistics=${Number(year)}
  AND component_code=${Number(code)}
  AND Latitude BETWEEN ${minLat} AND ${maxLat}
  AND Longitude BETWEEN ${minLon} AND ${maxLon}
  AND AirPollutionLevel IS NOT NULL
  AND (
    DataAggregationProcessId='P1Y'
    OR DataAggregationProcessId LIKE '%/P1Y'
    OR DataAggregationProcess='P1Y'
    OR DataAggregationProcess LIKE '%Annual mean%'
  )
`.trim()
}

function acceptedRank(v){
  const n=normalizeText(v);
  return ['1','true','yes','y'].includes(n)?100:0
}
function verificationRank(v){
  const n=normalizeText(v);
  if(n.includes('verified')&&!n.includes('unverified'))return 60;
  if(n.includes('unverified'))return 0;
  return 20
}
function eeaRecordScore(r){
  let score=acceptedRank(r.AcceptedforProducts)+verificationRank(r.Verification);
  const coverage=parseNumber(r.DataCoverage??r.Timecoverage??r.DataCapture);
  if(coverage!==null)score+=Math.max(0,Math.min(100,coverage))/10;
  return score
}

async function fetchEeaRows(year,pollutant){
  const cacheKey=`${year}:${pollutant}`;
  if(state.eeaCache.has(cacheKey)){
    const cached=state.eeaCache.get(cacheKey);
    diagnostics({...cached.diagnostic,cache:'memory'});
    return cached.rows
  }

  const sql=eeaSql(year,pollutant);
  const url=`${EEA_SQL_API}?${new URLSearchParams({query:sql,p:'1',nrOfHits:'1000'})}`;

  let response;
  let data;
  try{
    response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    data=await response.json()
  }catch(err){
    diagnostics({
      source:'EEA / Discodata',
      year,pollutant,
      aggregation:'P1Y annual mean',
      endpoint:EEA_SQL_API,
      error:String(err.message||err)
    });
    throw new Error(`EEA: impossibile leggere Discodata (${err.message||err}).`)
  }

  const raw=Array.isArray(data?.results)?data.results:
            Array.isArray(data)?data:
            Array.isArray(data?.data)?data.data:[];

  const best=new Map();
  for(const r of raw){
    const id=String(r.AirQualityStationEoICode||r.AirQualityStation||r.AQStationName||'').trim();
    const value=parseNumber(r.AirPollutionLevel);
    const lat=parseNumber(r.Latitude);
    const lon=parseNumber(r.Longitude);
    if(!id||value===null||lat===null||lon===null)continue;

    const candidate={raw:r,score:eeaRecordScore(r)};
    if(!best.has(id)||candidate.score>best.get(id).score)best.set(id,candidate)
  }

  const rows=[...best.entries()].map(([id,{raw:r}])=>{
    const coverage=parseNumber(r.DataCoverage??r.Timecoverage??r.DataCapture);
    return{
      id,
      name:String(r.AQStationName||r.AirQualityStation||id),
      lat:parseNumber(r.Latitude),
      lon:parseNumber(r.Longitude),
      value:parseNumber(r.AirPollutionLevel),
      coverage,
      verification:String(r.Verification||''),
      accepted:String(r.AcceptedforProducts??''),
      area:String(r.AirQualityStationArea||''),
      stationType:String(r.AirQualityStationType||''),
      kind:'station',
      provider:'EEA'
    }
  }).sort((a,b)=>a.name.localeCompare(b.name,'it'));

  const sample=raw[0]?{
    AQStationName:raw[0].AQStationName,
    AirQualityStationEoICode:raw[0].AirQualityStationEoICode,
    AirPollutionLevel:raw[0].AirPollutionLevel,
    UnitOfAirpollutionLevel:raw[0].UnitOfAirpollutionLevel,
    DataAggregationProcess:raw[0].DataAggregationProcess,
    DataAggregationProcessId:raw[0].DataAggregationProcessId,
    DataCoverage:raw[0].DataCoverage,
    Verification:raw[0].Verification,
    Latitude:raw[0].Latitude,
    Longitude:raw[0].Longitude
  }:null;

  const diagnostic={
    source:'EEA / Discodata',
    table:'AirQualityDataFlows.latest.AirQualityStatistics',
    year,pollutant,
    component_code:POLLUTANTS[pollutant].eeaCode,
    aggregation:'P1Y annual mean',
    boundingBox:ROME.bbox,
    rowsReceived:raw.length,
    stationsUsed:rows.length,
    sample
  };
  diagnostics(diagnostic);
  state.eeaCache.set(cacheKey,{rows,diagnostic});

  if(!rows.length){
    throw new Error(`EEA: Discodata ha restituito ${raw.length} record ma nessuna stazione utilizzabile per Roma, ${pollutant}, ${year}. Apri “Diagnostica dati ricevuti” per vedere il risultato.`)
  }
  return rows
}

function jsonp(url,params,timeoutMs=12000){
  return new Promise((resolve,reject)=>{
    const callback=`__qa_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script=document.createElement('script');
    let finished=false;
    let timer=null;
    const cleanup=()=>{
      if(finished)return;
      finished=true;
      if(timer)clearTimeout(timer);
      script.remove();
      try{delete window[callback]}catch{window[callback]=undefined}
    };
    window[callback]=data=>{cleanup();resolve(data)};
    params={...params,callback};
    script.src=`${url}?${new URLSearchParams(params)}`;
    script.onerror=()=>{cleanup();reject(new Error('errore di collegamento al Data API'))};
    timer=setTimeout(()=>{cleanup();reject(new Error('timeout Data API'))},timeoutMs);
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
  const raw=String(record['cod ISTAT']??record['Cod ISTAT']??record['cod_istat']??'').replace(/\D/g,'');
  const code=raw.padStart(6,'0');
  return code==='058091'||normalizeText(record.nome)==='roma'||normalizeText(record.nome)==='roma capitale'
}

async function fetchRomeBoundary(){
  if(state.romeBoundary)return state.romeBoundary;

  const params=new URLSearchParams({
    where:'1=1',
    outFields:'*',
    returnGeometry:'true',
    outSR:'4326',
    f:'geojson'
  });

  try{
    const response=await fetch(`${ROME_MUNICIPI_QUERY}?${params}`,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const geo=await response.json();
    if(!Array.isArray(geo?.features)||!geo.features.length)throw new Error('nessun poligono ricevuto');
    state.romeBoundary=geo;
    return geo
  }catch(err){
    // Fallback is only cartographic: ARPA value remains real. Do not fake a geographic circle.
    console.error('Perimetro Roma non disponibile',err);
    return null
  }
}

async function fetchArpaRows(year,pollutant){
  const cacheKey=`${year}:${pollutant}`;
  if(state.arpaCache.has(cacheKey)){
    const cached=state.arpaCache.get(cacheKey);
    diagnostics({...cached.diagnostic,cache:'memory'});
    return cached.rows
  }

  const resourceId=ARPA_RESOURCES[year];
  if(!resourceId)throw new Error(`ARPA Lazio: anno ${year} non configurato.`);

  let payload;
  try{
    payload=await jsonp(ARPA_API,{resource_id:resourceId,limit:500})
  }catch(err){
    diagnostics({source:'ARPA Lazio / Open Data Lazio',year,pollutant,error:String(err.message||err)});
    throw new Error(`ARPA Lazio: ${err.message||err}.`)
  }

  if(!payload?.success)throw new Error('ARPA Lazio: risposta Data API non valida.');

  const records=payload.result?.records||[];
  const record=records.find(isRomeRecord);
  if(!record){
    diagnostics({
      source:'ARPA Lazio / Open Data Lazio',
      year,pollutant,
      rowsReceived:records.length,
      romaRecordFound:false,
      sample:records[0]||null
    });
    throw new Error(`ARPA Lazio: record del Comune di Roma non trovato per il ${year}.`)
  }

  const prefix=POLLUTANTS[pollutant].arpaPrefix;
  const fieldMed=arpaField(record,prefix,'MED');
  const fieldMin=arpaField(record,prefix,'MIN');
  const fieldMax=arpaField(record,prefix,'MAX');

  const med=parseNumber(record[fieldMed]);
  const min=parseNumber(record[fieldMin]);
  const max=parseNumber(record[fieldMax]);

  if(med===null){
    diagnostics({
      source:'ARPA Lazio / Open Data Lazio',
      year,pollutant,
      rowsReceived:records.length,
      romaRecordFound:true,
      fields:{fieldMin,fieldMed,fieldMax},
      romaRecord:record
    });
    throw new Error(`ARPA Lazio: valore MED ${pollutant} non disponibile per Roma nel ${year}.`)
  }

  const boundary=await fetchRomeBoundary();
  const rows=[{
    id:'ARPA-ROMA-058091',
    name:'Roma · valutazione comunale',
    lat:ROME.center[1],lon:ROME.center[0],
    value:med,min,max,
    zone:String(record.zona||''),
    kind:'municipal',
    provider:'ARPA Lazio',
    boundary
  }];

  const diagnostic={
    source:'ARPA Lazio / Open Data Lazio',
    resourceId,
    year,pollutant,
    rowsReceived:records.length,
    romaRecordFound:true,
    metric:'MED',
    min,med,max,
    fields:{fieldMin,fieldMed,fieldMax},
    boundaryFeatures:boundary?.features?.length||0,
    note:'Il perimetro visualizzato indica il territorio a cui si riferisce il dato comunale; non una concentrazione uniforme.'
  };
  diagnostics(diagnostic);
  state.arpaCache.set(cacheKey,{rows,diagnostic});
  return rows
}

async function rowsFor(year){
  const pollutant=$('pollutantSelect').value;
  if(source()==='eea')return fetchEeaRows(year,pollutant);
  if(source()==='arpa')return fetchArpaRows(year,pollutant);
  throw new Error('Fonte dati non supportata.')
}

async function differenceRows(){
  const [a,b]=await Promise.all([
    rowsFor($('compareYearA').value),
    rowsFor($('compareYearB').value)
  ]);
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
        label:`${r.value>0?'+':''}${fmt(r.value)}`,
        kind:r.kind||'station'
      },
      geometry:{type:'Point',coordinates:[r.lon,r.lat]}
    }))
  }
}

function polygonGeoJSON(rows,difference=false){
  const municipal=rows.find(r=>r.kind==='municipal'&&r.boundary);
  if(!municipal)return{type:'FeatureCollection',features:[]};

  return{
    type:'FeatureCollection',
    features:municipal.boundary.features.map(f=>({
      type:'Feature',
      properties:{
        ...(f.properties||{}),
        value:municipal.value,
        delta:difference?municipal.value:null
      },
      geometry:f.geometry
    }))
  }
}

function addAirLayers(map,prefix='air'){
  if(map.getSource(`${prefix}-source`))return;

  map.addSource(`${prefix}-source`,{
    type:'geojson',
    data:{type:'FeatureCollection',features:[]}
  });
  map.addSource(`${prefix}-boundary`,{
    type:'geojson',
    data:{type:'FeatureCollection',features:[]}
  });

  map.addLayer({
    id:`${prefix}-boundary-fill`,
    type:'fill',
    source:`${prefix}-boundary`,
    paint:{
      'fill-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'fill-opacity':.28
    }
  });
  map.addLayer({
    id:`${prefix}-boundary-line`,
    type:'line',
    source:`${prefix}-boundary`,
    paint:{
      'line-color':'rgba(255,255,255,.58)',
      'line-width':['interpolate',['linear'],['zoom'],8,.7,12,1.3,15,2]
    }
  });

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
    id:`${prefix}-points`,type:'circle',source:`${prefix}-source`,
    paint:{
      'circle-radius':['case',
        ['==',['get','kind'],'municipal'],17,
        ['interpolate',['linear'],['zoom'],8,8,10,11,13,14]
      ],
      'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'circle-stroke-width':2,
      'circle-stroke-color':'#fff',
      'circle-opacity':.98
    }
  });

  map.addLayer({
    id:`${prefix}-labels`,type:'symbol',source:`${prefix}-source`,
    layout:{
      'text-field':['get','label'],
      'text-size':['case',
        ['==',['get','kind'],'municipal'],11,
        ['interpolate',['linear'],['zoom'],8,8,10,9,13,11]
      ],
      'text-allow-overlap':true,
      'text-ignore-placement':true
    },
    paint:{
      'text-color':'#07111d',
      'text-halo-color':'rgba(255,255,255,.92)',
      'text-halo-width':1
    }
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

  map.addSource('diff-source',{
    type:'geojson',
    data:{type:'FeatureCollection',features:[]}
  });
  map.addSource('diff-boundary',{
    type:'geojson',
    data:{type:'FeatureCollection',features:[]}
  });

  map.addLayer({
    id:'diff-boundary-fill',
    type:'fill',
    source:'diff-boundary',
    paint:{
      'fill-color':['case',['<=',['get','delta'],0],'#21b866','#ef4f4f'],
      'fill-opacity':.28
    }
  });
  map.addLayer({
    id:'diff-boundary-line',
    type:'line',
    source:'diff-boundary',
    paint:{
      'line-color':'rgba(255,255,255,.58)',
      'line-width':['interpolate',['linear'],['zoom'],8,.7,12,1.3,15,2]
    }
  });

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
      0,'rgba(24,165,91,0)',.18,'rgba(24,165,91,.35)',
      .5,'rgba(24,165,91,.62)',1,'rgba(0,117,58,.88)']}
  });

  map.addLayer({...heatBase,id:'diff-bad',
    filter:['all',['==',['get','kind'],'station'],['>',['get','delta'],0]],
    paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],
      0,'rgba(229,71,71,0)',.18,'rgba(229,71,71,.35)',
      .5,'rgba(229,71,71,.62)',1,'rgba(183,22,22,.9)']}
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
    paint:{
      'text-color':'#07111d',
      'text-halo-color':'rgba(255,255,255,.92)',
      'text-halo-width':1
    }
  });
}

function setAirData(map,rows,prefix='air'){
  map?.getSource(`${prefix}-source`)?.setData(toGeoJSON(rows));
  map?.getSource(`${prefix}-boundary`)?.setData(polygonGeoJSON(rows,false))
}
function setDifferenceData(map,rows){
  map?.getSource('diff-source')?.setData(toDifferenceGeoJSON(rows));
  map?.getSource('diff-boundary')?.setData(polygonGeoJSON(rows,true))
}
function setLayerVisibility(map,ids,visible){
  ids.forEach(id=>{
    if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')
  })
}
function showAirOnSingle(rows){
  setAirData(state.map,rows);
  setLayerVisibility(state.map,[
    'air-boundary-fill','air-boundary-line',
    'air-heat','air-points','air-labels'
  ],true);
  setLayerVisibility(state.map,[
    'diff-boundary-fill','diff-boundary-line',
    'diff-good','diff-bad','diff-points','diff-labels'
  ],false)
}
function showDifferenceOnSingle(rows){
  setDifferenceData(state.map,rows);
  setLayerVisibility(state.map,[
    'air-boundary-fill','air-boundary-line',
    'air-heat','air-points','air-labels'
  ],false);
  setLayerVisibility(state.map,[
    'diff-boundary-fill','diff-boundary-line',
    'diff-good','diff-bad','diff-points','diff-labels'
  ],true)
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
      ?`${r.id}${r.coverage!==null&&r.coverage!==undefined?` · copertura ${fmt(r.coverage)}%`:''}`
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
  $('loadingText').textContent=source()==='eea'
    ?'Caricamento EEA Discodata…'
    :'Caricamento ARPA Lazio…'
}

function sourceNotice(rows){
  if(source()==='arpa')return'ARPA Lazio · Standard comunali';
  const unverified=rows.some(r=>normalizeText(r.verification).includes('unverified'));
  return unverified?'EEA · presenti dati non verificati':'EEA · statistiche annuali P1Y'
}

async function updateCompareMaps(){
  const [a,b]=await Promise.all([
    rowsFor($('compareYearA').value),
    rowsFor($('compareYearB').value)
  ]);
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
      const a=avg(rows);
      $('avgValue').textContent=`${a>0?'+':''}${fmt(a)}`;
      $('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
    }else if(state.mode==='compare'){
      const pair=await updateCompareMaps();
      if(token!==state.renderToken)return;

      rows=pair.b;
      renderList(rows);
      $('avgLabel').textContent=source()==='arpa'
        ?`MED ${$('compareYearB').value}`
        :`Media stazioni ${$('compareYearB').value}`;
      $('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=`${$('compareYearA').value}↔${$('compareYearB').value}`;
      requestAnimationFrame(()=>{
        state.mapBefore.resize();
        state.mapAfter.resize()
      });
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
    dragging=true;
    $('swipeDivider').setPointerCapture(e.pointerId);
    e.preventDefault()
  });
  $('swipeDivider').addEventListener('pointermove',e=>{if(dragging)apply(e)});
  $('swipeDivider').addEventListener('pointerup',()=>dragging=false);
  $('swipeDivider').addEventListener('pointercancel',()=>dragging=false);
  $('swipeDivider').addEventListener('keydown',e=>{
    if(e.key==='ArrowLeft'){
      updateSwipe(state.swipe-3);e.preventDefault()
    }
    if(e.key==='ArrowRight'){
      updateSwipe(state.swipe+3);e.preventDefault()
    }
  })
}

function baseMap(container){
  return new maplibregl.Map({
    container,
    style:MAP_STYLE,
    center:ROME.center,
    zoom:ROME.zoom,
    attributionControl:true
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
      center:from.getCenter(),
      zoom:from.getZoom(),
      bearing:from.getBearing(),
      pitch:from.getPitch()
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
  state.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),6200)
}

async function installApp(){
  if(window.matchMedia('(display-mode: standalone)').matches){
    showToast('L’app è già installata sul dispositivo.');
    return
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
    e.preventDefault();
    state.deferredPrompt=e
  });

  $('installBtn').addEventListener('click',installApp);
  bindSwipe()
}

async function loadVersion(){
  const [appVersion,dataVersion]=await Promise.all([
    fetch('version.json?v=0.1.4',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.1.4',{cache:'no-store'}).then(r=>r.json())
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
    navigator.serviceWorker.register('./service-worker.js?v=0.1.4')
      .then(reg=>reg.update())
      .catch(console.error)
  }
}

boot().catch(err=>{
  console.error(err);
  $('dataNotice').textContent='Errore di inizializzazione';
  diagnostics({error:String(err.message||err)});
  showToast(err.message||'Errore di inizializzazione')
})
