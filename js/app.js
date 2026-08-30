const state={
  mode:'map',
  map:null,mapBefore:null,mapAfter:null,
  deferredPrompt:null,swipe:50,syncing:false,
  toastTimer:null,renderToken:0,
  eeaCache:new Map(),arpaCache:new Map(),
  arpaBoundaryCache:new Map(),
  eeaCities:new Map(),
  temperatureCache:new Map(),
  temperatureInflight:new Map(),
  temperaturePointCache:new Map(),
  temperaturePointInflight:new Map(),
  temperatureViewportKey:'',
  eeaValidatedInflight:new Map(),
  eeaViewportBbox:null,
  mapRefreshTimer:null,
  mapRefreshSuppressCount:0,
  viewportRefreshDepth:0,
  lastMapViewportKey:'',
  romeBoundary:null,
  diagnostics:{}
};

const $=id=>document.getElementById(id);
const MAP_STYLE='https://tiles.openfreemap.org/styles/positron';
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};
const EUROPE={center:[10.0,50.0],zoom:3.15,bbox:[-25.0,27.0,45.0,72.0]};
const EEA_CITY_RADIUS_KM=40;
const EEA_DEFAULT_CITY='roma';
const MAP_REFRESH_DELAY_MS=2000;
const TEMPERATURE_LAST_COMPLETE_YEAR=new Date().getUTCFullYear()-1;
const TEMPERATURE_YEARS=Array.from(
  {length:TEMPERATURE_LAST_COMPLETE_YEAR-1950+1},
  (_,index)=>String(TEMPERATURE_LAST_COMPLETE_YEAR-index)
);
const TEMPERATURE_METRICS={
  min:{label:'Minima media annuale',short:'MIN'},
  mean:{label:'Temperatura media annuale',short:'MEDIA'},
  max:{label:'Massima media annuale',short:'MAX'}
};
// Only expose tree years backed by annual statistics or documented events.
// 2016 is a partial May–December period, while 2022 has no usable record.
const TREE_YEARS=['2026','2025','2024','2023','2021','2020','2019','2018','2017'];
const TREE_MAP_PERIODS=[
  {value:'2026',label:'2026 eventi'},
  {value:'2025',label:'2025 eventi'},
  {value:'2024',label:'2024 eventi'},
  {value:'season-2024-2025',label:'2024 – mar. 2025'},
  {value:'2023',label:'2023 eventi'},
  {value:'period-2021-2025',label:'nov. 2021 – dic. 2025'},
  ...TREE_YEARS.filter(year=>Number(year)<=2021).map(year=>({value:year,label:year}))
];
const TREE_PERIOD_LABELS=new Map(TREE_MAP_PERIODS.map(item=>[item.value,item.label]));
const TREE_EVENTS_PER_PAGE=6;

const EEA_SCOPES={
  italy:{label:'Italia',country:'IT',kind:'country-city'},
  europe:{label:'Europa',bbox:EUROPE.bbox,center:EUROPE.center,zoom:EUROPE.zoom,country:null,kind:'region'}
};

/*
 * EEA:
 * Use Discodata AirQualityStatistics instead of the AQ_Statistics_WM "Exceedance"
 * ArcGIS layer. The table exposes station-level annual statistics directly.
 */
const EEA_SQL_API='https://discodata.eea.europa.eu/sql';

/*
 * ARPA Lazio:
 * Do not depend on the CKAN DataStore API at runtime.
 * The application reads the official static annual files published by ARPA Lazio.
 * 2013-2020 use ARPA CSV; 2021-2025 use ARPA XLSX. Open Data Lazio is not fetched at runtime because its download endpoint blocks cross-origin browser requests.
 */
const ARPA_STATIC_FILES={
  '2025':{type:'xlsx',url:'https://www.arpalazio.it/documents/20124/430865/Standard_Comunali_2025.xlsx'},
  '2024':{type:'xlsx',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2024.xlsx'},
  '2023':{type:'xlsx',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2023.xlsx'},
  '2022':{type:'xlsx',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2022.xlsx'},
  '2021':{type:'xlsx',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2021.xlsx'},
  '2020':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2020.csv'},
  '2019':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2019.csv'},
  '2018':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2018.csv'},
  '2017':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2017.csv'},
  '2016':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2016.csv'},
  '2015':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2015.csv'},
  '2014':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2014.csv'},
  '2013':{type:'csv',url:'https://www.arpalazio.it/documents/20124/430865/Standard_comunali_2013.csv'}
};

/*
 * Municipal boundaries in WGS84 derived from ISTAT limits.
 * The selected ARPA municipality determines which Lazio province file is loaded.
 */
const ARPA_BOUNDARY_URLS={
  '056':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_56_municipalities.geojson',
  '057':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_57_municipalities.geojson',
  '058':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_58_municipalities.geojson',
  '059':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_59_municipalities.geojson',
  '060':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_60_municipalities.geojson'
};

const POLLUTANTS={
  'PM2.5':{eeaCode:6001,label:'PM2.5',arpaPrefix:'PM2.5 media annua'},
  'PM10':{eeaCode:5,label:'PM10',arpaPrefix:'PM10 media annua'},
  'NO2':{eeaCode:8,label:'NO₂',arpaPrefix:'NO2 media annua'}
};

const EEA_YEARS=Array.from({length:13},(_,i)=>String(2025-i));

const ARPA_YEARS=Object.keys(ARPA_STATIC_FILES).sort((a,b)=>Number(b)-Number(a));

const SOURCE_INFO={
  eea:{
    name:'EEA',
    years:EEA_YEARS,
    description:'<strong>EEA:</strong> statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei. Le richieste passano da un proxy Cloudflare con cache condivisa; il capoluogo serve come punto di partenza e, spostando la mappa, i dati vengono aggiornati per l’area visibile dopo 2 secondi.',
    hint:"EEA mostra stazioni reali nell’area selezionata o nella zona visibile dopo uno spostamento della mappa. Il refresh parte 2 secondi dopo l’ultimo movimento. La sfumatura è solo una visualizzazione attorno alle stazioni, non una superficie modellata continua."
  },
  arpa:{
    name:'ARPA Lazio',
    years:ARPA_YEARS,
    description:'<strong>ARPA Lazio:</strong> stime comunali ufficiali. I dati sono letti dai file annuali pubblicati da ARPA, senza dipendere dal Data API CKAN.',
    hint:'Il colore copre il territorio amministrativo del comune selezionato per mostrare a quale area si riferisce il dato. Non significa che la concentrazione sia uniforme in ogni punto del territorio.'
  },
  temperature:{
    name:'ERA5-Land · Open-Meteo',
    years:TEMPERATURE_YEARS,
    description:'<strong>Temperatura:</strong> modalità indipendente dalle fonti inquinanti. Usa Copernicus ERA5-Land tramite <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>; puoi colorare la superficie con minima media annuale, temperatura media annuale o massima media annuale.',
    hint:'ERA5-Land è una rielaborazione climatica a celle, non una rete di stazioni. La superficie usa MIN / MEDIA / MAX selezionato; cliccando una cella vengono mostrati tutti e tre. Risoluzione circa 9 km.'
  }
};

function source(){return $('sourceSelect').value}
function isTemperature(){return state.mode==='temperature'}
function isTrees(){return source()==='trees'}
function eeaScope(){return $('eeaScopeSelect')?.value||'italy'}
function eeaCity(){return $('eeaCitySelect')?.value||EEA_DEFAULT_CITY}
function arpaMunicipality(){return $('arpaCitySelect')?.value||'058091'}

function eeaSelectedScope(){
  if(eeaScope()==='europe')return EEA_SCOPES.europe;

  const city=state.eeaCities.get(eeaCity())
    ||state.eeaCities.get(EEA_DEFAULT_CITY)
    ||{id:'roma',name:'Roma',lat:ROME.center[1],lon:ROME.center[0]};

  return eeaCityScope(city)
}

function eeaScopeKey(){
  if(state.eeaViewportBbox){
    const bbox=state.eeaViewportBbox
      .map(value=>Number(value).toFixed(4))
      .join(',');
    return`${eeaScope()}:viewport:${bbox}`
  }

  return eeaScope()==='italy'
    ?`italy:${eeaCity()}`
    :'europe'
}

function eeaCityScope(city){
  const lat=Number(city?.lat??ROME.center[1]);
  const lon=Number(city?.lon??ROME.center[0]);
  const latDelta=EEA_CITY_RADIUS_KM/111.32;
  const cosLat=Math.max(.25,Math.cos(lat*Math.PI/180));
  const lonDelta=EEA_CITY_RADIUS_KM/(111.32*cosLat);
  const name=String(city?.name||'Roma');

  return{
    key:`italy:${String(city?.id||EEA_DEFAULT_CITY)}`,
    label:`Italia · ${name}`,
    areaLabel:'Italia',
    cityLabel:name,
    bbox:[
      +(lon-lonDelta).toFixed(4),
      +(lat-latDelta).toFixed(4),
      +(lon+lonDelta).toFixed(4),
      +(lat+latDelta).toFixed(4)
    ],
    center:[lon,lat],
    zoom:9.2,
    country:'IT',
    kind:'city',
    selectedCityInsideViewport:true
  }
}

function pointInsideBbox(point,bbox){
  if(!point||!bbox)return false;
  const[lon,lat]=point;
  const[minLon,minLat,maxLon,maxLat]=bbox;
  return lon>=minLon&&lon<=maxLon&&lat>=minLat&&lat<=maxLat
}

function currentEeaScope(){
  const selected=eeaSelectedScope();
  if(!state.eeaViewportBbox)return selected;

  const bbox=[...state.eeaViewportBbox];
  const center=[
    (bbox[0]+bbox[2])/2,
    (bbox[1]+bbox[3])/2
  ];

  return{
    ...selected,
    key:`${eeaScope()}:viewport:${bbox.join(',')}`,
    label:eeaScope()==='italy'
      ?'Italia · area visibile'
      :'Europa · area visibile',
    bbox,
    center,
    zoom:state.mode==='compare'
      ?Number(state.mapBefore?.getZoom?.()??selected.zoom)
      :Number(state.map?.getZoom?.()??selected.zoom),
    kind:'viewport',
    selectedCityInsideViewport:selected.kind==='city'
      ?pointInsideBbox(selected.center,bbox)
      :false
  }
}

function currentYears(){return isTrees()?TREE_YEARS:(isTemperature()?TEMPERATURE_YEARS:SOURCE_INFO[source()].years)}
function normalizeText(v){return String(v??'').toLowerCase().replace(/\s+/g,' ').trim()}
function fmt(v){return Number(v).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:1})}
function avg(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:0}
function colorFor(v){if(v<10)return'#35d07f';if(v<20)return'#e6cf43';if(v<30)return'#ff914d';return'#ff5864'}
function parseNumber(v){
  if(v===null||v===undefined)return null;
  if(typeof v==='number')return Number.isFinite(v)?v:null;

  const raw=String(v).trim();
  if(!raw||/^(?:-|--|n\/?a|n\.d\.?|nd|null)$/i.test(raw))return null;

  // Italian decimal comma; tolerate spaces/non-breaking spaces.
  const normalized=raw
    .replace(/[\u00a0\s]/g,'')
    .replace(',','.');

  const n=Number(normalized);
  return Number.isFinite(n)?n:null
}
function diagnostics(payload){
  state.diagnostics=payload;
  if($('diagnosticsContent')){
    $('diagnosticsContent').textContent=JSON.stringify(payload,null,2)
  }
}

async function loadEeaCities(){
  const fallback=[{id:'roma',name:'Roma',lat:ROME.center[1],lon:ROME.center[0]}];
  let cities=fallback;

  try{
    const response=await fetch('data/italian-capitals.json?v=0.3.6',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    if(Array.isArray(payload?.cities)&&payload.cities.length){
      cities=payload.cities
    }
  }catch(err){
    console.warn('Elenco capoluoghi non disponibile, uso Roma come fallback.',err)
  }

  state.eeaCities=new Map(cities.map(city=>[String(city.id),city]));

  const select=$('eeaCitySelect');
  if(!select)return;

  const old=select.value||EEA_DEFAULT_CITY;
  select.replaceChildren(...cities.map(city=>{
    const option=document.createElement('option');
    option.value=String(city.id);
    option.textContent=String(city.name);
    return option
  }));

  select.value=state.eeaCities.has(old)?old:EEA_DEFAULT_CITY;
  if(!select.value&&select.options.length)select.selectedIndex=0
}

function fillYears(){
  const years=currentYears();
  const latest=isTrees()?TREE_MAP_PERIODS[0].value:years[0];
  const preferredA=isTrees()?'2019':(years.includes('2015')?'2015':years.at(-1));
  const preferredB=isTrees()?'2020':(years.includes('2023')?'2023':latest);

  for(const id of ['yearSelect','compareYearA','compareYearB']){
    const options=isTrees()&&id==='yearSelect'
      ?TREE_MAP_PERIODS.map(item=>item.value)
      :years;
    const old=$(id).value;
    $(id).innerHTML=options.map(y=>`<option value="${y}">${isTrees()?(TREE_PERIOD_LABELS.get(y)||y):y}</option>`).join('');
    if(old&&options.includes(old))$(id).value=old;
  }
  if(!(isTrees()?TREE_MAP_PERIODS.some(item=>item.value===$('yearSelect').value):years.includes($('yearSelect').value)))$('yearSelect').value=latest;
  if(!years.includes($('compareYearA').value))$('compareYearA').value=preferredA;
  if(!years.includes($('compareYearB').value))$('compareYearB').value=preferredB;
}

function setPeriodFieldLabel(text){
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

function configureTemperaturePeriod(){
  const select=$('monthSelect');
  const field=$('monthField');
  if(!select||!field)return;

  select.innerHTML='<option value="0">Intero anno</option>';
  select.value='0';
  select.dataset.temperatureMode='true';
  select.disabled=true;
  select.title='La temperatura usa MIN, MED e MAX dell’anno selezionato.';
  field.classList.add('hidden');
  setPeriodFieldLabel('Periodo')
}

function configureAnnualPeriod(){
  const select=$('monthSelect');
  const field=$('monthField');
  if(!select||!field)return;

  if(select.dataset.temperatureMode==='true'){
    select.dataset.temperatureValue=select.value;
  }

  select.innerHTML='<option value="0">Intero anno</option>';
  select.value='0';
  select.dataset.temperatureMode='false';
  select.disabled=true;
  select.title='La fonte attuale usa statistiche annuali.';
  setPeriodFieldLabel('Periodo')
}

function setTemperatureModeLock(active){
  const select=$('sourceSelect');
  if(!select)return;

  /*
   * La fonte continua a essere esclusivamente la fonte dell'inquinante.
   * In modalità Temperatura la conserviamo ma la rendiamo non modificabile.
   */
  select.disabled=active;
  select.title=active
    ?'Il selettore riguarda esclusivamente la fonte dell’inquinante.'
    :''
}

function applyTemperatureMapConstraints(active){
  const map=state.map;
  if(!map)return;

  map.setMinZoom(active?6:0);

  if(active&&map.getZoom()<6){
    withMapRefreshSuppressed(()=>{
      map.jumpTo({
        center:map.getCenter(),
        zoom:6,
        bearing:map.getBearing(),
        pitch:map.getPitch()
      })
    })
  }
}

function configureTemperatureLegend(active){
  const low=$('legendLow');
  const high=$('legendHigh');
  const gradient=$('standardGradient');

  if(active){
    if(low)low.textContent='Freddo';
    if(high)high.textContent='Caldo';
    gradient?.classList.remove('air-gradient');
    gradient?.classList.add('temp-gradient')
  }else{
    if(low)low.textContent='Bassa';
    if(high)high.textContent='Alta';
    gradient?.classList.remove('temp-gradient');
    gradient?.classList.add('air-gradient')
  }
}

function configureSourceUI(){
  const temperature=isTemperature();
  const trees=isTrees();
  if(trees){
    configureTreeCityOptions(true);
    $('sourceDescription').innerHTML='<strong>Alberi:</strong> eventi e bilanci arborei documentati da fonti comunali. Le statistiche non descrivono lo stato fitosanitario, la vitalità o la condizione degli alberi esistenti.';
    $('pollutantSourceField')?.classList.remove('hidden');
    $('eeaScopeField').classList.add('hidden');
    $('eeaCityField')?.classList.remove('hidden');
    $('arpaCityField')?.classList.add('hidden');
    $('pollutantField')?.classList.add('hidden');
    $('monthField')?.classList.add('hidden');
    $('treeLegend')?.classList.remove('hidden');
    if($('treeLegend')){
      $('treeLegend').innerHTML=state.mode==='difference'
        ?'<span><i class="tree-swatch tree-swatch-planted"></i>Saldo migliora</span><span><i class="tree-swatch tree-swatch-cut"></i>Saldo peggiora</span>'
        :'<span><i class="tree-swatch tree-swatch-planted"></i>Piantati</span><span><i class="tree-swatch tree-swatch-cut"></i>Tagliati / decrementi</span>'
    }
    $('standardLegend')?.classList.add('hidden');
    $('differenceLegend')?.classList.add('hidden');
    $('avgLabel').textContent='Saldo documentato';
    $('countLabel').textContent='Ambiti';
    $('countUnit').textContent='territoriali';
    $('listTitle').textContent='Statistiche arboree';
    if($('avgUnit'))$('avgUnit').textContent='alberi';
    return
  }

  configureTreeCityOptions(false);
  $('pollutantSourceField')?.classList.remove('hidden');
  $('treeLegend')?.classList.add('hidden');
  const info=temperature
    ?SOURCE_INFO.temperature
    :SOURCE_INFO[source()];

  const isEea=!temperature&&source()==='eea';
  const isArpa=!temperature&&source()==='arpa';
  const isItaly=isEea&&eeaScope()==='italy';

  $('sourceDescription').innerHTML=info.description;
  $('eeaScopeField').classList.toggle('hidden',!isEea);
  $('eeaCityField')?.classList.toggle('hidden',!isItaly);
  $('arpaCityField')?.classList.toggle('hidden',!isArpa);
  $('pollutantField')?.classList.toggle('hidden',temperature);
  $('temperatureMetricField')?.classList.toggle('hidden',!temperature);
  setTemperatureModeLock(temperature);
  applyTemperatureMapConstraints(temperature);
  configureTemperatureLegend(temperature);

  if(temperature){
    configureTemperaturePeriod();
    $('avgLabel').textContent='Temperatura';
    $('countLabel').textContent='Celle';
    $('countUnit').textContent='ERA5-Land';
    $('listTitle').textContent='Celle ERA5-Land visualizzate';

    if($('avgUnit'))$('avgUnit').textContent='°C';
    return
  }

  configureAnnualPeriod();
  if($('avgUnit'))$('avgUnit').textContent='µg/m³';

  if(isEea){
    $('avgLabel').textContent='Media stazioni';
    $('countLabel').textContent='Stazioni';
    $('countUnit').textContent='visualizzate';
    $('listTitle').textContent='Stazioni visualizzate';
  }else{
    const municipality=$('arpaCitySelect')?.selectedOptions?.[0]?.textContent||'Roma';
    $('avgLabel').textContent='Valore MED';
    $('countLabel').textContent='Ambito';
    $('countUnit').textContent=`Comune di ${municipality}`;
    $('listTitle').textContent='Valutazione visualizzata';
  }
}

function configureTreeCityOptions(active){
  const select=$('eeaCitySelect');
  if(!select)return;
  const treeCities=['roma','padova','bologna','torino'];
  const desired=active
    ?treeCities.map(id=>state.eeaCities.get(id)).filter(Boolean)
    :[...state.eeaCities.values()];
  const signature=`${active?'trees':'air'}:${desired.map(city=>city.id).join(',')}`;
  if(select.dataset.optionSignature===signature)return;
  const old=select.value;
  select.replaceChildren(...desired.map(city=>{
    const option=document.createElement('option');
    option.value=String(city.id);
    option.textContent=String(city.name);
    return option
  }));
  select.value=desired.some(city=>String(city.id)===old)?old:EEA_DEFAULT_CITY;
  select.dataset.optionSignature=signature
}

function eeaSpatialGridStep(bbox){
  const width=Math.max(0,Number(bbox?.[2])-Number(bbox?.[0]));
  const height=Math.max(0,Number(bbox?.[3])-Number(bbox?.[1]));
  const span=Math.max(width,height);

  if(span<=1.5)return .5;
  if(span<=4)return 1;
  if(span<=12)return 2;
  if(span<=30)return 5;
  return 10
}

function eeaSnapBbox(bbox){
  const step=eeaSpatialGridStep(bbox);
  const[minLon,minLat,maxLon,maxLat]=bbox;

  return[
    Math.max(-180,Math.floor(minLon/step)*step),
    Math.max(-85,Math.floor(minLat/step)*step),
    Math.min(180,Math.ceil(maxLon/step)*step),
    Math.min(85,Math.ceil(maxLat/step)*step)
  ].map(value=>Number(value.toFixed(4)))
}

function rowsInsideBbox(rows,bbox){
  const[minLon,minLat,maxLon,maxLat]=bbox;
  return rows.filter(row=>
    Number(row.lon)>=minLon&&Number(row.lon)<=maxLon&&
    Number(row.lat)>=minLat&&Number(row.lat)<=maxLat
  )
}

function eeaValidatedRegionKey(year,pollutant,country,bbox){
  return[
    'validated',
    country||'EU',
    String(year),
    pollutant,
    bbox.map(value=>Number(value).toFixed(4)).join(',')
  ].join(':')
}

function eeaSql(year,pollutant,{bbox=null,country=null}={}){
  const code=POLLUTANTS[pollutant].eeaCode;
  const scope=currentEeaScope();
  const effectiveBbox=bbox||scope.bbox;
  const effectiveCountry=country===null?scope.country:country;
  const [minLon,minLat,maxLon,maxLat]=effectiveBbox;

  const countryFilter=effectiveCountry
    ?`AND CountryCode='${effectiveCountry}'`
    :'';

  /*
   * Selezioniamo solo i campi realmente usati dall'app. Il filtro P1Y resta
   * nel WHERE ma non serve trasferire al browser colonne descrittive ridondanti.
   */
  return `
SELECT
  AcceptedforProducts,
  AirPollutionLevel,
  AirQualityStation,
  AirQualityStationEoICode,
  AQStationName,
  AirQualityStationArea,
  AirQualityStationType,
  CountryCode,
  DataCapture,
  DataCoverage,
  Latitude,
  Longitude,
  Timecoverage,
  Verification
FROM [AirQualityDataFlows].[latest].[AirQualityStatistics]
WHERE YearOfStatistics=${Number(year)}
  AND component_code=${Number(code)}
  ${countryFilter}
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

async function fetchDiscodataPages(sql,{pageSize=1000,maxPages=20}={}){
  const rows=[];

  for(let page=1;page<=maxPages;page++){
    const url=`${EEA_SQL_API}?${new URLSearchParams({
      query:sql,
      p:String(page),
      nrOfHits:String(pageSize)
    })}`;

    const response=await fetch(url,{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status} · pagina ${page}`);

    const data=await response.json();
    const chunk=Array.isArray(data?.results)?data.results:
      Array.isArray(data)?data:
      Array.isArray(data?.data)?data.data:[];

    rows.push(...chunk);

    if(chunk.length<pageSize){
      return{rows,pages:page,truncated:false}
    }
  }

  return{rows,pages:maxPages,truncated:true}
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
  const started=performance.now();
  const scope=currentEeaScope();
  const visibleBbox=[...scope.bbox];
  const queryBbox=eeaSnapBbox(visibleBbox);
  const regionKey=eeaValidatedRegionKey(
    year,
    pollutant,
    scope.country,
    queryBbox
  );

  function rowsForViewport(allRows,baseDiagnostic,cache){
    const rows=rowsInsideBbox(allRows,visibleBbox);
    diagnostics({
      ...baseDiagnostic,
      scope:scope.label,
      boundingBox:visibleBbox,
      queryBoundingBox:queryBbox,
      stationsUsed:rows.length,
      cache,
      durationMs:Math.round(performance.now()-started)
    });
    return rows
  }

  if(state.eeaCache.has(regionKey)){
    const cached=state.eeaCache.get(regionKey);
    return rowsForViewport(
      cached.allRows,
      cached.diagnostic,
      'memory-spatial'
    )
  }

  if(state.eeaValidatedInflight.has(regionKey)){
    const pending=await state.eeaValidatedInflight.get(regionKey);
    return rowsForViewport(
      pending.allRows,
      pending.diagnostic,
      pending.cacheLabel||'inflight-shared'
    )
  }

  const promise=(async()=>{
    /*
     * Via preferita: Worker EEA. La Cache API Cloudflare è condivisa tra
     * sessioni/browser e restituisce già righe normalizzate.
     */
    if(globalThis.QualitaAriaEEAProxy?.annual){
      try{
        const proxied=await QualitaAriaEEAProxy.annual({
          year,
          pollutant,
          country:scope.country||'',
          bbox:queryBbox
        });

        const allRows=Array.isArray(proxied.data?.results)
          ?proxied.data.results
          :[];

        const meta=proxied.data?.meta||{};
        const diagnostic={
          source:'EEA / edge proxy',
          table:'AirQualityDataFlows.latest.AirQualityStatistics',
          flow:'E1a',
          year,pollutant,
          component_code:POLLUTANTS[pollutant].eeaCode,
          aggregation:'P1Y annual mean',
          pages:meta.pages??1,
          truncated:Boolean(meta.truncated),
          rowsReceived:Number(meta.rowsReceived??allRows.length),
          stationsInCachedRegion:allRows.length,
          countries:[...new Set(allRows.map(r=>r.country).filter(Boolean))].sort(),
          spatialGridDegrees:eeaSpatialGridStep(visibleBbox),
          edgeCache:proxied.cache,
          proxyDurationMs:proxied.durationMs,
          upstreamMs:Number(meta.upstreamMs||0),
          generatedAt:meta.generatedAt||null,
          sample:allRows[0]||null
        };

        const entry={
          allRows,
          diagnostic,
          cacheLabel:`edge-${String(proxied.cache||'unknown').toLowerCase()}`
        };

        state.eeaCache.set(regionKey,entry);
        while(state.eeaCache.size>60){
          const first=state.eeaCache.keys().next().value;
          state.eeaCache.delete(first)
        }

        return entry
      }catch(err){
        console.warn(
          'Proxy EEA non disponibile, fallback diretto a Discodata.',
          err
        )
      }
    }

    /*
     * Fallback di resilienza: mantiene l'app utilizzabile anche se il Worker
     * EEA non è ancora stato distribuito o è temporaneamente irraggiungibile.
     */
    const sql=eeaSql(year,pollutant,{
      bbox:queryBbox,
      country:scope.country
    });

    let paged;
    try{
      paged=await fetchDiscodataPages(sql)
    }catch(err){
      diagnostics({
        source:'EEA / Discodata diretto',
        scope:scope.label,
        boundingBox:visibleBbox,
        queryBoundingBox:queryBbox,
        year,pollutant,
        aggregation:'P1Y annual mean',
        endpoint:EEA_SQL_API,
        error:String(err.message||err),
        durationMs:Math.round(performance.now()-started)
      });
      throw new Error(`EEA: impossibile leggere Discodata (${err.message||err}).`)
    }

    const raw=paged.rows;
    const best=new Map();

    for(const r of raw){
      const id=String(
        r.AirQualityStationEoICode||
        r.AirQualityStation||
        r.AQStationName||
        ''
      ).trim();

      const value=parseNumber(r.AirPollutionLevel);
      const lat=parseNumber(r.Latitude);
      const lon=parseNumber(r.Longitude);
      if(!id||value===null||lat===null||lon===null)continue;

      const candidate={raw:r,score:eeaRecordScore(r)};
      if(!best.has(id)||candidate.score>best.get(id).score){
        best.set(id,candidate)
      }
    }

    const allRows=[...best.entries()].map(([id,{raw:r}])=>({
      id,
      name:String(r.AQStationName||r.AirQualityStation||id),
      country:String(r.CountryCode||''),
      lat:parseNumber(r.Latitude),
      lon:parseNumber(r.Longitude),
      value:parseNumber(r.AirPollutionLevel),
      coverage:parseNumber(r.DataCoverage??r.Timecoverage??r.DataCapture),
      verification:String(r.Verification||''),
      accepted:String(r.AcceptedforProducts??''),
      area:String(r.AirQualityStationArea||''),
      stationType:String(r.AirQualityStationType||''),
      kind:'station',
      provider:'EEA'
    })).sort((a,b)=>{
      const countryCmp=a.country.localeCompare(b.country);
      return countryCmp||a.name.localeCompare(b.name,'it')
    });

    const diagnostic={
      source:'EEA / Discodata diretto',
      table:'AirQualityDataFlows.latest.AirQualityStatistics',
      year,pollutant,
      component_code:POLLUTANTS[pollutant].eeaCode,
      aggregation:'P1Y annual mean',
      pages:paged.pages,
      truncated:paged.truncated,
      rowsReceived:raw.length,
      stationsInCachedRegion:allRows.length,
      countries:[...new Set(allRows.map(r=>r.country).filter(Boolean))].sort(),
      spatialGridDegrees:eeaSpatialGridStep(visibleBbox),
      edgeCache:'BYPASS',
      sample:raw[0]||null
    };

    const entry={
      allRows,
      diagnostic,
      cacheLabel:'network-direct'
    };

    state.eeaCache.set(regionKey,entry);
    while(state.eeaCache.size>60){
      const first=state.eeaCache.keys().next().value;
      state.eeaCache.delete(first)
    }

    return entry
  })();

  state.eeaValidatedInflight.set(regionKey,promise);

  try{
    const entry=await promise;
    return rowsForViewport(
      entry.allRows,
      entry.diagnostic,
      entry.cacheLabel||'network'
    )
  }finally{
    state.eeaValidatedInflight.delete(regionKey)
  }
}

function normalizeArpaKey(v){
  return normalizeText(v)
    .replaceAll('μ','µ')
    .replace(/pm\s*2\s*[,\.]\s*5/g,'pm2.5')
    .replace(/pm\s*10/g,'pm10')
    .replace(/no\s*2/g,'no2')
    .replace(/\s+/g,' ')
    .trim()
}
function arpaField(record,prefix,suffix){
  const p=normalizeArpaKey(prefix);
  const s=normalizeArpaKey(suffix);
  return Object.keys(record).find(k=>{
    const n=normalizeArpaKey(k);
    return n.includes(p)&&(n.endsWith(s)||n.includes(` ${s} `))
  })
}
const ARPA_POSITIONAL_GROUP={
  'PM10':0,
  'PM2.5':2,
  'NO2':3
};

function arpaGenericHeaderToken(v){
  const n=normalizeArpaKey(v);
  if(n==='min')return'MIN';
  if(n==='med')return'MED';
  if(n==='max')return'MAX';
  return null
}

function arpaPositionalMetric(record,headers,pollutant){
  const cells=record?.__cells;
  if(!Array.isArray(cells)||!Array.isArray(headers))return null;

  const minColumns=[];
  headers.forEach((header,index)=>{
    if(arpaGenericHeaderToken(header)==='MIN')minColumns.push(index)
  });

  if(minColumns.length<2)return null;

  const firstMetricColumn=minColumns[0];
  const distances=[];
  for(let i=1;i<minColumns.length;i++){
    const distance=minColumns[i]-minColumns[i-1];
    if(distance>0)distances.push(distance)
  }

  const frequency=new Map();
  distances.forEach(d=>frequency.set(d,(frequency.get(d)||0)+1));

  const groupWidth=[...frequency.entries()]
    .sort((a,b)=>b[1]-a[1]||a[0]-b[0])[0]?.[0];

  const groupIndex=ARPA_POSITIONAL_GROUP[pollutant];
  if(!Number.isInteger(groupWidth)||groupWidth<3||groupIndex===undefined)return null;

  const base=firstMetricColumn+(groupIndex*groupWidth);
  if(base+2>=cells.length)return null;

  const min=parseNumber(cells[base]);
  const med=parseNumber(cells[base+1]);
  const max=parseNumber(cells[base+2]);
  if(med===null)return null;

  return{
    min,med,max,
    groupIndex,
    groupWidth,
    columns:{MIN:base,MED:base+1,MAX:base+2},
    fields:{
      MIN:`colonna ${base+1} · MIN`,
      MED:`colonna ${base+2} · MED`,
      MAX:`colonna ${base+3} · MAX`
    }
  }
}

function arpaRecordIdentity(record){
  const entries=Object.entries(record||{});
  const istatEntry=entries.find(([k])=>normalizeArpaKey(k).includes('istat'));
  const raw=String(istatEntry?.[1]??'').replace(/\D/g,'');
  const code=raw.padStart(6,'0');

  const nameEntry=entries.find(([k])=>{
    const n=normalizeArpaKey(k);
    return n==='nome'||n.includes('comune')||n.includes('denominazione')
  });
  const name=String(nameEntry?.[1]??'').trim();
  return{code,name}
}

function isRomeRecord(record){
  const identity=arpaRecordIdentity(record);
  const name=normalizeText(identity.name);
  return identity.code==='058091'||name==='roma'||name==='roma capitale'
}

function populateArpaMunicipalities(records){
  const select=$('arpaCitySelect');
  if(!select)return;
  const municipalities=records
    .map(arpaRecordIdentity)
    .filter(item=>/^0(?:56|57|58|59|60)\d{3}$/.test(item.code)&&item.name)
    .filter((item,index,all)=>all.findIndex(other=>other.code===item.code)===index)
    .sort((a,b)=>a.name.localeCompare(b.name,'it'));
  if(!municipalities.length)return;
  const signature=municipalities.map(item=>item.code).join(',');
  if(select.dataset.optionSignature===signature)return;
  const old=select.value||'058091';
  select.replaceChildren(...municipalities.map(item=>{
    const option=document.createElement('option');
    option.value=item.code;
    option.textContent=item.name;
    return option
  }));
  select.value=municipalities.some(item=>item.code===old)?old:'058091';
  select.dataset.optionSignature=signature
}

async function fetchArpaBoundary(code,name){
  const normalized=String(code).padStart(6,'0');
  if(state.arpaBoundaryCache.has(normalized))return state.arpaBoundaryCache.get(normalized);
  const url=ARPA_BOUNDARY_URLS[normalized.slice(0,3)];
  if(!url)throw new Error(`Provincia ISTAT non riconosciuta per ${name}.`);

  try{
    const response=await fetch(url,{cache:'force-cache'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const collection=await response.json();
    const feature=(collection.features||[]).find(f=>{
      const p=f.properties||{};
      return String(p.com_istat_code||'').padStart(6,'0')===normalized
        || String(Number(p.com_istat_code_num)||'').padStart(6,'0')===normalized
        || normalizeText(p.name)===normalizeText(name)
    });

    if(!feature?.geometry)throw new Error(`confine del Comune di ${name} non trovato`);

    const boundary={
      type:'FeatureCollection',
      features:[{
        type:'Feature',
        properties:{
          ...(feature.properties||{}),
          scope:`Comune di ${name}`,
          source:'ISTAT / geojson-italy'
        },
        geometry:feature.geometry
      }]
    };

    state.arpaBoundaryCache.set(normalized,boundary);
    return boundary
  }catch(err){
    console.error(`Perimetro ${name} non disponibile`,err);
    throw new Error(`Perimetro ${name} non disponibile: ${err.message||err}`)
  }
}

function fetchRomeBoundary(){
  return fetchArpaBoundary('058091','Roma')
}


function fetchWithTimeout(url,options={},timeoutMs=16000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(url,{...options,signal:controller.signal})
    .finally(()=>clearTimeout(timer))
}

function csvDelimiter(text){
  const sample=text.split(/\r?\n/).slice(0,15).join('\n');
  const candidates=[',','','\t'];
  return candidates
    .map(d=>({d,count:sample.split(d).length-1}))
    .sort((a,b)=>b.count-a.count)[0]?.d||''
}

function parseDelimitedRows(text,delimiter){
  const rows=[];
  let row=[],field='',quoted=false;
  const pushField=()=>{row.push(field);field=''};
  const pushRow=()=>{if(row.some(v=>String(v).trim()!==''))rows.push(row);row=[]};

  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){
      if(quoted&&text[i+1]==='"'){field+='"';i++}
      else quoted=!quoted
    }else if(c===delimiter&&!quoted){
      pushField()
    }else if((c==='\n'||c==='\r')&&!quoted){
      if(c==='\r'&&text[i+1]==='\n')i++;
      pushField();pushRow()
    }else field+=c
  }
  if(field.length||row.length){pushField();pushRow()}
  return rows
}

function findArpaHeaderRow(matrix){
  const limit=Math.min(matrix.length,40);
  let best={index:-1,score:0};

  for(let i=0;i<limit;i++){
    const cells=(matrix[i]||[]).map(normalizeArpaKey);
    let score=0;

    if(cells.some(v=>v.includes('istat')))score+=5;
    if(cells.some(v=>v==='nome'||v.includes('comune')||v.includes('denominazione')))score+=3;
    if(cells.some(v=>v.includes('pm10')&&v.includes('media annua')))score+=3;
    if(cells.some(v=>v.includes('pm2.5')&&v.includes('media annua')))score+=3;
    if(cells.some(v=>v.includes('no2')&&v.includes('media annua')))score+=3;

    if(score>best.score)best={index:i,score}
  }

  return best.score>=8?best.index:-1
}

function copyMatrix(matrix){
  return (matrix||[]).map(row=>Array.isArray(row)?[...row]:[])
}

/*
 * In XLSX the pollutant title is often a merged cell spanning MIN/MED/MAX
 * and other subcolumns. SheetJS returns the value only in the top-left cell.
 * Expand the merge over the matrix before composing the final header.
 */
function expandSheetMerges(matrix,sheet){
  const out=copyMatrix(matrix);
  const merges=sheet?.['!merges']||[];

  for(const merge of merges){
    const source=out[merge.s.r]?.[merge.s.c];
    if(source===undefined||source===null||String(source).trim()==='')continue;

    for(let r=merge.s.r;r<=merge.e.r;r++){
      if(!out[r])out[r]=[];
      for(let c=merge.s.c;c<=merge.e.c;c++){
        if(out[r][c]===undefined||out[r][c]===null||String(out[r][c]).trim()===''){
          out[r][c]=source
        }
      }
    }
  }

  return out
}

function isArpaSubheaderRow(row){
  const cells=(row||[])
    .map(normalizeArpaKey)
    .filter(Boolean);

  if(!cells.length)return false;

  const tokens=[
    'min','med','max',
    'area superamento',
    'popolazione esposta',
    'popolazione estesa',
    'note'
  ];

  const tokenHits=cells.filter(v=>tokens.some(t=>v===t||v.includes(t))).length;
  const identityHits=cells.filter(v=>
    v.includes('istat')||v==='nome'||v.includes('comune')||v==='zona'
  ).length;

  // Municipality data rows must not be mistaken for a second header row.
  const numericish=cells.filter(v=>/^[-+]?[0-9]+(?:[.,][0-9]+)?$/.test(v)).length;

  return tokenHits>=2 && identityHits<=1 && numericish===0
}

function cleanHeaderPart(v){
  return String(v??'')
    .replace(/^\uFEFF/,'')
    .replace(/\s+/g,' ')
    .trim()
}

function isArpaDescriptor(v){
  const n=normalizeArpaKey(v);
  if(!n)return false;

  const hasPollutant=
    n.includes('pm2.5')||
    n.includes('pm10')||
    n.includes('no2')||
    n.includes('o3')||
    n.includes('so2')||
    n.includes('benzene')||
    /(^|\s)co(\s|$)/.test(n);

  const hasMetric=
    n.includes('media annua')||
    n.includes('media 8')||
    n.includes('massima media')||
    n.includes('superament')||
    n.includes('n° sup')||
    n.includes('n. sup')||
    n.includes('vl=')||
    n.includes('µg/m3')||
    n.includes('mg/m3');

  return hasPollutant&&hasMetric
}

function buildArpaHeaders(matrix,headerRow){
  const parentRows=[];

  // 2025 can place the pollutant/group descriptor several rows above
  // the MIN/MED/MAX row. Scan every physical row above the detected header.
  for(let r=0;r<headerRow;r++){
    if((matrix[r]||[]).some(isArpaDescriptor))parentRows.push(r)
  }

  const lowerRows=[headerRow];

  // Retain compatibility with layouts where MIN/MED/MAX are below
  // an identity/main header row.
  for(let r=headerRow+1;r<Math.min(matrix.length,headerRow+3);r++){
    if(isArpaSubheaderRow(matrix[r]))lowerRows.push(r);
    else break
  }

  const usedRows=[...new Set([...parentRows,...lowerRows])].sort((a,b)=>a-b);
  const maxCols=Math.max(...usedRows.map(r=>(matrix[r]||[]).length),0);
  const headers=[];

  for(let c=0;c<maxCols;c++){
    const childParts=lowerRows
      .map(r=>cleanHeaderPart(matrix[r]?.[c]))
      .filter(Boolean);

    const child=childParts.join(' ').trim();
    const childNorm=normalizeArpaKey(child);

    const isIdentity=
      childNorm.includes('istat')||
      childNorm==='nome'||
      childNorm.includes('comune')||
      childNorm.includes('denominazione')||
      childNorm==='zona'||
      childNorm.includes('note');

    if(isIdentity){
      headers[c]=child||`__col_${c}`;
      continue
    }

    const parentParts=[];
    for(const r of parentRows){
      const value=cleanHeaderPart(matrix[r]?.[c]);
      if(!isArpaDescriptor(value))continue;

      if(!parentParts.some(p=>normalizeArpaKey(p)===normalizeArpaKey(value))){
        parentParts.push(value)
      }
    }

    const allParts=[...parentParts,...childParts]
      .filter(Boolean)
      .filter((v,i,arr)=>
        arr.findIndex(x=>normalizeArpaKey(x)===normalizeArpaKey(v))===i
      );

    headers[c]=allParts.join(' ').trim()||`__col_${c}`
  }

  return{
    headers,
    headerRows:usedRows,
    parentRows,
    lowerRows,
    dataStartRow:Math.max(...lowerRows)+1
  }
}
function matrixToArpaRecords(matrix){
  const headerRow=findArpaHeaderRow(matrix);
  if(headerRow<0){
    return{
      records:[],
      headerRow:-1,
      headerRows:[],
      dataStartRow:-1,
      headers:[]
    }
  }

  const built=buildArpaHeaders(matrix,headerRow);
  const records=[];

  for(const values of matrix.slice(built.dataStartRow)){
    if(!values||!values.some(v=>String(v??'').trim()!==''))continue;

    const record={};
    built.headers.forEach((h,i)=>record[h]=values[i]??'');

    Object.defineProperty(record,'__cells',{
      value:[...values],
      enumerable:false,
      configurable:false,
      writable:false
    });

    records.push(record)
  }

  return{
    records,
    headerRow,
    headerRows:built.headerRows,
    parentRows:built.parentRows||[],
    lowerRows:built.lowerRows||[],
    dataStartRow:built.dataStartRow,
    headers:built.headers
  }
}

function parseCsvText(text){
  const clean=String(text??'').replace(/^\uFEFF/,'');
  const lead=clean.trimStart().slice(0,120).toLowerCase();
  if(lead.startsWith('<?xml')||lead.startsWith('<html')||lead.startsWith('<!doctype')){
    throw new Error('il server ha restituito XML/HTML invece del CSV')
  }
  const matrix=parseDelimitedRows(clean,csvDelimiter(clean));
  return matrixToArpaRecords(matrix)
}

function xlsxSignature(buffer){
  const b=new Uint8Array(buffer.slice(0,4));
  return b.length>=2&&b[0]===0x50&&b[1]===0x4b
}

function responsePreview(buffer){
  try{return new TextDecoder('utf-8').decode(buffer.slice(0,240)).replace(/\s+/g,' ').trim()}
  catch{return''}
}

function parseArpaWorkbook(buffer){
  if(!window.XLSX)throw new Error('parser XLSX non disponibile');
  if(!xlsxSignature(buffer)){
    const preview=responsePreview(buffer);
    const kind=preview.startsWith('<?xml')||preview.startsWith('<')?'XML/HTML':'contenuto non XLSX';
    throw new Error(`il server ha restituito ${kind} invece di un file XLSX valido`)
  }

  const workbook=XLSX.read(buffer,{type:'array'});
  const inspected=[];
  for(const sheetName of workbook.SheetNames){
    const sheet=workbook.Sheets[sheetName];
    const rawMatrix=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:false,blankrows:true});
    const matrix=expandSheetMerges(rawMatrix,sheet);
    const parsed=matrixToArpaRecords(matrix);

    inspected.push({
      sheet:sheetName,
      rows:parsed.records.length,
      headerRow:parsed.headerRow>=0?parsed.headerRow+1:null,
      headerRows:parsed.headerRows.map(r=>r+1),
      parentRows:(parsed.parentRows||[]).map(r=>r+1),
      lowerRows:(parsed.lowerRows||[]).map(r=>r+1),
      dataStartRow:parsed.dataStartRow>=0?parsed.dataStartRow+1:null,
      sampleHeaders:parsed.headers.filter(h=>!h.startsWith('__col_')).slice(0,30),
      headerMatrix:parsed.headerRows.map(r=>({
        row:r+1,
        cells:(matrix[r]||[]).slice(0,30).map(v=>String(v??'').trim())
      }))
    });

    if(parsed.records.length&&parsed.records.some(isRomeRecord)){
      return{
        records:parsed.records,
        sheetName,
        headerRow:parsed.headerRow+1,
        headerRows:parsed.headerRows.map(r=>r+1),
        parentRows:(parsed.parentRows||[]).map(r=>r+1),
        lowerRows:(parsed.lowerRows||[]).map(r=>r+1),
        dataStartRow:parsed.dataStartRow+1,
        headers:parsed.headers,
        inspected
      }
    }
  }
  const detail=inspected.map(x=>`${x.sheet}: header ${x.headerRow??'non trovato'}, ${x.rows} righe`).join('; ');
  throw new Error(`XLSX letto, ma nessun foglio contiene una tabella comunale riconoscibile (${detail})`)
}

async function loadArpaStaticRecords(year){
  const cfg=ARPA_STATIC_FILES[year];
  if(!cfg)throw new Error(`ARPA Lazio: file ufficiale ${year} non configurato.`);

  // If a machine-readable CSV fallback exists, prefer it. XLSX remains the
  // official fallback and is parsed by scanning every worksheet/header row.
  const candidates=cfg.fallback
    ?[{url:cfg.fallback,type:'csv'},{url:cfg.url,type:cfg.type}]
    :[{url:cfg.url,type:cfg.type}];
  const attempts=[];

  for(const candidate of candidates){
    const {url,type}=candidate;
    try{
      const response=await fetchWithTimeout(url,{cache:'no-store',mode:'cors'});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const contentType=(response.headers.get('content-type')||'').toLowerCase();

      if(type==='xlsx'){
        const buffer=await response.arrayBuffer();
        const parsed=parseArpaWorkbook(buffer);
        return{
          records:parsed.records,url,format:'XLSX',contentType,
          sheetName:parsed.sheetName,
          headerRow:parsed.headerRow,
          headerRows:parsed.headerRows,
          parentRows:parsed.parentRows,
          lowerRows:parsed.lowerRows,
          dataStartRow:parsed.dataStartRow,
          parsedHeaders:parsed.headers,
          workbookInspection:parsed.inspected
        }
      }

      const text=await response.text();
      const parsed=parseCsvText(text);
      if(!parsed.records.length)throw new Error('CSV letto ma tabella ARPA non riconosciuta');
      return{records:parsed.records,url,format:'CSV',contentType,headerRow:parsed.headerRow+1}
    }catch(err){
      attempts.push({url,type,error:String(err.message||err)})
    }
  }

  const detail=attempts.map(a=>`${a.type.toUpperCase()}: ${a.error}`).join(' · ');
  const error=new Error(`ARPA Lazio: impossibile leggere i dati ${year}. ${detail}`);
  error.attempts=attempts;
  throw error
}

function coordinatesFromGeometry(geometry,acc=[]){
  if(!geometry)return acc;
  const walk=node=>{
    if(!Array.isArray(node))return;
    if(node.length>=2&&typeof node[0]==='number'&&typeof node[1]==='number'){
      acc.push([node[0],node[1]]);
      return
    }
    node.forEach(walk)
  };
  walk(geometry.coordinates);
  return acc
}

function boundsFromGeoJSON(geo){
  const coords=[];
  (geo?.features||[]).forEach(f=>coordinatesFromGeometry(f.geometry,coords));
  if(!coords.length)return null;
  let minLon=Infinity,minLat=Infinity,maxLon=-Infinity,maxLat=-Infinity;
  coords.forEach(([lon,lat])=>{
    minLon=Math.min(minLon,lon);maxLon=Math.max(maxLon,lon);
    minLat=Math.min(minLat,lat);maxLat=Math.max(maxLat,lat)
  });
  return[[minLon,minLat],[maxLon,maxLat]]
}

function fitArpaScope(map,rows){
  const municipal=rows.find(r=>r.kind==='municipal'&&r.boundary);
  const bounds=boundsFromGeoJSON(municipal?.boundary);
  if(bounds&&map){
    map.fitBounds(bounds,{padding:34,duration:0,maxZoom:10.4})
  }
}

async function fetchArpaRows(year,pollutant,silent=false){
  const report=silent?()=>{}:diagnostics;
  const cacheKey=`${arpaMunicipality()}:${year}:${pollutant}`;
  if(state.arpaCache.has(cacheKey)){
    const cached=state.arpaCache.get(cacheKey);
    report({...cached.diagnostic,cache:'memory'});
    return cached.rows
  }

  let loaded;
  try{
    loaded=await loadArpaStaticRecords(year)
  }catch(err){
    report({
      source:'ARPA Lazio · file statico ufficiale',
      year,pollutant,
      data:'FAILED',
      error:String(err.message||err),
      attempts:err.attempts||null
    });
    throw err
  }

  const records=loaded.records||[];
  const selectedCode=arpaMunicipality();
  if(!silent)populateArpaMunicipalities(records);
  const record=records.find(item=>arpaRecordIdentity(item).code===selectedCode);
  const identity=arpaRecordIdentity(record);
  const municipalityName=identity.name||$('arpaCitySelect')?.selectedOptions?.[0]?.textContent||selectedCode;

  if(!record){
    report({
      source:'ARPA Lazio · file statico ufficiale',
      year,pollutant,
      data:'OK',
      file:loaded.url,
      format:loaded.format,
      rowsReceived:records.length,
      municipalityCode:selectedCode,
      municipalityRecordFound:false,
      firstColumns:Object.keys(records[0]||{}).slice(0,12)
    });
    throw new Error(`ARPA Lazio: record del Comune selezionato non trovato nel file ${year}.`)
  }

  let boundary=null;
  try{
    boundary=await fetchArpaBoundary(selectedCode,municipalityName)
  }catch(err){
    report({source:'ARPA Lazio',year,pollutant,municipalityCode:selectedCode,municipalityName,geometry:'FAILED',geometryError:String(err.message||err)});
    throw err
  }

  const prefix=POLLUTANTS[pollutant].arpaPrefix;
  let fieldMed=arpaField(record,prefix,'MED');
  let fieldMin=arpaField(record,prefix,'MIN');
  let fieldMax=arpaField(record,prefix,'MAX');

  let med=parseNumber(fieldMed?record[fieldMed]:null);
  let min=parseNumber(fieldMin?record[fieldMin]:null);
  let max=parseNumber(fieldMax?record[fieldMax]:null);
  let metricResolution='header';
  let positional=null;

  if((!fieldMed||!fieldMin||!fieldMax||med===null)&&loaded.format==='XLSX'){
    positional=arpaPositionalMetric(
      record,
      loaded.parsedHeaders||[],
      pollutant
    );

    if(positional){
      min=positional.min;
      med=positional.med;
      max=positional.max;
      fieldMin=positional.fields.MIN;
      fieldMed=positional.fields.MED;
      fieldMax=positional.fields.MAX;
      metricResolution='positional-schema'
    }
  }

  if(med===null){
    report({
      source:'ARPA Lazio · file statico ufficiale',
      year,pollutant,
      geometry:'OK',
      data:'OK',
      file:loaded.url,
      format:loaded.format,
      rowsReceived:records.length,
      municipalityCode:selectedCode,
      municipalityName,
      municipalityRecordFound:true,
      metricResolution,
      positional,
      fields:{
        MIN:fieldMin||null,
        MED:fieldMed||null,
        MAX:fieldMax||null
      },
      parsedHeaderRows:loaded.headerRows||null,
      parentRows:loaded.parentRows||null,
      lowerRows:loaded.lowerRows||null,
      dataStartRow:loaded.dataStartRow||null,
      availableColumns:Object.keys(record),
      parsedHeaders:loaded.parsedHeaders||Object.keys(record),
      workbookInspection:loaded.workbookInspection||null
    });
    throw new Error(`ARPA Lazio: valore MED ${pollutant} non disponibile per ${municipalityName} nel ${year}.`)
  }

  const boundaryBounds=boundsFromGeoJSON(boundary);
  const center=boundaryBounds
    ?[(boundaryBounds[0][0]+boundaryBounds[1][0])/2,(boundaryBounds[0][1]+boundaryBounds[1][1])/2]
    :ROME.center;

  const rows=[{
    id:`ARPA-${selectedCode}`,
    name:`${municipalityName} · valutazione comunale`,
    municipalityName,
    lat:center[1],
    lon:center[0],
    value:med,min,max,
    zone:String(record.zona||record.Zona||''),
    kind:'municipal',
    provider:'ARPA Lazio',
    boundary
  }];

  const diagnostic={
    source:'ARPA Lazio · file statico ufficiale',
    runtimeApi:false,
    year,pollutant,
    municipalityCode:selectedCode,
    municipalityName,
    file:loaded.url,
    format:loaded.format,
    contentType:loaded.contentType||null,
    sheetName:loaded.sheetName||null,
    headerRow:loaded.headerRow||null,
    headerRows:loaded.headerRows||null,
    parentRows:loaded.parentRows||null,
    lowerRows:loaded.lowerRows||null,
    dataStartRow:loaded.dataStartRow||null,
    workbookInspection:loaded.workbookInspection||null,
    parsedHeaders:(loaded.parsedHeaders||Object.keys(record)).slice(0,30),
    rowsReceived:records.length,
    municipalityRecordFound:true,
    metric:'MED',
    metricResolution,
    positional:positional?{
      groupIndex:positional.groupIndex,
      groupWidth:positional.groupWidth,
      columns:positional.columns
    }:null,
    min,med,max,
    fields:{
      MIN:fieldMin||null,
      MED:fieldMed||null,
      MAX:fieldMax||null
    },
    geometry:'OK',
    boundaryFeatures:boundary?.features?.length||0,
    boundarySource:`ISTAT municipality limits · geojson-italy · ISTAT ${selectedCode}`,
    note:'Nessuna chiamata CKAN DataStore viene eseguita a runtime.'
  };

  report(diagnostic);
  state.arpaCache.set(cacheKey,{rows,diagnostic});
  return rows
}

function temperatureMetric(){
  return $('temperatureMetricSelect')?.value||'mean'
}

function temperatureVisibleBbox(map=state.map){
  const bbox=visibleMapBbox(map);
  if(!bbox)return[12.15,41.65,12.85,42.15];

  // Aggancia a decimi di grado: piccoli movimenti riusano la stessa richiesta.
  const[minLon,minLat,maxLon,maxLat]=bbox;
  return[
    Math.floor(minLon*10)/10,
    Math.floor(minLat*10)/10,
    Math.ceil(maxLon*10)/10,
    Math.ceil(maxLat*10)/10
  ].map(value=>Number(value.toFixed(1)))
}

function temperatureCacheKey(year,bbox){
  return`${year}:${bbox.join(',')}`
}

function temperatureViewportKey(map=state.map){
  if(!map)return'';
  const bbox=temperatureVisibleBbox(map);
  const year=$('yearSelect')?.value||'';
  return`temperature:${year}:${bbox.join(',')}`
}

async function fetchTemperatureRows(year){
  const bbox=temperatureVisibleBbox();
  const key=temperatureCacheKey(year,bbox);
  const started=performance.now();

  function reportEntry(entry,cache){
    diagnostics({
      ...entry.diagnostic,
      cache,
      durationMs:Math.round(performance.now()-started)
    });
    return entry.rows
  }

  if(state.temperatureCache.has(key)){
    return reportEntry(state.temperatureCache.get(key),'memory')
  }

  if(state.temperatureInflight.has(key)){
    const entry=await state.temperatureInflight.get(key);
    return reportEntry(entry,'inflight-shared')
  }

  diagnostics({
    source:'Temperatura · ERA5-Land / Open-Meteo',
    phase:'requesting',
    year:Number(year),
    metric:temperatureMetric(),
    boundingBox:bbox
  });

  if(!globalThis.QualitaAriaTemperatureProxy?.viewport){
    throw new Error('Client temperatura non disponibile.')
  }

  const promise=(async()=>{
    const proxied=await QualitaAriaTemperatureProxy.viewport({
      bbox,
      year
    });

    const rows=(Array.isArray(proxied.data?.results)
      ?proxied.data.results
      :[]
    ).map(cell=>({
      id:String(cell.id),
      name:String(cell.name||'Cella ERA5-Land'),
      lat:Number(cell.latitude),
      lon:Number(cell.longitude),
      mean:Number(cell.mean),
      min:Number(cell.min),
      max:Number(cell.max),
      observations:Number(cell.observations||0),
      elevation:cell.elevation===null?null:Number(cell.elevation),
      kind:'temperature-cell',
      provider:'Copernicus ERA5-Land · Open-Meteo'
    })).filter(row=>
      Number.isFinite(row.lat)&&
      Number.isFinite(row.lon)&&
      Number.isFinite(row.mean)&&
      Number.isFinite(row.min)&&
      Number.isFinite(row.max)
    );

    const meta=proxied.data?.meta||{};
    const diagnostic={
      source:'Copernicus ERA5-Land via Open-Meteo',
      variable:'temperature_2m',
      unit:'°C',
      year:Number(year),
      boundingBox:bbox,
      viewportKey:temperatureViewportKey(state.map),
      nativeResolutionDegrees:meta.nativeResolutionDegrees??0.1,
      nativeResolutionApproxKm:meta.nativeResolutionApproxKm||'9–11',
      sampleStepDegrees:meta.sampleStepDegrees??null,
      requestedPoints:meta.requestedPoints??rows.length,
      returnedCells:rows.length,
      upstreamMs:meta.upstreamMs??0,
      edgeCache:proxied.cache,
      transport:proxied.transport||'cloudflare-proxy',
      proxyDurationMs:proxied.durationMs,
      generatedAt:meta.generatedAt||null,
      note:'Temperatura dell’aria a 2 metri. Le celle rappresentano la griglia del modello, non misure di una singola strada o edificio.'
    };

    const entry={rows,diagnostic};
    state.temperatureCache.set(key,entry);

    while(state.temperatureCache.size>36){
      const first=state.temperatureCache.keys().next().value;
      state.temperatureCache.delete(first)
    }

    return entry
  })();

  state.temperatureInflight.set(key,promise);
  try{
    const entry=await promise;
    return reportEntry(entry,`edge-${String(entry.diagnostic.edgeCache||'unknown').toLowerCase()}`)
  }finally{
    state.temperatureInflight.delete(key)
  }
}

async function rowsFor(year){
  if(isTemperature())return fetchTemperatureRows(year);

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
        coverage:r.coverage??'',country:r.country??'',kind:r.kind||'station',
        min:r.min??'',max:r.max??'',provider:r.provider||'',
        dataStatus:r.dataStatus||'',verification:r.verification||'',aggregation:r.aggregation||''
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
      'fill-opacity':.44
    }
  });
  map.addLayer({
    id:`${prefix}-boundary-line`,
    type:'line',
    source:`${prefix}-boundary`,
    paint:{
      'line-color':'rgba(20,28,36,.78)',
      'line-width':['interpolate',['linear'],['zoom'],8,.7,12,1.3,15,2]
    }
  });

  map.addLayer({
    id:`${prefix}-heat`,type:'heatmap',source:`${prefix}-source`,
    filter:['==',['get','kind'],'station'],
    maxzoom:15,
    paint:{
      'heatmap-weight':['interpolate',['linear'],['get','value'],0,0,40,1],
      'heatmap-intensity':['interpolate',['linear'],['zoom'],3,.55,5,.7,7,.95,10,1.55,13,1.85],
      'heatmap-radius':['interpolate',['linear'],['zoom'],3,8,5,18,7,40,9,86,10.5,128,13,178],
      'heatmap-opacity':['interpolate',['linear'],['zoom'],3,.48,5,.58,7,.68,10,.78,13,.62,15,.34],
      'heatmap-color':['interpolate',['linear'],['heatmap-density'],
        0,'rgba(53,208,127,0)',.035,'rgba(53,208,127,.42)',
        .18,'rgba(53,208,127,.72)',.38,'rgba(230,207,67,.82)',
        .62,'rgba(255,145,77,.86)',.84,'rgba(255,88,100,.92)',
        1,'rgba(174,22,31,.96)']
    }
  });

  map.addLayer({
    id:`${prefix}-points`,type:'circle',source:`${prefix}-source`,
    paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],
        3,['case',['==',['get','kind'],'municipal'],13,2.5],
        5,['case',['==',['get','kind'],'municipal'],13,4],
        8,['case',['==',['get','kind'],'municipal'],13,8],
        10,['case',['==',['get','kind'],'municipal'],13,11],
        13,['case',['==',['get','kind'],'municipal'],13,14]
      ],
      'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'circle-stroke-width':2,
      'circle-stroke-color':'#fff',
      'circle-opacity':.98
    }
  });

  map.addLayer({
    id:`${prefix}-labels`,type:'symbol',source:`${prefix}-source`,
    minzoom:6,
    layout:{
      'text-field':['get','label'],
      'text-font':['Noto Sans Regular'],
      'text-size':['interpolate',['linear'],['zoom'],
        8,['case',['==',['get','kind'],'municipal'],11,8],
        10,['case',['==',['get','kind'],'municipal'],11,9],
        13,['case',['==',['get','kind'],'municipal'],11,11]
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
      if(p.dataStatus==='preliminary')extra+=`<br>◐ Preliminare · EEA UTD/E2a`;
      if(p.dataStatus==='validated')extra+=`<br>✓ Validato · EEA E1a`;
    }
    new maplibregl.Popup({offset:18})
      .setLngLat(f.geometry.coordinates)
      .setHTML(`<strong>${p.name}</strong>${p.country?` · ${p.country}`:''}<br>${fmt(p.value)} µg/m³${extra}`)
      .addTo(map)
  });
}

function temperatureValue(row){
  return Number(row?.[temperatureMetric()])
}

function temperatureColor(value){
  const n=Number(value);
  if(!Number.isFinite(n))return'#64748b';
  if(n<0)return'#3455d1';
  if(n<10)return'#42b5db';
  if(n<20)return'#5fd19b';
  if(n<30)return'#f0c94c';
  if(n<40)return'#f08b45';
  return'#df4a49'
}

function temperatureGeoJSON(rows){
  return{
    type:'FeatureCollection',
    features:rows.map(row=>({
      type:'Feature',
      properties:{
        id:row.id,
        name:row.name,
        value:temperatureValue(row),
        mean:row.mean,
        min:row.min,
        max:row.max,
        observations:row.observations,
        elevation:row.elevation??'',
        label:`${fmt(temperatureValue(row))}°`
      },
      geometry:{
        type:'Point',
        coordinates:[Number(row.lon),Number(row.lat)]
      }
    }))
  }
}

function addTemperatureLayers(map){
  if(!map||map.getSource('temperature-source'))return;

  map.addSource('temperature-source',{
    type:'geojson',
    data:{type:'FeatureCollection',features:[]}
  });

  /*
   * Superficie termica: stessa logica visuale delle mappe inquinanti
   * (campo sfumato + punti numerici), ma il colore deriva dalla MED annua.
   */
  map.addLayer({
    id:'temperature-surface',
    type:'circle',
    source:'temperature-source',
    layout:{visibility:'none'},
    paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],
        8,30,9,46,10,72,11,116,12,190,13,320
      ],
      'circle-color':[
        'interpolate',['linear'],['get','value'],
        -5,'#3455d1',
        5,'#42b5db',
        15,'#5fd19b',
        25,'#f0c94c',
        35,'#f08b45',
        45,'#df4a49'
      ],
      'circle-opacity':.62,
      'circle-blur':.66,
      'circle-pitch-alignment':'map'
    }
  });

  map.addLayer({
    id:'temperature-points',
    type:'circle',
    source:'temperature-source',
    minzoom:7.5,
    layout:{visibility:'none'},
    paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],7.5,9,10,11,13,13],
      'circle-color':[
        'interpolate',['linear'],['get','value'],
        -5,'#3455d1',
        5,'#42b5db',
        15,'#5fd19b',
        25,'#f0c94c',
        35,'#f08b45',
        45,'#df4a49'
      ],
      'circle-stroke-color':'#fff',
      'circle-stroke-width':2,
      'circle-opacity':.96
    }
  });

  map.addLayer({
    id:'temperature-label',
    type:'symbol',
    source:'temperature-source',
    minzoom:7.5,
    layout:{
      visibility:'none',
      'text-field':['get','label'],
      'text-font':['Noto Sans Regular'],
      'text-size':['interpolate',['linear'],['zoom'],7.5,8,10,9,13,11],
      'text-allow-overlap':true,
      'text-ignore-placement':true
    },
    paint:{
      'text-color':'#07111d',
      'text-halo-color':'rgba(255,255,255,.92)',
      'text-halo-width':1
    }
  });

  const popup=event=>{
    const feature=event.features?.[0];
    if(!feature)return;
    const p=feature.properties||{};

    new maplibregl.Popup({offset:14})
      .setLngLat(feature.geometry.coordinates)
      .setHTML(
        `<strong>Temperatura ${$('yearSelect')?.value||''}</strong>`+
        `<br>Minima media annuale: ${fmt(p.min)} °C`+
        `<br>Temperatura media annuale: ${fmt(p.mean)} °C`+
        `<br>Massima media annuale: ${fmt(p.max)} °C`+
        `<br><small>Cella ERA5-Land · Rielaborazione climatica · circa 9 km</small>`
      )
      .addTo(map)
  };

  map.on('click','temperature-points',popup);
  map.on('click','temperature-surface',popup);

  for(const id of ['temperature-points','temperature-surface']){
    map.on('mouseenter',id,()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave',id,()=>map.getCanvas().style.cursor='')
  }
}

function setTemperatureVisibility(visible){
  ['temperature-surface','temperature-points','temperature-label'].forEach(id=>{
    if(state.map?.getLayer(id)){
      state.map.setLayoutProperty(id,'visibility',visible?'visible':'none')
    }
  })
}

function showTemperatureOnSingle(rows){
  clearTemperatureOverlays();
  state.map?.getSource('temperature-source')?.setData(temperatureGeoJSON(rows));
  setTemperatureVisibility(true);

  setLayerVisibility(state.map,[
    'air-boundary-fill','air-boundary-line',
    'air-heat','air-points','air-labels',
    'diff-boundary-fill','diff-boundary-line',
    'diff-good','diff-bad','diff-points','diff-labels'
  ],false)
}

function renderTemperatureList(rows){
  $('stationListTools')?.classList.add('hidden');
  $('stationPagination')?.classList.add('hidden');

  if(!rows.length){
    $('stations').innerHTML='<div class="empty-state">Nessun dato ERA5-Land disponibile per questa zona.</div>';
    return
  }

  $('stations').innerHTML=rows.map(row=>{
    return`<div class="temperature-cell-row">
      <i style="background:${temperatureColor(row.mean)}"></i>
      <div>
        <strong>${row.name}</strong>
        <small>MIN ${fmt(row.min)} °C · MEDIA ${fmt(row.mean)} °C · MAX ${fmt(row.max)} °C<br>Cella ERA5-Land · circa 9 km</small>
      </div>
      <b>${fmt(temperatureValue(row))}°</b>
    </div>`
  }).join('')
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
      'fill-opacity':.44
    }
  });
  map.addLayer({
    id:'diff-boundary-line',
    type:'line',
    source:'diff-boundary',
    paint:{
      'line-color':'rgba(20,28,36,.78)',
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
      'circle-radius':['interpolate',['linear'],['zoom'],
        8,['case',['==',['get','kind'],'municipal'],13,8],
        10,['case',['==',['get','kind'],'municipal'],13,11],
        13,['case',['==',['get','kind'],'municipal'],13,14]],
      'circle-color':['case',['<=',['get','delta'],0],'#21b866','#ef4f4f'],
      'circle-stroke-width':2,'circle-stroke-color':'#fff'
    }
  });

  map.addLayer({
    id:'diff-labels',type:'symbol',source:'diff-source',
    layout:{
      'text-field':['get','label'],
      'text-font':['Noto Sans Regular'],
      'text-size':['interpolate',['linear'],['zoom'],
        8,['case',['==',['get','kind'],'municipal'],10,7],
        10,['case',['==',['get','kind'],'municipal'],10,9],
        13,['case',['==',['get','kind'],'municipal'],10,10]],
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
  setTemperatureVisibility(false);
  setAirData(state.map,rows);

  // Mobile: niente cerchi/etichette numeriche dell'inquinante.
  setLayerVisibility(state.map,[
    'air-boundary-fill','air-boundary-line','air-heat'
  ],true);
  setLayerVisibility(state.map,[
    'air-points','air-labels',
    'diff-boundary-fill','diff-boundary-line',
    'diff-good','diff-bad','diff-points','diff-labels'
  ],false)
}

function showDifferenceOnSingle(rows){
  setTemperatureVisibility(false);
  setDifferenceData(state.map,rows);

  setLayerVisibility(state.map,[
    'air-boundary-fill','air-boundary-line',
    'air-heat','air-points','air-labels'
  ],false);

  setLayerVisibility(state.map,[
    'diff-boundary-fill','diff-boundary-line',
    'diff-good','diff-bad'
  ],true);
  setLayerVisibility(state.map,[
    'diff-points','diff-labels'
  ],false)
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
      ?`${r.country?`${r.country} · `:''}${r.id}${r.coverage!==null&&r.coverage!==undefined?` · copertura ${fmt(r.coverage)}%`:''}`
      :`Comune di ${r.municipalityName||r.name?.split(' · ')[0]||'Roma'}${r.zone?` · zona ${r.zone}`:''}`;

    return `<div class="station-row">
      <i style="background:${isDiff?(r.value<=0?'#35d07f':'#ff5864'):colorFor(r.value)}"></i>
      <div><strong>${r.name}</strong><small>${detail}</small>${range}</div>
      <b>${isDiff&&r.value>0?'+':''}${fmt(r.value)}</b>
    </div>`
  }).join('')
}

function mergeComparisonRows(rowsA,rowsB){
  const merged=new Map();

  for(const row of rowsA){
    const key=String(row.id||row.name);
    merged.set(key,{
      id:row.id,
      name:row.name,
      kind:row.kind,
      provider:row.provider,
      country:row.country||'',
      verification:row.verification,
      dataStatusA:row.dataStatus||'',
      dataStatusB:'',
      valueA:row.value,
      valueB:null,
      coverageA:row.coverage,
      coverageB:null
    })
  }

  for(const row of rowsB){
    const key=String(row.id||row.name);
    const current=merged.get(key);

    if(current){
      current.name=row.name||current.name;
      current.provider=row.provider||current.provider;
      current.country=row.country||current.country;
      current.verification=row.verification||current.verification;
      current.dataStatusB=row.dataStatus||'';
      current.valueB=row.value;
      current.coverageB=row.coverage
    }else{
      merged.set(key,{
        id:row.id,
        name:row.name,
        kind:row.kind,
        provider:row.provider,
        country:row.country||'',
        verification:row.verification,
        dataStatusA:'',
        dataStatusB:row.dataStatus||'',
        valueA:null,
        valueB:row.value,
        coverageA:null,
        coverageB:row.coverage
      })
    }
  }

  return[...merged.values()]
    .sort((a,b)=>a.name.localeCompare(b.name,'it'))
}

function comparisonTrend(valueA,valueB){
  if(valueA===null||valueA===undefined||valueB===null||valueB===undefined){
    return null
  }

  // Compare the same one-decimal values shown to the user, avoiding
  // meaningless floating-point differences hidden by the UI formatting.
  const a=Math.round(Number(valueA)*10)/10;
  const b=Math.round(Number(valueB)*10)/10;

  if(b>a)return{kind:'up',symbol:'▲',label:'Aumentato'};
  if(b<a)return{kind:'down',symbol:'▼',label:'Diminuito'};
  return{kind:'stable',symbol:'●',label:'Stabile'}
}

function renderComparisonList(rows){
  if(!rows.length){
    $('stations').innerHTML='<div class="empty-state">Nessun dato reale disponibile per questo confronto.</div>';
    return
  }

  $('stations').innerHTML=rows.map(r=>{
    const left=r.valueA===null||r.valueA===undefined?'—':fmt(r.valueA);
    const right=r.valueB===null||r.valueB===undefined?'—':fmt(r.valueB);

    const leftColor=r.valueA===null||r.valueA===undefined?'#64748b':colorFor(r.valueA);
    const rightColor=r.valueB===null||r.valueB===undefined?'#64748b':colorFor(r.valueB);
    const trend=comparisonTrend(r.valueA,r.valueB);

    const trendHtml=trend
      ?` <span class="trend-indicator trend-${trend.kind}" title="${trend.label}" aria-label="${trend.label}">${trend.symbol}</span>`
      :'';

    return `<div class="station-row">
      <i style="background:linear-gradient(90deg,${leftColor} 0 50%,${rightColor} 50% 100%)"></i>
      <div><strong>${r.name}</strong><small>${r.country?`${r.country} · `:'' }${r.id||''}</small></div>
      <b class="comparison-values" aria-label="Valori a confronto: ${left} e ${right}${trend?`. ${trend.label}`:''}">${left}&nbsp;↔&nbsp;${right}${trendHtml}</b>
    </div>`
  }).join('')
}

function arpaHistoryTickMax(series){
  const maxima=series
    .filter(item=>item&&item.max!==null&&item.max!==undefined)
    .map(item=>Number(item.max))
    .filter(Number.isFinite);

  const rawMax=maxima.length?Math.max(...maxima):10;
  const step=rawMax<=20?5:rawMax<=50?10:20;
  return Math.max(step,Math.ceil(rawMax/step)*step)
}

function arpaHistoryPercent(value,axisMax){
  const n=Number(value);
  if(!Number.isFinite(n)||!axisMax)return 0;
  return Math.max(0,Math.min(100,(n/axisMax)*100))
}

function arpaHistoryDetailHtml(item){
  if(!item||item.missing){
    return item
      ?`<strong>${item.year}</strong>&nbsp;· dati non disponibili`
      :'Seleziona una barra per vedere i valori.'
  }

  const selectedA=String(item.year)===$('compareYearA').value;
  const selectedB=String(item.year)===$('compareYearB').value;

  const selectedClass=selectedA&&selectedB
    ?'history-detail-a'
    :selectedA
      ?'history-detail-a'
      :selectedB
        ?'history-detail-b'
        :'';

  return `<strong class="${selectedClass}">${item.year}</strong>&nbsp;·&nbsp;`
    +`MIN <strong>${fmt(item.min)}</strong>&nbsp;&nbsp;`
    +`MED <strong>${fmt(item.med)}</strong>&nbsp;&nbsp;`
    +`MAX <strong>${fmt(item.max)}</strong> µg/m³`
}

function renderArpaHistoryBars(series){
  const chart=$('arpaHistoryChart');
  if(!chart)return;

  const valid=series.filter(item=>item&&!item.missing);
  if(!valid.length){
    chart.innerHTML='<div class="arpa-history-error">Nessun dato storico ARPA disponibile.</div>';
    chart.setAttribute('aria-busy','false');
    return
  }

  const axisMax=arpaHistoryTickMax(valid);
  const ticks=[axisMax,axisMax*.75,axisMax*.5,axisMax*.25,0];

  const axis=`<div class="arpa-history-axis" aria-hidden="true">${
    ticks.map(value=>{
      const bottom=(value/axisMax)*100;
      return `<span style="bottom:${bottom}%">${fmt(value)}</span>`
    }).join('')
  }</div>`;

  const grid=`<div class="arpa-history-grid" aria-hidden="true">${
    ticks.map(value=>{
      const bottom=(value/axisMax)*100;
      return `<i style="bottom:${bottom}%"></i>`
    }).join('')
  }</div>`;

  const yearA=$('compareYearA').value;
  const yearB=$('compareYearB').value;

  const items=series.map(item=>{
    const selectedA=String(item.year)===yearA;
    const selectedB=String(item.year)===yearB;
    const selectedClass=`${selectedA?' selected-a':''}${selectedB?' selected-b':''}`;

    if(item.missing){
      return `<button type="button" class="arpa-year${selectedClass}" data-history-year="${item.year}"
        aria-label="${item.year}: dati non disponibili">
        <span class="arpa-year-missing">n/d</span>
        <span class="arpa-year-label">${item.year}</span>
      </button>`
    }

    const minP=arpaHistoryPercent(item.min,axisMax);
    const medP=arpaHistoryPercent(item.med,axisMax);
    const maxP=arpaHistoryPercent(item.max,axisMax);
    const barBottom=minP;
    const barHeight=Math.max(1,maxP-minP);

    const aria=`${item.year}: minimo ${fmt(item.min)}, medio ${fmt(item.med)}, massimo ${fmt(item.max)} microgrammi per metro cubo`;

    return `<button type="button" class="arpa-year${selectedClass}" data-history-year="${item.year}"
      aria-label="${aria}">
      <span class="arpa-year-plot">
        <span class="arpa-range-bar" style="bottom:${barBottom}%;height:${barHeight}%"></span>
        <span class="arpa-med-line" style="bottom:${medP}%"></span>
        <span class="arpa-value-label arpa-value-max" style="bottom:${maxP}%">${fmt(item.max)}</span>
        <span class="arpa-value-label arpa-value-med" style="bottom:${medP}%">${fmt(item.med)}</span>
        <span class="arpa-value-label arpa-value-min" style="bottom:${minP}%">${fmt(item.min)}</span>
      </span>
      <span class="arpa-year-label">${item.year}</span>
    </button>`
  }).join('');

  chart.innerHTML=`${axis}<div class="arpa-history-scroll"><div class="arpa-history-inner">${grid}${items}</div></div>`;
  chart.setAttribute('aria-busy','false');

  const byYear=new Map(series.map(item=>[String(item.year),item]));
  chart.querySelectorAll('[data-history-year]').forEach(button=>{
    button.addEventListener('click',()=>{
      const item=byYear.get(button.dataset.historyYear);
      $('arpaHistoryDetail').innerHTML=arpaHistoryDetailHtml(item)
    })
  });

  const defaultItem=byYear.get(yearB)||byYear.get(yearA)||valid.at(-1);
  $('arpaHistoryDetail').innerHTML=arpaHistoryDetailHtml(defaultItem);

  // Start with Periodo B visible without moving the whole page vertically.
  requestAnimationFrame(()=>{
    const scroll=chart.querySelector('.arpa-history-scroll');
    const target=chart.querySelector(`[data-history-year="${CSS.escape(yearB)}"]`)
      ||chart.querySelector(`[data-history-year="${CSS.escape(yearA)}"]`);
    if(scroll&&target){
      const desired=target.offsetLeft-(scroll.clientWidth-target.offsetWidth)/2;
      scroll.scrollLeft=Math.max(0,desired)
    }
  })
}

async function loadArpaHistorySeries(renderToken){
  const panel=$('arpaHistoryPanel');
  const chart=$('arpaHistoryChart');
  if(!panel||!chart)return;

  panel.classList.remove('hidden');
  chart.setAttribute('aria-busy','true');
  chart.innerHTML='<div class="arpa-history-loading">Caricamento storico ARPA…</div>';
  const municipality=$('arpaCitySelect')?.selectedOptions?.[0]?.textContent||'Roma';
  $('arpaHistorySubtitle').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · MIN, MED e MAX annuali · Comune di ${municipality}`;
  $('arpaHistoryDetail').textContent='Caricamento dei valori annuali…';

  const pollutant=$('pollutantSelect').value;
  const years=[...ARPA_YEARS].sort((a,b)=>Number(a)-Number(b));
  const results=new Array(years.length);
  let cursor=0;

  async function worker(){
    while(cursor<years.length){
      const index=cursor++;
      const year=years[index];

      try{
        const rows=await fetchArpaRows(year,pollutant,true);
        const row=rows[0];
        results[index]=row
          ?{year,min:row.min,med:row.value,max:row.max,missing:false}
          :{year,missing:true}
      }catch(err){
        console.warn(`Storico ARPA ${year} non disponibile`,err);
        results[index]={year,missing:true}
      }

      if(renderToken!==state.renderToken)return
    }
  }

  // Three concurrent downloads are enough for mobile without hammering ARPA.
  await Promise.all([worker(),worker(),worker()]);
  if(renderToken!==state.renderToken)return;

  renderArpaHistoryBars(results)
}

function updateArpaHistoryVisibility(){
  const panel=$('arpaHistoryPanel');
  if(!panel)return;

  const visible=state.mode==='compare'&&source()==='arpa';
  panel.classList.toggle('hidden',!visible)
}

function visibleMapBbox(map){
  if(!map)return null;
  const bounds=map.getBounds?.();
  if(!bounds)return null;

  let west=Number(bounds.getWest());
  let east=Number(bounds.getEast());
  let south=Number(bounds.getSouth());
  let north=Number(bounds.getNorth());

  west=Math.max(-180,Math.min(180,west));
  east=Math.max(-180,Math.min(180,east));
  south=Math.max(-85,Math.min(85,south));
  north=Math.max(-85,Math.min(85,north));

  if(!(west<east&&south<north))return null;

  return[west,south,east,north]
    .map(value=>Number(value.toFixed(4)))
}

function viewportRefreshKey(map){
  const bbox=visibleMapBbox(map);
  if(!bbox)return'';
  return`${source()}:${state.mode}:${bbox.map(value=>value.toFixed(4)).join(',')}`
}

function clearScheduledMapRefresh(){
  clearTimeout(state.mapRefreshTimer);
  state.mapRefreshTimer=null
}

function withMapRefreshSuppressed(callback){
  state.mapRefreshSuppressCount++;
  try{
    return callback()
  }finally{
    setTimeout(()=>{
      state.mapRefreshSuppressCount=Math.max(0,state.mapRefreshSuppressCount-1)
    },120)
  }
}

function resetEeaViewport(){
  state.eeaViewportBbox=null;
  state.lastMapViewportKey='';
  clearScheduledMapRefresh()
}

function fitEeaScope(map){
  if(!map||source()!=='eea')return;
  const scope=currentEeaScope();

  // Una volta che l'utente ha spostato la mappa, la camera non deve tornare
  // al capoluogo: il viewport è ormai il nuovo ambito della query.
  if(scope.kind==='viewport')return;

  const [minLon,minLat,maxLon,maxLat]=scope.bbox;
  map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{
    padding:scope.kind==='city'?30:22,
    duration:0,
    maxZoom:scope.zoom
  })
}

function fitCurrentScope(map,rows){
  if(state.viewportRefreshDepth>0)return;

  withMapRefreshSuppressed(()=>{
    if(source()==='arpa')fitArpaScope(map,rows);
    else fitEeaScope(map)
  })
}

function focusSelectedEeaScope(){
  if(source()!=='eea')return;

  withMapRefreshSuppressed(()=>{
    if(state.mode==='compare'){
      fitEeaScope(state.mapBefore);
      fitEeaScope(state.mapAfter)
    }else{
      fitEeaScope(state.map)
    }
  })
}

function activeViewportMap(){
  return state.mode==='compare'
    ?state.mapBefore
    :state.map
}

function rememberViewportBaseline(){
  const map=activeViewportMap();
  if(!map)return;

  state.lastMapViewportKey=viewportRefreshKey(map);

  if(isTemperature()){
    state.temperatureViewportKey=temperatureViewportKey(map)
  }
}

function mapRefreshSuppressed(){
  if(state.mapRefreshSuppressCount>0)return true;

  /*
   * openaqSuppressMove è specifico di OpenAQ: non deve bloccare EEA,
   * ARPA o temperatura.
   */
  return source()==='openaq'&&Boolean(state.openaqSuppressMove)
}

async function refreshForVisibleMap(map){
  if(!map||mapRefreshSuppressed())return;
  if(isTrees())return;

  /*
   * La temperatura usa una chiave indipendente dalla cache generica.
   * In questo modo un pan/zoom non può essere ignorato a causa di stato
   * lasciato da EEA/OpenAQ.
   */
  if(isTemperature()){
    const key=temperatureViewportKey(map);
    if(!key||key===state.temperatureViewportKey)return;

    const previous=state.temperatureViewportKey;
    state.temperatureViewportKey=key;

    diagnostics({
      source:'Temperatura · ERA5-Land / Open-Meteo',
      phase:'viewport-changed',
      previousViewportKey:previous||null,
      viewportKey:key,
      year:$('yearSelect')?.value||null,
      metric:temperatureMetric(),
      boundingBox:temperatureVisibleBbox(map),
      debounceMs:MAP_REFRESH_DELAY_MS
    });

    state.viewportRefreshDepth++;
    try{
      await render()
    }catch(err){
      /*
       * Se il refresh fallisce, permetti un nuovo tentativo sulla stessa
       * viewport al prossimo moveend.
       */
      state.temperatureViewportKey=previous;
      throw err
    }finally{
      state.viewportRefreshDepth=Math.max(0,state.viewportRefreshDepth-1)
    }
    return
  }

  const key=viewportRefreshKey(map);
  if(!key||key===state.lastMapViewportKey)return;

  state.lastMapViewportKey=key;

  if(source()==='eea'){
    const bbox=visibleMapBbox(map);
    if(!bbox)return;
    state.eeaViewportBbox=bbox
  }

  state.viewportRefreshDepth++;
  try{
    await render()
  }finally{
    state.viewportRefreshDepth=Math.max(0,state.viewportRefreshDepth-1)
  }
}

function scheduleMapRefresh(map){
  if(!map||mapRefreshSuppressed())return;

  clearScheduledMapRefresh();
  state.mapRefreshTimer=setTimeout(()=>{
    state.mapRefreshTimer=null;
    refreshForVisibleMap(map).catch(err=>{
      console.error('Aggiornamento dati dopo spostamento mappa',err);
      showToast(err.message||'Errore nell’aggiornamento dell’area visibile')
    })
  },MAP_REFRESH_DELAY_MS)
}

function bindMapRefresh(map){
  if(!map||map.__qaViewportRefreshBound)return;
  map.__qaViewportRefreshBound=true;

  map.on('movestart',()=>{
    if(mapRefreshSuppressed())return;
    clearScheduledMapRefresh()
  });

  map.on('moveend',()=>{
    scheduleMapRefresh(map)
  })
}

function setLoading(on){
  $('loadingOverlay').classList.toggle('hidden',!on);

  if(isTrees()){
    const period=state.mode==='map'?$('yearSelect').value:`${$('compareYearA').value} ↔ ${$('compareYearB').value}`;
    $('loadingText').textContent=`Caricamento statistiche arboree · ${period}…`;
    return
  }

  if(isTemperature()){
    $('loadingText').textContent=`Caricamento temperatura · ${$('yearSelect').value}…`;
    return
  }

  $('loadingText').textContent=source()==='eea'
    ?`Caricamento EEA · ${currentEeaScope().label}…`
    :'Caricamento file ARPA Lazio…'
}

function clearTemperatureOverlays(){
  window.dispatchEvent(
    new CustomEvent('qualita-aria:temperature-overlay-clear')
  )
}

function requestTemperatureOverlay(map,year,side='single'){
  if(!map||state.mode==='difference')return;

  // OpenAQ resta esclusivamente qualità dell'aria.
  if(source()==='openaq'){
    clearTemperatureOverlays();
    return
  }

  const bbox=visibleMapBbox(map);
  if(!bbox)return;

  window.dispatchEvent(
    new CustomEvent('qualita-aria:temperature-overlay',{
      detail:{
        map,
        side,
        pollutantSource:source(),
        pollutant:$('pollutantSelect')?.value||null,
        year,
        bbox,
        mode:state.mode
      }
    })
  )
}

function sourceNotice(rows){
  if(isTemperature()){
    return rows.length
      ?'Copernicus ERA5-Land · medie annuali MIN / MEDIA / MAX · griglia climatica 0,1°'
      :'ERA5-Land · nessuna cella disponibile';
  }
  if(source()==='arpa')return'ARPA Lazio · Standard comunali';
  const scope=currentEeaScope().label;
  if(!rows.length)return`EEA · ${scope} · nessuna statistica annuale P1Y per questa selezione`;
  const unverified=rows.some(r=>normalizeText(r.verification).includes('unverified'));
  return unverified?`EEA · ${scope} · presenti dati non verificati`:`EEA · ${scope} · statistiche annuali P1Y`
}

async function updateCompareMaps(token=state.renderToken){
  const yearA=$('compareYearA').value;
  const yearB=$('compareYearB').value;

  const[a,b]=await Promise.all([
    rowsFor(yearA),
    rowsFor(yearB)
  ]);

  setAirData(state.mapBefore,a,'before');
  setAirData(state.mapAfter,b,'after');

  setLayerVisibility(state.mapBefore,[
    'before-boundary-fill','before-boundary-line','before-heat'
  ],true);
  setLayerVisibility(state.mapBefore,[
    'before-points','before-labels'
  ],false);

  setLayerVisibility(state.mapAfter,[
    'after-boundary-fill','after-boundary-line','after-heat'
  ],true);
  setLayerVisibility(state.mapAfter,[
    'after-points','after-labels'
  ],false);

  fitCurrentScope(state.mapBefore,a);
  fitCurrentScope(state.mapAfter,b);

  $('beforeBadge').textContent=yearA;
  $('afterBadge').textContent=yearB;

  if(token===state.renderToken){
    requestTemperatureOverlay(state.mapBefore,yearA,'before');
    requestTemperatureOverlay(state.mapAfter,yearB,'after')
  }

  return{a,b}
}

async function renderTemperatureMode(token){
  clearTemperatureOverlays();

  const year=$('yearSelect').value;
  const rows=await rowsFor(year);

  if(token!==state.renderToken)return;

  showTemperatureOnSingle(rows);
  renderTemperatureList(rows);

  const metric=temperatureMetric();
  const metricInfo=TEMPERATURE_METRICS[metric];

  const values=rows
    .map(row=>Number(row[metric]))
    .filter(Number.isFinite);

  const average=values.length
    ?values.reduce((sum,value)=>sum+value,0)/values.length
    :null;

  $('mapBadge').textContent=`${metricInfo.label} · ${year}`;
  $('avgLabel').textContent=metricInfo.label;
  $('avgValue').textContent=average===null?'—':fmt(average);

  if($('avgUnit'))$('avgUnit').textContent='°C';

  $('stationCount').textContent=rows.length;
  $('countLabel').textContent='Celle';
  $('countUnit').textContent='ERA5-Land';
  $('periodValue').textContent=`${year} · intero anno`;
  $('sourceValue').textContent='Copernicus ERA5-Land · Open-Meteo';
  $('dataNotice').textContent=sourceNotice(rows);
  $('mapHint').textContent=SOURCE_INFO.temperature.hint;

  rememberViewportBaseline()
}

function treeListHtml(result,year,includeAggregate=true){
  const {city,events,aggregate,documentedEvents=[],documentedSummary,diagnostic={}}=result;
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl=value=>{try{const url=new URL(String(value));return url.protocol==='https:'?url.toString():'#'}catch{return'#'}};
  if(!city)return'<div class="empty-state">Città non configurata per le statistiche arboree.</div>';
  if(!city.available)return`<div class="tree-period-note"><strong>${city.name}</strong><br>${city.reason}</div>`;

  const balanceRow=event=>{
    const saldo=Number(event.plantings)-Number(event.decrements);
    const total=Number(event.plantings)+Number(event.decrements);
    const max=Math.max(Number(event.plantings),Number(event.decrements),1);
    const prefix=event.dataKind==='documented_partial'?'Saldo minimo documentato':'Saldo';
    const plantedLabel=event.dataKind==='documented_partial'?'Piantati documentati':'Piantati';
    const sourceLink=event.dataKind==='official_period'&&event.source?.url
      ?` <a href="${safeUrl(event.source.url)}" target="_blank" rel="noopener noreferrer">Fonte ufficiale</a>`
      :'';
    return`<div class="tree-balance-row"><div class="tree-balance-head"><strong>${event.locationName} · ${event.period}</strong><b>${prefix} ${saldo>0?'+':''}${TreeStats.fmt(saldo)}</b></div><div class="tree-compare"><span>${plantedLabel}</span><i class="tree-compare-bar tree-compare-planted" style="width:${Math.max(8,event.plantings/max*100)}%"><b>${TreeStats.fmt(event.plantings)}</b></i><span>${event.decrementLabel}</span><i class="tree-compare-bar tree-compare-cut" style="width:${Math.max(8,event.decrements/max*100)}%"><b>${TreeStats.fmt(event.decrements)}</b></i><span>Totale</span><strong class="tree-compare-total">${TreeStats.fmt(total)} interventi documentati</strong></div><small>${event.coverageLabel?`${event.coverageLabel}. `:''}${event.notes}${sourceLink}</small></div>`
  };
  const rows=events.map(balanceRow).join('');

  const statusLabels={completed:'Eseguito',emergency_completed:'Urgente eseguito',planned:'Programmato',reported:'Comunicazione ufficiale',unknown:'Stato non determinato'};
  const documentedList=documentedEvents.length
    ?`${documentedSummary?balanceRow(documentedSummary):''}<div class="tree-event-list" data-tree-event-list>${documentedEvents.map((event,index)=>{
      const type=event.eventType==='planting'?'Piantumazione':event.eventType==='decrement'?'Abbattimento':'Tipo da verificare';
      const quantity=Number.isFinite(event.quantity)?`${TreeStats.fmt(event.quantity)} alberi`:'quantità non specificata';
      const validation=event.validation==='automatic_pending'?' · da verificare':event.validation==='automatic_confirmed'?' · verifica automatica':'';
      const located=Array.isArray(event.coordinates)&&event.coordinates.length===2;
      const mapped=Number(event.path?.properties?.locationsMapped||0);
      const expected=Number(event.path?.properties?.locationsExpected||0);
      const pathDetail=expected>1?`<br>${mapped} località evidenziate su ${expected} documentate; ripartizione delle quantità non specificata.`:'';
      return`<div class="tree-event-row" data-tree-event-index="${index}" data-tree-event-id="${safe(event.id)}"><button class="tree-event-focus" type="button" data-tree-focus="${safe(event.id)}" ${located?'':`disabled title="Coordinate non ancora disponibili"`}><i class="tree-list-icon ${event.eventType==='planting'?'is-planted':'is-cut'} ${event.status==='planned'?'is-planned':''}">${TreeStats.iconSvg(event)}</i><span><strong>${safe(event.locationName)}</strong><small>${safe(event.date)}${event.district?` · ${safe(event.district)}`:''}<br>${safe(type)} · ${safe(statusLabels[event.status]||event.status)}${safe(validation)} · ${safe(quantity)}${located?' · mostra sulla mappa':' · posizione in verifica'}${pathDetail}</small></span></button><a href="${safeUrl(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte ufficiale</a></div>`
    }).join('')}</div>${documentedEvents.length>TREE_EVENTS_PER_PAGE?`<nav class="tree-pagination" data-tree-pagination aria-label="Pagine degli eventi"><button type="button" data-tree-page="prev">Precedente</button><span data-tree-page-status></span><button type="button" data-tree-page="next">Successiva</button></nav>`:''}`
    :'';

  const syncDate=diagnostic.lastSync?.completed_at||diagnostic.lastSync?.completedAt||null;
  const dynamicNote=diagnostic.dynamicAvailable
    ?`<div class="tree-period-note tree-sync-note">${syncDate?`Aggiornato al ${safe(new Date(syncDate).toLocaleString('it-IT'))}. `:''}${diagnostic.dynamicEvents||0} nuovi eventi aggiunti.</div>`
    :'';

  const aggregateNote=includeAggregate&&aggregate
    ?balanceRow(aggregate)
    :'';
  return dynamicNote+rows+documentedList+aggregateNote||'<div class="empty-state">Nessun totale annuale o evento arboreo documentato disponibile per questa selezione.</div>'
}

function bindTreeEventLists(groups=[]){
  document.querySelectorAll('[data-tree-event-list]').forEach((list,listIndex)=>{
    const rows=[...list.querySelectorAll('.tree-event-row')];
    if(!rows.length)return;
    const group=groups[listIndex]||groups[0]||{events:[],map:state.map};
    const pagination=list.nextElementSibling?.matches('[data-tree-pagination]')?list.nextElementSibling:null;
    let page=0;
    const pages=Math.ceil(rows.length/TREE_EVENTS_PER_PAGE);
    const update=()=>{
      rows.forEach((row,index)=>row.classList.toggle('hidden',Math.floor(index/TREE_EVENTS_PER_PAGE)!==page));
      const status=pagination?.querySelector('[data-tree-page-status]');
      if(status)status.textContent=`Pagina ${page+1} di ${pages}`;
      const previous=pagination?.querySelector('[data-tree-page="prev"]');
      const next=pagination?.querySelector('[data-tree-page="next"]');
      if(previous)previous.disabled=page===0;
      if(next)next.disabled=page>=pages-1
    };
    pagination?.querySelectorAll('[data-tree-page]').forEach(button=>button.addEventListener('click',()=>{
      page=Math.max(0,Math.min(pages-1,page+(button.dataset.treePage==='next'?1:-1)));
      update()
    }));
    list.querySelectorAll('[data-tree-focus]').forEach(button=>button.addEventListener('click',()=>{
      const event=group.events.find(item=>String(item.id)===button.dataset.treeFocus);
      if(event)TreeStats.focusEvent(group.map,event.id)
    }));
    update()
  })
}

async function renderTreesMode(token){
  clearTemperatureOverlays();
  setTemperatureVisibility(false);
  $('stationListTools')?.classList.add('hidden');
  $('stationPagination')?.classList.add('hidden');
  const cityId=eeaCity();
  const treeLayerIds=prefix=>[
    `${prefix}-boundary-fill`,`${prefix}-boundary-line`,`${prefix}-heat`,`${prefix}-points`,`${prefix}-labels`
  ];
  setLayerVisibility(state.map,[...treeLayerIds('air'),'diff-boundary-fill','diff-boundary-line','diff-good','diff-bad','diff-points','diff-labels'],false);
  setLayerVisibility(state.mapBefore,treeLayerIds('before'),false);
  setLayerVisibility(state.mapAfter,treeLayerIds('after'),false);

  const yearA=state.mode==='map'?$('yearSelect').value:$('compareYearA').value;
  const yearB=state.mode==='map'?null:$('compareYearB').value;
  const [resultA,resultB]=await Promise.all([
    TreeStats.rows(cityId,yearA),
    yearB?TreeStats.rows(cityId,yearB):Promise.resolve(null)
  ]);
  if(token!==state.renderToken)return;
  const boundary=cityId==='roma'&&(resultA.record||resultB?.record)?await fetchRomeBoundary():null;
  if(token!==state.renderToken)return;

  let displayed=0;
  let summaryValue=null;
  if(state.mode==='compare'){
    TreeStats.clear(state.map);
    const recordA=resultA.record||null;
    const recordB=resultB.record||null;
    TreeStats.showScope(state.mapBefore,recordA,boundary);
    TreeStats.showScope(state.mapAfter,recordB,boundary);
    TreeStats.showDocumentedEvents(state.mapBefore,resultA.documentedEvents);
    TreeStats.showDocumentedEvents(state.mapAfter,resultB.documentedEvents);
    $('beforeBadge').textContent=yearA;
    $('afterBadge').textContent=yearB;
    const comparable=recordA&&recordB&&recordA.dataKind===recordB.dataKind;
    $('stations').innerHTML=`<div class="tree-period-note"><strong>Confronto ${yearA} ↔ ${yearB}</strong><br>${comparable?'Le due selezioni usano dati della stessa natura.':'I dati hanno copertura diversa: il confronto visivo resta disponibile, ma la differenza numerica non è calcolata.'}</div>${treeListHtml(resultA,yearA,false)}${treeListHtml(resultB,yearB,false)}`;
    bindTreeEventLists([{events:resultA.documentedEvents,map:state.mapBefore},{events:resultB.documentedEvents,map:state.mapAfter}]);
    displayed=Number(Boolean(recordA))+Number(Boolean(recordB));
    summaryValue=recordB?TreeStats.balanceOf(recordB):null;
    requestAnimationFrame(()=>{state.mapBefore.resize();state.mapAfter.resize()})
  }else if(state.mode==='difference'){
    TreeStats.clear(state.mapBefore);
    TreeStats.clear(state.mapAfter);
    const recordA=resultA.record||null;
    const recordB=resultB.record||null;
    const diff=TreeStats.showDifferenceScope(state.map,recordA,recordB,boundary,yearA,yearB);
    if(diff){
      const partial=diff.dataKind==='documented_partial';
      $('stations').innerHTML=`<div class="tree-balance-row"><div class="tree-balance-head"><strong>${partial?'Variazione del saldo minimo documentato':'Variazione del saldo'} · ${yearA} → ${yearB}</strong><b>${diff.difference>0?'+':''}${TreeStats.fmt(diff.difference)}</b></div><small>${partial?'Confronto fra raccolte parziali di eventi pubblici; non rappresenta la variazione completa del patrimonio. ':''}Saldo ${yearA}: ${diff.balanceA>0?'+':''}${TreeStats.fmt(diff.balanceA)} · saldo ${yearB}: ${diff.balanceB>0?'+':''}${TreeStats.fmt(diff.balanceB)}.</small></div>`;
      displayed=1;
      summaryValue=diff.difference
    }else{
      $('stations').innerHTML='<div class="empty-state">Differenza non calcolabile: servono due selezioni con la stessa natura e copertura. Un bilancio ufficiale completo non viene confrontato numericamente con una raccolta parziale.</div>'
    }
    $('mapBadge').textContent=`Δ ${diff?.dataKind==='documented_partial'?'minimo documentato':'saldo alberi'} · ${yearB} − ${yearA}`
  }else{
    TreeStats.clear(state.mapBefore);
    TreeStats.clear(state.mapAfter);
    const scopeRecord=resultA.record||null;
    TreeStats.showScope(state.map,scopeRecord,boundary,false);
    TreeStats.showDocumentedEvents(state.map,resultA.documentedEvents);
    $('stations').innerHTML=treeListHtml(resultA,yearA);
    bindTreeEventLists([{events:resultA.documentedEvents,map:state.map}]);
    summaryValue=scopeRecord?TreeStats.balanceOf(scopeRecord):null;
    displayed=resultA.documentedEvents.length||(scopeRecord?1:0);
    $('mapBadge').textContent=`Alberi · ${resultA.city?.name||'città'} · ${scopeRecord?.period||TREE_PERIOD_LABELS.get(yearA)||yearA}`
  }

  $('avgValue').textContent=summaryValue===null?'—':`${summaryValue>0?'+':''}${TreeStats.fmt(summaryValue)}`;
  const partialRecord=(resultB?.record||resultA.record)?.dataKind==='documented_partial';
  $('avgLabel').textContent=state.mode==='difference'?(partialRecord?'Variazione minimo':'Variazione saldo'):state.mode==='compare'?`${partialRecord?'Saldo minimo':'Saldo'} ${yearB}`:(partialRecord?'Saldo minimo documentato':'Saldo documentato');
  $('stationCount').textContent=displayed;
  $('countLabel').textContent=isTrees()?'Eventi':'Stazioni';
  $('countUnit').textContent=isTrees()?'visualizzati':'visualizzate';
  $('periodValue').textContent=yearB?`${yearA}↔${yearB}`:(TREE_PERIOD_LABELS.get(yearA)||yearA);
  $('sourceValue').textContent=resultA.city?.available?'Fonte comunale ufficiale':'Dati non ancora verificati';
  $('dataNotice').textContent=displayed?(partialRecord?'':`${displayed} ambito/i territoriale/i`):'Dati annuali non disponibili';
  $('mapHint').textContent='';
  diagnostics({source:'Statistiche arboree',mode:state.mode,yearA,yearB,city:resultA.city?.name||null,available:resultA.city?.available||false,displayed});

  if(resultA.city?.center){
    const camera={center:resultA.city.center,zoom:resultA.city.zoom||9.5};
    if(state.mode==='compare'){
      state.mapBefore.jumpTo(camera);state.mapAfter.jumpTo(camera)
    }else state.map.jumpTo(camera)
  }
}

async function render(){
  if(!state.map)return;
  const token=++state.renderToken;
  setLoading(true);

  const periodComparison=['compare','difference'].includes(state.mode);
  document.documentElement.classList.toggle('trees-source',isTrees());
  $('mapHint').classList.remove('tree-map-hint');
  $('mapHint').classList.toggle('hidden',isTrees());

  $('comparePanel').classList.toggle('hidden',!periodComparison);
  $('singleYearField').classList.toggle(
    'hidden',
    !['map','temperature','trees'].includes(state.mode)
  );
  $('singleMapWrap').classList.toggle('hidden',state.mode==='compare');
  $('compareMapWrap').classList.toggle('hidden',state.mode!=='compare');
  $('standardLegend').classList.toggle('hidden',state.mode==='difference'||isTrees());
  $('differenceLegend').classList.toggle('hidden',state.mode!=='difference'||isTrees());
  $('mapBadge').classList.toggle('hidden',state.mode==='compare');
  updateArpaHistoryVisibility();

  try{
    if(isTrees()){
      await renderTreesMode(token);
      return
    }
    window.TreeStats?.clear?.();
    if(isTemperature()){
      await renderTemperatureMode(token);
      return
    }

    let rows=[];

    if(state.mode==='difference'){
      clearTemperatureOverlays();
      rows=await differenceRows();
      if(token!==state.renderToken)return;

      showDifferenceOnSingle(rows);
      fitCurrentScope(state.map,rows);
      renderList(rows,true);
      $('mapBadge').textContent=`Δ ${$('compareYearB').value} − ${$('compareYearA').value}`;
      $('avgLabel').textContent=source()==='arpa'?'Differenza MED':'Differenza media stazioni';
      const a=avg(rows);
      $('avgValue').textContent=`${a>0?'+':''}${fmt(a)}`;
      $('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
    }else if(state.mode==='compare'){
      const pair=await updateCompareMaps(token);
      if(token!==state.renderToken)return;

      if(source()==='eea'){
        rows=mergeComparisonRows(pair.a,pair.b);
        renderComparisonList(rows)
      }else{
        rows=pair.b;
        renderList(rows);
        loadArpaHistorySeries(token)
      }

      $('avgLabel').textContent=source()==='arpa'
        ?`MED ${$('compareYearB').value}`
        :`Media stazioni ${$('compareYearB').value}`;
      $('avgValue').textContent=pair.b.length?fmt(avg(pair.b)):'—';
      $('periodValue').textContent=`${$('compareYearA').value}↔${$('compareYearB').value}`;
      requestAnimationFrame(()=>{
        state.mapBefore.resize();
        state.mapAfter.resize()
      });
    }else{
      rows=await rowsFor($('yearSelect').value);
      if(token!==state.renderToken)return;

      showAirOnSingle(rows);
      fitCurrentScope(state.map,rows);
      renderList(rows);

      requestTemperatureOverlay(
        state.map,
        $('yearSelect').value,
        'single'
      );

      const municipality=source()==='arpa'?` · ${$('arpaCitySelect')?.selectedOptions?.[0]?.textContent||'Roma'}`:'';
      $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · ${$('yearSelect').value}${municipality}`;
      $('avgLabel').textContent=source()==='arpa'?'Valore MED':'Media stazioni';
      $('avgValue').textContent=rows.length?fmt(avg(rows)):'—';
      $('periodValue').textContent=$('yearSelect').value;
    }

    if($('avgUnit'))$('avgUnit').textContent='µg/m³';
    $('stationCount').textContent=source()==='arpa'?($('arpaCitySelect')?.selectedOptions?.[0]?.textContent||'Roma'):rows.length;
    $('sourceValue').textContent=source()==='eea'?`EEA · ${currentEeaScope().label}`:SOURCE_INFO[source()].name;
    $('dataNotice').textContent=sourceNotice(rows);
$('mapHint').textContent=SOURCE_INFO[source()].hint;
    rememberViewportBaseline();
  }catch(err){
    console.error(err);
    if(token!==state.renderToken)return;

    diagnostics({
      source:isTemperature()
        ?'Temperatura · ERA5-Land / Open-Meteo'
        :SOURCE_INFO[source()]?.name||source(),
      mode:state.mode,
      year:$('yearSelect')?.value||null,
      metric:isTemperature()?temperatureMetric():null,
      error:String(err.message||err),
      errorCode:String(err.code||''),
      status:Number.isFinite(Number(err.status))?Number(err.status):null,
      payload:err.payload||null
    });

    if(isTrees()){
      window.TreeStats?.clear?.();
      $('stations').innerHTML='<div class="empty-state">Statistiche arboree non disponibili per questa selezione.</div>';
    }else if(isTemperature()){
      setTemperatureVisibility(false);
      renderTemperatureList([]);
    }else{
      window.TreeStats?.clear?.();
      showAirOnSingle([]);
      renderList([]);
    }

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
  state.mapAfter.on('move',()=>sync(state.mapAfter,state.mapBefore));

  // Un solo debounce da 2 secondi per tutte le mappe/fonti.
  bindMapRefresh(state.map);
  bindMapRefresh(state.mapBefore);
  bindMapRefresh(state.mapAfter)
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
  // La vecchia modalità ERA5-Land non deve poter riapparire nemmeno se il
  // browser conserva una copia precedente dell'HTML.
  document.querySelectorAll('[data-mode="temperature"],[data-mode="trees"]').forEach(node=>node.remove());
  if(!['map','compare','difference'].includes(state.mode))state.mode='map';

  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    if(!['map','compare','difference'].includes(btn.dataset.mode))return;
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    state.mode=btn.dataset.mode;

    clearTemperatureOverlays();
    if(!isTrees())window.TreeStats?.clear?.();
    fillYears();
    configureSourceUI();
    render()
  }));

  $('sourceSelect').addEventListener('change',()=>{
    resetEeaViewport();
    state.temperatureViewportKey='';
    clearTemperatureOverlays();
    fillYears();
    if(isTrees()){
      $('yearSelect').value=TREE_MAP_PERIODS[0].value;
      $('compareYearA').value='2019';
      $('compareYearB').value='2020'
    }
    configureSourceUI();
    if(source()==='eea')focusSelectedEeaScope();
    render()
  });

  $('eeaScopeSelect').addEventListener('change',()=>{
    if(source()!=='eea')return;
    resetEeaViewport();
    configureSourceUI();
    focusSelectedEeaScope();
    render()
  });

  $('eeaCitySelect')?.addEventListener('change',()=>{
    if(isTrees()){
      render();
      return
    }
    if(source()!=='eea'||eeaScope()!=='italy')return;
    resetEeaViewport();
    focusSelectedEeaScope();
    render()
  });

  $('arpaCitySelect')?.addEventListener('change',()=>{
    if(source()!=='arpa')return;
    configureSourceUI();
    render()
  });

  ['pollutantSelect','yearSelect','compareYearA','compareYearB']
    .forEach(id=>$(id)?.addEventListener('change',render));

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    state.deferredPrompt=e
  });

  $('installBtn').addEventListener('click',installApp);
  bindSwipe()
}

async function loadVersion(){
  const [appVersion,dataVersion]=await Promise.all([
    fetch('version.json?v=0.5.12',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.5.12',{cache:'no-store'}).then(r=>r.json())
  ]);
  $('appVersion').textContent=appVersion.version;
  $('dataVersion').textContent=dataVersion.version
}

async function boot(){
  await loadEeaCities();
  fillYears();
  configureSourceUI();
  bind();
  await loadVersion();
  initMaps();

  if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./service-worker.js?v=0.5.12')
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
