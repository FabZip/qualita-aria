const state={
  mode:'map',
  map:null,mapBefore:null,mapAfter:null,
  deferredPrompt:null,swipe:50,syncing:false,
  activeSource:null,sourceSettings:new Map(),
  toastTimer:null,renderToken:0,
  eeaCache:new Map(),
  municipalBoundaryCache:new Map(),
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
  treeEvents:new Map(),treeAvailableYears:new Map(),treeProxyPromise:null,treeReportMap:null,treeReportMapStyle:'satellite',treeReportEvent:null,treeEventReportEvent:null,treeReportInitialCoordinates:null,
  diagnostics:{}
};

const $=id=>document.getElementById(id);
const MAP_STYLE='https://tiles.openfreemap.org/styles/positron';
const TREE_REPORT_SATELLITE_STYLE={version:8,sources:{satellite:{type:'raster',tiles:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],tileSize:256,attribution:'Imagery © Esri, Maxar, Earthstar Geographics e altri contributori'}},layers:[{id:'satellite',type:'raster',source:'satellite'}]};
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};
const EUROPE={center:[10.0,50.0],zoom:3.15,bbox:[-25.0,27.0,45.0,72.0]};
const EEA_CITY_RADIUS_KM=10;
const EEA_DEFAULT_CITY='roma';
const MAP_REFRESH_DELAY_MS=2000;
const TEMPERATURE_LAST_COMPLETE_YEAR=new Date().getUTCFullYear()-1;
const TEMPERATURE_YEARS=Array.from(
  {length:TEMPERATURE_LAST_COMPLETE_YEAR-1950+1},
  (_,index)=>String(TEMPERATURE_LAST_COMPLETE_YEAR-index)
);
const TEMPERATURE_METRICS={
  min:{label:'Minima assoluta annuale',short:'MIN'},
  mean:{label:'Temperatura media annuale',short:'MEDIA'},
  max:{label:'Massima assoluta annuale',short:'MAX'}
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
const TREE_GUIDONIA_PERIODS=[
  {value:'2026',label:'2026 eventi'},
  {value:'2025',label:'2025 eventi'},
  {value:'2024',label:'2024 eventi'},
  {value:'2019',label:'2019 eventi'}
];
const TREE_CITY_CONFIG={
  roma:{id:'roma',name:'Roma',center:ROME.center,zoom:10.2,istat:'058091'},
  'guidonia-montecelio':{id:'guidonia-montecelio',name:'Guidonia Montecelio',center:[12.7268,41.9938],zoom:11.2,istat:'058047'}
};
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
 * Municipal boundaries in WGS84 derived from ISTAT limits.
 * Tree municipalities determine which Lazio province file is loaded.
 */
const MUNICIPAL_BOUNDARY_URLS={
  '056':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_56_municipalities.geojson',
  '057':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_57_municipalities.geojson',
  '058':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_58_municipalities.geojson',
  '059':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_59_municipalities.geojson',
  '060':'https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_60_municipalities.geojson'
};

const POLLUTANTS={
  'PM2.5':{eeaCode:6001,label:'PM2.5'},
  'PM10':{eeaCode:5,label:'PM10'},
  'NO2':{eeaCode:8,label:'NO₂'},
  O3:{label:'O₃'},
  SO2:{label:'SO₂'},
  CO:{label:'CO'}
};

const EEA_YEARS=Array.from({length:13},(_,i)=>String(2025-i));


const SOURCE_INFO={
  eea:{
    name:'EEA',
    years:EEA_YEARS,
    description:'<strong>EEA:</strong> statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.',
    hint:'I punti rappresentano stazioni reali. La sfumatura aiuta a leggerne la distribuzione e non descrive una concentrazione uniforme sul territorio.'
  },
  temperature:{
    name:'ERA5-Land · Open-Meteo',
    years:TEMPERATURE_YEARS,
    description:'<strong>Temperatura:</strong> modalità indipendente dalle fonti inquinanti. Usa Copernicus ERA5-Land tramite <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a>; puoi colorare la superficie con minima assoluta annuale, temperatura media annuale o massima assoluta annuale.',
    hint:'ERA5-Land è una rielaborazione climatica a celle, non una rete di stazioni. La superficie usa MIN / MEDIA / MAX selezionato; cliccando una cella vengono mostrati tutti e tre. Risoluzione circa 9 km.'
  }
};

function source(){return $('sourceSelect').value}
function sourceSettingFields(name){
  const periods=['yearSelect','compareYearA','compareYearB'];
  switch(name){
    case 'eea':return['eeaScopeSelect','eeaCitySelect','pollutantSelect',...periods];
    case 'openaq':return['eeaCitySelect','pollutantSelect','monthSelect'];
    case 'weather':return[];
    case 'forecast':return['eeaCitySelect','pollutantSelect'];
    case 'trees':return['eeaCitySelect',...periods];
    default:return[]
  }
}

function rememberSourceSettings(name){
  if(!name)return;
  state.sourceSettings.set(name,{
    mode:state.mode,
    values:Object.fromEntries(sourceSettingFields(name).map(id=>[id,$(id)?.value]))
  })
}

function restoreSourceSelect(id,value){
  const select=$(id);
  if(value===undefined||!select)return;
  if([...select.options].some(option=>option.value===value&&!option.disabled))select.value=value
}

function changeSource(){
  const next=source();
  rememberSourceSettings(state.activeSource);
  const saved=state.sourceSettings.get(next);
  state.activeSource=next;
  resetEeaViewport();
  state.temperatureViewportKey='';
  clearTemperatureOverlays();
  if(saved&&['map','compare','difference'].includes(saved.mode))state.mode=saved.mode;
  // Area e città determinano le opzioni disponibili nei controlli successivi.
  if(saved)restoreSourceSelect('eeaScopeSelect',saved.values.eeaScopeSelect);
  configureSourceUI();
  if(saved)restoreSourceSelect('eeaCitySelect',saved.values.eeaCitySelect);
  fillYears();
  const restore=()=>{
    if(saved)for(const id of sourceSettingFields(next))restoreSourceSelect(id,saved.values[id])
  };
  restore();
  if(!saved&&isTrees()){
    $('yearSelect').value=currentTreePeriods()[0].value;
    restoreSourceSelect('compareYearA','2019');
    restoreSourceSelect('compareYearB','2020')
  }
  configureSourceUI();
  // Alcune fonti ricreano il Periodo durante la configurazione dell'interfaccia.
  restore();
  document.querySelectorAll('.tab').forEach(button=>{
    button.classList.toggle('active',button.dataset.mode===state.mode)
  });
  if(next==='eea')focusSelectedEeaScope();
  render()
}

function isTemperature(){return state.mode==='temperature'}
function isTrees(){return source()==='trees'}
function isForecast(){return source()==='forecast'}
function eeaScope(){return $('eeaScopeSelect')?.value||'italy'}
function eeaCity(){return $('eeaCitySelect')?.value||EEA_DEFAULT_CITY}

function eeaSelectedScope(){
  if(eeaScope()==='europe')return EEA_SCOPES.europe;

  if(eeaCity()==='geolocate'){
    if(!state.eeaGeoCity)throw new Error('Consenti la geolocalizzazione oppure seleziona una città.');
    return eeaCityScope(state.eeaGeoCity)
  }

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
    zoom:11.5,
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

function currentTreePeriods(){
  const periods=[...(eeaCity()==='guidonia-montecelio'?TREE_GUIDONIA_PERIODS:TREE_MAP_PERIODS)];
  for(const year of state.treeAvailableYears.get(eeaCity())||[]){
    if(periods.some(period=>period.value===year))continue;
    const index=periods.findIndex(period=>/^\d{4}$/.test(period.value)&&Number(period.value)<Number(year));
    periods.splice(index<0?periods.length:index,0,{value:year,label:`${year} eventi`})
  }
  return periods
}
function currentYears(){
  return isTrees()
    ?currentTreePeriods().map(item=>item.value)
    :(isTemperature()?TEMPERATURE_YEARS:SOURCE_INFO[source()].years)
}
function normalizeText(v){return String(v??'').toLowerCase().replace(/\s+/g,' ').trim()}
function eeaStationName(value){
  return displayText(value)
}
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
    const response=await fetch('data/italian-capitals.json?v=0.5.15',{cache:'no-store'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);
    const payload=await response.json();
    if(Array.isArray(payload?.cities)&&payload.cities.length){
      cities=payload.cities
    }
  }catch(err){
    console.warn('Elenco capoluoghi non disponibile, uso Roma come fallback.',err)
  }

  cities=cities.map(city=>({...city,name:displayText(city.name)}));
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
  const treePeriods=isTrees()?currentTreePeriods():[];
  const latest=isTrees()?treePeriods[0]?.value:years[0];
  const preferredA=isTrees()?(years.includes('2019')?'2019':years.at(-1)):(years.includes('2015')?'2015':years.at(-1));
  const preferredB=isTrees()?(years.includes('2020')?'2020':latest):(years.includes('2023')?'2023':latest);

  for(const id of ['yearSelect','compareYearA','compareYearB']){
    const options=isTrees()&&id==='yearSelect'
      ?treePeriods.map(item=>item.value)
      :years;
    const old=$(id).value;
    $(id).innerHTML=options.map(y=>`<option value="${y}">${isTrees()?(TREE_PERIOD_LABELS.get(y)||y):y}</option>`).join('');
    if(old&&options.includes(old))$(id).value=old;
  }
  if(!(isTrees()?treePeriods.some(item=>item.value===$('yearSelect').value):years.includes($('yearSelect').value)))$('yearSelect').value=latest;
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
  const isItaly=isEea&&eeaScope()==='italy';

  $('sourceDescription').innerHTML=info.description;
  $('eeaScopeField').classList.toggle('hidden',!isEea);
  $('eeaCityField')?.classList.toggle('hidden',!isItaly);
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
  }
}

function configureTreeCityOptions(active){
  const select=$('eeaCitySelect');
  if(!select)return;
  let desired=active
    ?Object.values(TREE_CITY_CONFIG).map(city=>({
        id:city.id,name:city.name,lon:city.center[0],lat:city.center[1]
      }))
    :[...state.eeaCities.values()];
  if(!active&&['eea','openaq','weather'].includes(source()))desired=[{id:'geolocate',name:'Geolocalizza'},...desired];
  const signature=`${active?'trees':source()}:${desired.map(city=>city.id).join(',')}`;
  if(select.dataset.optionSignature===signature)return;
  const old=select.value;
  select.replaceChildren(...desired.map(city=>{
    const option=document.createElement('option');
    option.value=String(city.id);
    option.textContent=String(city.name);
    return option
  }));
  select.value=!active&&['eea','openaq'].includes(source())&&select.dataset[`${source()}Default`]!=='true'
    ?'geolocate':desired.some(city=>String(city.id)===old)?old:EEA_DEFAULT_CITY;
  if(!active&&['eea','openaq'].includes(source()))select.dataset[`${source()}Default`]='true';
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
    // FormData lets the browser set the multipart boundary, as in EEA's client.
    const body=new FormData();
    body.set('query',sql);
    body.set('p',String(page));
    body.set('nrOfHits',String(pageSize));
    const response=await fetch(EEA_SQL_API,{
      method:'POST',body,cache:'no-store'
    });
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
          ?proxied.data.results.map(row=>({...row,name:eeaStationName(row.name)}))
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
      name:eeaStationName(r.AQStationName||r.AirQualityStation||id),
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

async function fetchMunicipalBoundary(code,name){
  const normalized=String(code).padStart(6,'0');
  if(state.municipalBoundaryCache.has(normalized))return state.municipalBoundaryCache.get(normalized);
  const url=MUNICIPAL_BOUNDARY_URLS[normalized.slice(0,3)];
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

    state.municipalBoundaryCache.set(normalized,boundary);
    return boundary
  }catch(err){
    console.error(`Perimetro ${name} non disponibile`,err);
    throw new Error(`Perimetro ${name} non disponibile: ${err.message||err}`)
  }
}

function fetchTreeBoundary(cityId){
  const city=TREE_CITY_CONFIG[cityId];
  return city?fetchMunicipalBoundary(city.istat,city.name):Promise.resolve(null)
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
        id:r.id,name:displayText(r.name),value:r.value,label:fmt(r.value),
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
        id:r.id,name:displayText(r.name),delta:r.value,absDelta:Math.abs(r.value),
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
    id:`${prefix}-heat`,type:'circle',source:`${prefix}-source`,
    filter:['==',['get','kind'],'station'],
    maxzoom:15,
    paint:{
      'circle-radius':['interpolate',['linear'],['zoom'],3,8,5,18,7,40,9,86,10.5,128,13,178],
      'circle-color':['step',['get','value'],'#35d07f',10,'#e6cf43',20,'#ff914d',30,'#ff5864'],
      'circle-opacity':['interpolate',['linear'],['zoom'],3,.42,5,.5,7,.58,10,.66,13,.54,15,.3],
      'circle-blur':.72,
      'circle-pitch-alignment':'map'
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
      if(p.dataStatus==='preliminary')extra+=`<br>◐ Dato preliminare`;
      if(p.dataStatus==='validated')extra+=`<br>✓ Dato validato`;
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
        `<br>Minima assoluta annuale: ${fmt(p.min)} °C`+
        `<br>Temperatura media annuale: ${fmt(p.mean)} °C`+
        `<br>Massima assoluta annuale: ${fmt(p.max)} °C`+
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
    fitEeaScope(map)
  })
}

function focusSelectedEeaScope(){
  if(source()!=='eea')return;
  if(eeaCity()==='geolocate'&&!state.eeaGeoCity)return;

  withMapRefreshSuppressed(()=>{
    if(state.mode==='compare'){
      fitEeaScope(state.mapBefore);
      fitEeaScope(state.mapAfter)
    }else{
      fitEeaScope(state.map)
    }
  })
}

function focusSelectedOpenAqCity(){
  if(source()!=='openaq'||!state.map)return;

  const city=state.eeaCities.get(eeaCity())
    ||state.eeaCities.get(EEA_DEFAULT_CITY);
  if(!city)return;

  const scope=eeaCityScope(city);
  state.openaqCache?.clear?.();
  state.openaqLastViewportKey='';
  state.openaqSuppressMove=true;
  state.map.jumpTo({center:scope.center,zoom:scope.zoom});
  state.lastMapViewportKey=viewportRefreshKey(state.map);
  setTimeout(()=>{state.openaqSuppressMove=false},0)
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
   * temperatura.
   */
  return source()==='openaq'&&Boolean(state.openaqSuppressMove)
}

async function refreshForVisibleMap(map){
  if(!map||mapRefreshSuppressed())return;
  if(isTrees()||isForecast())return;

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

  $('loadingText').textContent=`Caricamento EEA · ${currentEeaScope().label}…`
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
        period:source()==='eea'&&year==='today'?'today':'0',
        pollutant:$('pollutantSelect')?.value||null,
        year:source()==='eea'&&year==='today'?new Date().getFullYear():year,
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
  const scope=currentEeaScope().label;
  if(!rows.length)return`EEA · ${scope} · nessun dato annuale per questa selezione`;
  const unverified=rows.some(r=>normalizeText(r.verification).includes('unverified'));
  return unverified?`EEA · ${scope} · presenti dati non verificati`:`EEA · ${scope} · dati annuali`
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

function treeEventSourceKey(event){
  if(event?.sourceKey)return String(event.sourceKey);
  try{return new URL(event?.sourceUrl).searchParams.get('contentId')||String(event?.id||'').replace(/^dynamic-/,'')}
  catch{return String(event?.id||'').replace(/^dynamic-/,'')}
}

function treeListHtml(result,year,includeAggregate=true){
  const {city,events,aggregate,documentedEvents=[],documentedSummary,diagnostic={}}=result;
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const safeUrl=value=>{try{const url=new URL(String(value));return ['https:','http:'].includes(url.protocol)?url.toString():'#'}catch{return'#'}};
  if(!city)return'<div class="empty-state">Città non configurata per le statistiche arboree.</div>';
  if(!city.available)return`<div class="tree-period-note ui-card"><strong>${city.name}</strong><br>${city.reason}</div>`;

  const balanceRow=event=>{
    const saldo=Number(event.plantings)-Number(event.decrements);
    const total=Number(event.plantings)+Number(event.decrements);
    const max=Math.max(Number(event.plantings),Number(event.decrements),1);
    const prefix=event.dataKind==='documented_partial'?'Saldo minimo documentato':'Saldo';
    const plantedLabel=event.dataKind==='documented_partial'?'Piantati documentati':'Piantati';
    const sourceLink=event.dataKind==='official_period'&&event.source?.url
      ?` <a href="${safeUrl(event.source.url)}" target="_blank" rel="noopener noreferrer">Fonte ufficiale</a>`
      :'';
    return`<div class="tree-balance-row ui-card"><div class="tree-balance-head"><strong>${event.locationName} · ${event.period}</strong><b>${prefix} ${saldo>0?'+':''}${TreeStats.fmt(saldo)}</b></div><div class="tree-compare"><span>${plantedLabel}</span><i class="tree-compare-bar tree-compare-planted" style="width:${Math.max(8,event.plantings/max*100)}%"><b>${TreeStats.fmt(event.plantings)}</b></i><span>${event.decrementLabel}</span><i class="tree-compare-bar tree-compare-cut" style="width:${Math.max(8,event.decrements/max*100)}%"><b>${TreeStats.fmt(event.decrements)}</b></i><span>Totale</span><strong class="tree-compare-total">${TreeStats.fmt(total)} interventi documentati</strong></div><small>${event.coverageLabel?`${event.coverageLabel}. `:''}${event.notes}${sourceLink}</small></div>`
  };
  const rows=events.map(balanceRow).join('');

  const statusLabels={completed:'Eseguito',emergency_completed:'Urgente eseguito',planned:'Programmato',reported:'Comunicazione ufficiale',unknown:'Stato non determinato'};
  const italianMonths={gennaio:0,febbraio:1,marzo:2,aprile:3,maggio:4,giugno:5,luglio:6,agosto:7,settembre:8,ottobre:9,novembre:10,dicembre:11};
  const plannedDateHasPassed=event=>{
    if(event.status!=='planned')return false;
    const raw=String(event.eventEndDate||event.date||'').trim().toLowerCase();
    let end=null;
    const iso=raw.match(/^(20\d{2})-(\d{2})-(\d{2})/);
    if(iso)end=Date.UTC(Number(iso[1]),Number(iso[2])-1,Number(iso[3]),23,59,59);
    const italian=raw.match(/(?:(\d{1,2})(?:\s*[–-]\s*(\d{1,2}))?\s+)?(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})/);
    if(!end&&italian){
      const year=Number(italian[4]),month=italianMonths[italian[3]];
      end=italian[1]
        ?Date.UTC(year,month,Number(italian[2]||italian[1]),23,59,59)
        :Date.UTC(year,month+1,0,23,59,59)
    }
    return Number.isFinite(end)&&end<Date.now()
  };
  const documentedList=documentedEvents.length
    ?`${documentedSummary?balanceRow(documentedSummary):''}<div class="tree-event-list" data-tree-event-list>${documentedEvents.map((event,index)=>{
      const type=event.eventType==='planting'?'Piantumazione':event.eventType==='decrement'?'Abbattimento':'Tipo da verificare';
      const quantity=Number.isFinite(event.quantity)?TreeStats.fmt(event.quantity):'—';
      const located=Array.isArray(event.coordinates)&&event.coordinates.length===2;
      const validation=event.validation==='automatic_pending'?' · da verificare':'';
      const mapped=Number(event.path?.properties?.locationsMapped||0);
      const expected=Number(event.path?.properties?.locationsExpected||0);
      const pathDetail=located&&expected>1?`<br>${mapped} località evidenziate su ${expected} documentate; ripartizione delle quantità non specificata.`:'';
      const reportKey=treeEventSourceKey(event);
      const reportButton=located&&reportKey
        ?`<button class="tree-event-report" type="button" data-tree-report="${safe(event.id)}" data-tree-source-key="${safe(treeEventSourceKey(event))}" data-tree-location-index="0">Segnala posizione</button><button class="tree-event-report" type="button" data-tree-event-report="${safe(event.id)}">Segnala dati evento</button>`
        :!located&&reportKey
          ?`<button class="tree-event-report" type="button" data-tree-event-report="${safe(event.id)}" data-tree-source-key="${safe(treeEventSourceKey(event))}">Segnala evento</button>`
          :'';
      const statusLabel=event.dateType!=='publication'&&event.dateType!=='year'&&plannedDateHasPassed(event)?'Programmato · data trascorsa':statusLabels[event.status]||event.status;
      const dateLabel=TreeStats.dateLabel?.(event)||event.date;
      const quantityTitle=Number.isFinite(event.quantity)?`${quantity} alberi`:'Quantità non specificata';
      const eventDetail=located
        ?`${type} · ${statusLabel}${validation}`
        :`${type} · ${statusLabel}${validation} · posizione non disponibile`;
      return`<div class="tree-event-row" data-tree-event-index="${index}" data-tree-event-id="${safe(event.id)}"><button class="tree-event-focus" type="button" data-tree-focus="${safe(event.id)}" ${located?'':`disabled title="Coordinate non ancora disponibili"`}><span class="tree-list-symbol"><i class="tree-list-icon ${event.eventType==='planting'?'is-planted':event.eventType==='decrement'?'is-cut':'is-unknown'} ${event.status==='planned'?'is-planned':''}">${TreeStats.iconSvg(event)}</i><b class="tree-list-quantity" title="${safe(quantityTitle)}">${safe(quantity)}</b></span><span><strong>${safe(event.locationName)}</strong><small>${safe(dateLabel)}${event.district?` · ${safe(event.district)}`:''}<br>${safe(eventDetail)}${pathDetail}</small></span></button><span class="tree-event-links"><a href="${safeUrl(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte ufficiale</a>${reportButton}</span></div>`
    }).join('')}</div>${documentedEvents.length>TREE_EVENTS_PER_PAGE?`<nav class="tree-pagination" data-tree-pagination aria-label="Pagine degli eventi"><button type="button" data-tree-page="prev">Precedente</button><span data-tree-page-status></span><button type="button" data-tree-page="next">Successiva</button></nav>`:''}`
    :'';

  const syncDate=[diagnostic.lastSync?.completed_at||diagnostic.lastSync?.completedAt,diagnostic.calendarSync?.completed_at].filter(Boolean).sort().at(-1)||null;
  const dynamicNote=diagnostic.dynamicAvailable
    ?`<div class="tree-period-note tree-sync-note">${syncDate?`Aggiornato al ${safe(new Date(syncDate).toLocaleString('it-IT'))}. `:''}${diagnostic.dynamicEvents||0} nuovi eventi aggiunti.</div>`
    :'';

  const aggregateNote=includeAggregate&&aggregate
    ?balanceRow(aggregate)
    :'';
  const missingEventsNote=documentedEvents.length?'':`<div class="tree-period-note ui-card"><strong>${safe(city.name)} · ${safe(TREE_PERIOD_LABELS.get(String(year))||year)}</strong><br>${events.length||aggregate
    ?'Sono disponibili solo bilanci aggregati, senza indirizzi o coordinate dei singoli interventi. I totali non possono essere rappresentati come eventi nella lista o come icone sulla mappa.'
    :'Nella raccolta attuale non sono disponibili né eventi puntuali né un bilancio per questa selezione. L’assenza di dati non significa che non siano avvenute piantumazioni o abbattimenti.'}${diagnostic.dynamicAvailable===false?' L’aggiornamento delle fonti non è al momento disponibile: potrebbero mancare ulteriori eventi.':''}</div>`;
  return dynamicNote+rows+documentedList+aggregateNote+missingEventsNote
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
  state.treeEvents=new Map([...(resultA.documentedEvents||[]),...(resultB?.documentedEvents||[])].map(event=>[String(event.id),event]));
  if(token!==state.renderToken)return;
  const availableYears=[...new Set([...(state.treeAvailableYears.get(cityId)||[]),...(resultA.diagnostic?.availableYears||[]),...(resultB?.diagnostic?.availableYears||[])])]
    .filter(year=>/^20\d{2}$/.test(year)&&Number(year)<=new Date().getFullYear()).sort((a,b)=>Number(b)-Number(a));
  if(JSON.stringify(availableYears)!==JSON.stringify(state.treeAvailableYears.get(cityId)||[])){
    state.treeAvailableYears.set(cityId,availableYears);fillYears()
  }
  const boundary=(resultA.record||resultB?.record)?await fetchTreeBoundary(cityId):null;
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
    $('stations').innerHTML=`<div class="tree-period-note ui-card"><strong>Confronto ${yearA} ↔ ${yearB}</strong><br>${comparable?'Le due selezioni usano dati della stessa natura.':'I dati hanno copertura diversa: il confronto visivo resta disponibile, ma la differenza numerica non è calcolata.'}</div>${treeListHtml(resultA,yearA,false)}${treeListHtml(resultB,yearB,false)}`;
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
      $('stations').innerHTML=`<div class="tree-balance-row ui-card"><div class="tree-balance-head"><strong>${partial?'Variazione del saldo minimo documentato':'Variazione del saldo'} · ${yearA} → ${yearB}</strong><b>${diff.difference>0?'+':''}${TreeStats.fmt(diff.difference)}</b></div><small>${partial?'Confronto fra raccolte parziali di eventi pubblici; non rappresenta la variazione completa del patrimonio. ':''}Saldo ${yearA}: ${diff.balanceA>0?'+':''}${TreeStats.fmt(diff.balanceA)} · saldo ${yearB}: ${diff.balanceB>0?'+':''}${TreeStats.fmt(diff.balanceB)}.</small></div>`;
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
    source()==='openaq'||!['map','temperature','trees'].includes(state.mode)
  );
  $('singleMapWrap').classList.toggle('hidden',state.mode==='compare');
  $('compareMapWrap').classList.toggle('hidden',state.mode!=='compare');
  $('standardLegend').classList.toggle('hidden',state.mode==='difference'||isTrees());
  $('differenceLegend').classList.toggle('hidden',state.mode!=='difference'||isTrees());
  $('mapBadge').classList.toggle('hidden',state.mode==='compare');

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
      $('avgLabel').textContent='Differenza media stazioni';
      const a=avg(rows);
      $('avgValue').textContent=`${a>0?'+':''}${fmt(a)}`;
      $('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
    }else if(state.mode==='compare'){
      const pair=await updateCompareMaps(token);
      if(token!==state.renderToken)return;

      rows=mergeComparisonRows(pair.a,pair.b);
      renderComparisonList(rows);
      $('avgLabel').textContent=`Media stazioni ${$('compareYearB').value}`;
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

      $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · ${$('yearSelect').value}`;
      $('avgLabel').textContent='Media stazioni';
      $('avgValue').textContent=rows.length?fmt(avg(rows)):'—';
      $('periodValue').textContent=$('yearSelect').value;
    }

    if($('avgUnit'))$('avgUnit').textContent='µg/m³';
    $('stationCount').textContent=rows.length;
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
    cooperativeGestures:globalThis.matchMedia?.('(pointer: coarse)').matches??false,
    locale:{'CooperativeGesturesHandler.MobileHelpText':'Usa due dita per spostare la mappa'},
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

function runsAsInstalledApp(){
  return window.matchMedia('(display-mode: standalone)').matches
    ||window.matchMedia('(display-mode: fullscreen)').matches
    ||navigator.standalone===true
}

function updateInstallButtonVisibility(forceInstalled=false){
  const button=$('installBtn');
  if(!button)return;
  button.hidden=forceInstalled||runsAsInstalledApp()
}

async function installApp(){
  if(runsAsInstalledApp()){
    updateInstallButtonVisibility();
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

async function treeApiBase(){
  if(!state.treeProxyPromise)state.treeProxyPromise=fetch('data/trees-proxy.json?v=0.5.14',{cache:'no-store'})
    .then(response=>response.ok?response.json():null)
    .then(config=>String(config?.base_url||'').replace(/\/+$/,''));
  return state.treeProxyPromise
}

function treeLocationCoordinates(event,index){
  const point=event?.locationPoints?.[index]?.coordinates;
  if(Array.isArray(point)&&point.length===2)return point;
  const marker=event?.markerCoordinates?.[index];
  if(Array.isArray(marker)&&marker.length===2)return marker;
  return Array.isArray(event?.coordinates)?event.coordinates:(TREE_CITY_CONFIG[eeaCity()]?.center||ROME.center)
}

function positionTreeReportMarker(event,index){
  const coordinates=treeLocationCoordinates(event,index);
  state.treeReportInitialCoordinates=[...coordinates];
  state.treeReportMap?.flyTo({center:coordinates,zoom:17,duration:500})
}

function toggleTreeReportMapStyle(){
  if(!state.treeReportMap)return;
  const next=state.treeReportMapStyle==='satellite'?'map':'satellite';
  state.treeReportMap.setStyle(next==='map'?MAP_STYLE:TREE_REPORT_SATELLITE_STYLE);
  state.treeReportMapStyle=next;
  const button=$('treeReportMapToggle');
  button.textContent=next==='map'?'Satellite':'Mappa stradale';
  button.setAttribute('aria-label',next==='map'?'Passa alla vista satellitare':'Passa alla mappa stradale');
}

function openTreeLocationReport(eventId,requestedIndex=0){
  const event=state.treeEvents.get(String(eventId));
  if(!event){showToast('Evento non disponibile nella vista corrente.');return}
  state.treeReportEvent=event;
  const dialog=$('treeReportDialog');
  const select=$('treeReportLocation');
  const locations=event.locations?.length?event.locations:[event.locationName];
  select.innerHTML=locations.map((location,index)=>`<option value="${index}">${String(location).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</option>`).join('');
  select.value=String(Math.min(Math.max(Number(requestedIndex)||0,0),locations.length-1));
  $('treeReportReason').value='';$('treeReporterName').value='';$('treeReporterEmail').value='';$('treeReportStatus').textContent='';
  $('treeAddressSearch').value='';$('treeAddressResults').innerHTML='';
  $('treeReportForm').querySelector('[type=submit]').disabled=false;
  dialog.showModal();
  requestAnimationFrame(()=>{
    const coordinates=treeLocationCoordinates(event,Number(select.value));
    if(!state.treeReportMap){
      state.treeReportInitialCoordinates=[...coordinates];
      state.treeReportMap=new maplibregl.Map({container:'treeReportMap',cooperativeGestures:globalThis.matchMedia?.('(pointer: coarse)').matches??false,locale:{'CooperativeGesturesHandler.MobileHelpText':'Usa due dita per spostare la mappa'},style:TREE_REPORT_SATELLITE_STYLE,center:coordinates,zoom:17,attributionControl:true});
      state.treeReportMap.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    }else{
      state.treeReportMap.resize();positionTreeReportMarker(event,Number(select.value))
    }
  })
}

async function submitTreeLocationReport(submitEvent){
  submitEvent.preventDefault();
  const event=state.treeReportEvent,index=Number($('treeReportLocation').value);
  if(!event||!state.treeReportMap)return;
  const button=submitEvent.target.querySelector('[type=submit]');
  if(button.disabled)return;
  button.disabled=true;
  const status=$('treeReportStatus');status.textContent='Invio in corso…';
  const point=state.treeReportMap.getCenter();
  try{
    const base=await treeApiBase();if(!base)throw new Error('Proxy Alberi non configurato');
    let sourceKey=event.sourceKey;
    try{sourceKey=sourceKey||new URL(event.sourceUrl).searchParams.get('contentId')}catch{}
    const response=await fetch(`${base}/v1/trees/location-reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      sourceKey:sourceKey||event.id.replace(/^dynamic-/,''),eventId:event.id,locationIndex:index,
      locationName:event.locations?.[index]||event.locationName,reason:$('treeReportReason').value,
      reporterName:$('treeReporterName').value,reporterEmail:$('treeReporterEmail').value,
      suggestedCoordinates:[point.lng,point.lat]
    })});
    const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
    status.textContent='';
    $('treeReportDialog').close();
    showToast(`Segnalazione n. ${result.reportId} inviata. Sarà verificata da un amministratore.`)
  }catch(error){status.textContent=String(error.message||error);button.disabled=false}
}

function openTreeEventReport(eventId){
  const event=state.treeEvents.get(String(eventId));
  if(!event){showToast('Evento non disponibile nella vista corrente.');return}
  state.treeEventReportEvent=event;
  $('treeEventReportSummary').textContent=`${event.locationName} · ${event.date||event.year}`;
  $('treeEventReportReason').value='';$('treeEventReporterName').value='';$('treeEventReporterEmail').value='';$('treeEventReportStatus').textContent='';
  $('treeEventReportForm').querySelector('[type=submit]').disabled=false;
  $('treeEventReportDialog').showModal()
}

async function submitTreeEventReport(submitEvent){
  submitEvent.preventDefault();
  const event=state.treeEventReportEvent;
  if(!event)return;
  const button=submitEvent.target.querySelector('[type=submit]');
  if(button.disabled)return;
  button.disabled=true;
  const status=$('treeEventReportStatus');status.textContent='Invio in corso…';
  try{
    const base=await treeApiBase();if(!base)throw new Error('Proxy Alberi non configurato');
    const response=await fetch(`${base}/v1/trees/event-reports`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      sourceKey:treeEventSourceKey(event),eventId:event.id,reason:$('treeEventReportReason').value,
      reporterName:$('treeEventReporterName').value,reporterEmail:$('treeEventReporterEmail').value
    })});
    const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
    status.textContent='';
    $('treeEventReportDialog').close();
    showToast(`Segnalazione n. ${result.reportId} inviata. Sarà verificata da un amministratore.`)
  }catch(error){status.textContent=String(error.message||error);button.disabled=false}
}

async function searchTreeReportAddress(){
  const query=$('treeAddressSearch').value.trim(),results=$('treeAddressResults');
  if(query.length<3){results.textContent='Inserisci almeno tre caratteri.';return}
  results.textContent='Ricerca in corso…';
  try{
    const base=await treeApiBase();
    const cityId=eeaCity();
    const response=await fetch(`${base}/v1/trees/geocode?q=${encodeURIComponent(query)}&city=${encodeURIComponent(cityId)}`,{cache:'no-store'});
    const data=await response.json();if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
    results.innerHTML=(data.results||[]).length
      ?data.results.map(item=>`<button type="button" data-tree-address-lon="${Number(item.coordinates[0])}" data-tree-address-lat="${Number(item.coordinates[1])}">${String(item.label).replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))}</button>`).join('')
      :`Nessun indirizzo trovato nell’area di ${TREE_CITY_CONFIG[cityId]?.name||'competenza'}.`
  }catch(error){results.textContent=error.message||error}
}

function resetTreeReportMap(){
  if(!state.treeReportMap||!state.treeReportInitialCoordinates)return;
  state.treeReportMap.flyTo({center:state.treeReportInitialCoordinates,zoom:17,duration:600});
  $('treeAddressSearch').value='';$('treeAddressResults').innerHTML=''
}

function renderTreeAdminReports(reports,targetId='treeAdminReports'){
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const option=(value,label,current)=>`<option value="${value}" ${value===current?'selected':''}>${label}</option>`;
  $(targetId).innerHTML=reports.length?reports.map(report=>{
    const reporter=report.direct?'':`Segnalata il ${safe(new Date(report.created_at).toLocaleString('it-IT'))}${report.reporter_name?` · ${safe(report.reporter_name)}`:' · anonima'}${report.reporter_email?` · ${safe(report.reporter_email)}`:''}`;
    const isLocation=Number(report.location_index)>=0;
    let locations=[];try{locations=JSON.parse(report.locations_json||'[]')}catch{};
    if(!locations.length)locations=[report.location_name];
    const position=isLocation?`<details><summary>Correggi la singola posizione segnalata</summary><div class="tree-form-grid"><label>Longitudine<input data-admin-lon type="number" step="any" value="${Number(report.suggested_longitude)}"></label><label>Latitudine<input data-admin-lat type="number" step="any" value="${Number(report.suggested_latitude)}"></label></div><label>Nome località<input data-admin-location value="${safe(report.location_name)}"></label><label>Geometria GeoJSON <small>(facoltativa)</small><textarea data-admin-geometry placeholder='{"type":"LineString","coordinates":[...]}'></textarea></label><button type="button" data-admin-action="approve">Approva solo questa posizione</button></details>`:'';
    return`<article class="tree-admin-report tree-admin-event-report" data-report-id="${report.id}" data-report-type="${isLocation?'location':'event'}" data-admin-search="${safe([report.event_title,report.locations_json,report.location_name,report.event_district,report.source_url,report.raw_excerpt,report.event_date,report.event_quantity,report.event_type==='planting'?'piantumazione verde':report.event_type==='decrement'?'abbattimento rosso':'da verificare'].filter(value=>value!==null&&value!==undefined).join(' '))}" data-admin-direct="${report.direct?'true':'false'}" data-source-key="${safe(report.source_key)}" data-updated-at="${safe(report.updated_at)}">${report.direct?`<details><summary>${safe(report.event_title||report.location_name)} · ${report.event_type==='planting'?'Piantumazione':report.event_type==='decrement'?'Abbattimento':'Da verificare'} · ${safe(report.event_quantity??'quantità sconosciuta')}</summary>`:''}
      <h3>${report.direct?'Evento':`Segnalazione ${isLocation?'posizione':'evento'}`} · ${safe(report.event_title||report.location_name)}</h3><p>${safe(report.reason)}</p><p>${reporter}</p><p>I dati dell’intervento corretti qui saranno pubblicati nell’app. La quantità e il tipo determinano numero e colore degli alberi pubblicati.</p>
      <label>Titolo<input data-admin-event-title maxlength="300" value="${safe(report.event_title)}"></label>
      <div class="tree-form-grid"><label>Comune<select data-admin-event-city>${option('roma','Roma',report.event_city)}${option('guidonia-montecelio','Guidonia Montecelio',report.event_city)}</select></label><label>Anno<input data-admin-event-year type="number" min="2013" max="${new Date().getFullYear()}" value="${Number(report.event_year)||''}"></label></div>
      <label>Data lavori <small>(vuoto se non indicata)</small><input data-admin-event-date value="${safe(report.event_date)}" placeholder="AAAA-MM-GG"></label>
      <label>Fine lavori <small>(vuoto se non indicata)</small><input data-admin-event-end value="${safe(report.event_end_date)}" placeholder="AAAA-MM-GG"></label>
      <label>Municipio / zona<input data-admin-event-district maxlength="180" value="${safe(report.event_district)}"></label>
      <label>Località <small>(una per riga; aggiungi, correggi o rimuovi le righe)</small><textarea data-admin-event-locations>${safe(locations.join('\n'))}</textarea></label>
      <div class="tree-form-grid"><label>Tipo<select data-admin-event-type>${option('planting','Piantumazione · verde',report.event_type)}${option('decrement','Abbattimento · rosso',report.event_type)}${option('unknown','Da verificare',report.event_type)}</select></label><label>Stato<select data-admin-event-status>${option('planned','Programmato',report.event_status)}${option('reported','Comunicazione ufficiale',report.event_status)}${option('completed','Eseguito',report.event_status)}${option('emergency_completed','Urgente eseguito',report.event_status)}${option('unknown','Da verificare',report.event_status)}</select></label></div>
      <label>Quantità complessiva <small>(vuoto se sconosciuta, non ripartita fra le località)</small><input data-admin-event-quantity type="number" min="0" step="1" value="${report.event_quantity??''}"></label>
      <label>URL della fonte<input data-admin-event-source type="url" value="${safe(report.source_url)}" ${report.parent_source_key?'readonly title="Fonte condivisa con gli altri interventi della divisione"':''}></label>
      <label>Data pubblicazione<input data-admin-event-published type="date" ${report.parent_source_key?'readonly':''} value="${safe(report.source_published_at)}"></label>
      <label>Descrizione / dettagli estratti<textarea data-admin-event-description maxlength="5000">${safe(report.raw_excerpt)}</textarea></label>
      ${position}${report.source_key&&(report.direct||report.updated_at)?`<details class="tree-admin-split"><summary>Dividi in più interventi</summary><p>Ogni intervento avrà quantità, tipo e indirizzi propri. La fonte originale e la sua data di pubblicazione resteranno comuni. L’evento originale sarà escluso dai totali. Inserisci le quantità documentate: non vengono ripartite automaticamente.</p><button type="button" data-admin-split-prepare>Prepara interventi dagli indirizzi</button><div data-admin-split-parts></div><button type="button" data-admin-split-add>Aggiungi intervento</button><button type="button" data-admin-action="split_event">Salva divisione</button></details>`:''}<div class="tree-admin-actions">${report.direct?'':'<button type="button" data-admin-action="reject">Rifiuta segnalazione</button>'}<button class="is-danger" type="button" data-admin-action="delete_event">Rimuovi e ignora evento</button><button type="button" data-admin-action="update_event">Salva dati evento</button></div><p data-admin-feedback class="tree-form-status" role="status" aria-live="polite"></p>${report.direct?'</details>':''}</article>`
  }).join(''):targetId==='treeAdminEvents'?'<p>Nessun evento per Comune e anno selezionati.</p>':'<p>Nessuna segnalazione in attesa.</p>'
}

async function loadTreeAdminReports(password){
  const status=$('treeAdminStatus');status.textContent='Caricamento…';
  const base=await treeApiBase();
  const response=await fetch(`${base}/v1/trees/location-reports?status=pending`,{headers:{Authorization:`Bearer ${password}`}});
  const result=await response.json();if(!response.ok)throw new Error(result.error||`HTTP ${response.status}`);
  if(result.adminSchemaVersion!==2)throw new Error('Aggiorna il Worker ambientale alla versione 0.9.14 per modificare tutti i dati degli eventi.');
  $('treeAdminEvents').innerHTML='';
  $('treeAdminSearchField')?.classList?.add('hidden');
  renderTreeAdminReports(result.reports||[]);status.textContent=`${result.reports?.length||0} segnalazioni in attesa.`
}

async function reviewTreeAdminReport(article,action){
  const feedback=message=>{
    $('treeAdminStatus').textContent=message;
    const inline=article.querySelector('[data-admin-feedback]');
    if(inline)inline.textContent=message;
  };
  const actionLabels={split_event:'dividere l’evento',approve:'approvare la posizione',reject:'rifiutare la segnalazione',update_event:'salvare le modifiche',delete_event:'eliminare l’evento'};
  const password=window.prompt(`Inserisci la password amministratore per ${actionLabels[action]||'revisionare la segnalazione'}:`);
  if(!password)return;
  const isEvent=article.dataset.reportType==='event';
  let body={reportId:Number(article.dataset.reportId),action};
  if(action==='delete_event'&&!window.confirm('Rimuovere l’evento e tutte le sue posizioni? Sarà ignorato nei successivi aggiornamenti automatici. Gli altri eventi della stessa fonte restano separati.'))return;
  if(action==='update_event'||action==='split_event'){
    body={...body,title:article.querySelector('[data-admin-event-title]').value,eventDate:article.querySelector('[data-admin-event-date]').value,eventEndDate:article.querySelector('[data-admin-event-end]')?.value||'',locations:article.querySelector('[data-admin-event-locations]').value.split(/\n+/).map(value=>value.trim()).filter(Boolean),eventType:article.querySelector('[data-admin-event-type]').value,eventStatus:article.querySelector('[data-admin-event-status]').value,quantity:article.querySelector('[data-admin-event-quantity]').value,
      city:article.querySelector('[data-admin-event-city]').value,year:Number(article.querySelector('[data-admin-event-year]').value),district:article.querySelector('[data-admin-event-district]').value,sourceUrl:article.querySelector('[data-admin-event-source]').value,sourcePublishedAt:article.querySelector('[data-admin-event-published]').value,description:article.querySelector('[data-admin-event-description]').value}
  }else if(!isEvent&&action==='approve'){
    const geometryText=article.querySelector('[data-admin-geometry]').value.trim();
    let geometry=null;try{geometry=geometryText?JSON.parse(geometryText):null}catch{$('treeAdminStatus').textContent='Il GeoJSON inserito non è valido.';return}
    body={...body,longitude:Number(article.querySelector('[data-admin-lon]').value),latitude:Number(article.querySelector('[data-admin-lat]').value),locationName:article.querySelector('[data-admin-location]').value,geometry}
  }
  const direct=article.dataset.adminDirect==='true'||action==='split_event';
  if(direct){
    body.sourceKey=article.dataset.sourceKey;
    body.expectedUpdatedAt=article.dataset.updatedAt||null;
    body.original=state.treeAdminOriginals?.get(body.sourceKey);
    if(action==='split_event'){
      body.parts=[...article.querySelectorAll('[data-admin-split-part]')].map(part=>({city:body.city,year:body.year,district:body.district,description:body.description,title:part.querySelector('[data-split-title]').value,locations:part.querySelector('[data-split-locations]').value.split(/\n+/).map(value=>value.trim()).filter(Boolean),eventType:part.querySelector('[data-split-type]').value,eventStatus:part.querySelector('[data-split-status]').value,quantity:part.querySelector('[data-split-quantity]').value,eventDate:part.querySelector('[data-split-date]').value,eventEndDate:part.querySelector('[data-split-end]')?.value??body.eventEndDate}));
      if(body.parts.length<2){feedback('Prepara almeno due interventi prima di salvare.');return}
      const emptyPart=body.parts.findIndex(part=>!part.locations.length);
      if(emptyPart>=0){
        feedback(`Intervento ${emptyPart+1}: inserisci almeno un indirizzo.`);
        article.querySelectorAll('[data-admin-split-part]')[emptyPart].querySelector('[data-split-locations]').focus?.();
        return;
      }
      if(!window.confirm(`Sostituire l’evento con ${body.parts.length} interventi distinti, mantenendo la fonte originale?`))return;
    }
  }
  const base=await treeApiBase();
  const buttons=Array.from(article.querySelectorAll?.('button')||[]);buttons.forEach(button=>button.disabled=true);
  feedback(action==='update_event'?'Salvataggio e ricerca della posizione…':'Salvataggio…');
  let response,result;
  try{
  response=await fetch(`${base}${direct?'/v1/trees/admin/events':'/v1/trees/location-reports/review'}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${password}`},body:JSON.stringify(body)});
  result=await response.json();if(!response.ok){feedback(result.error||`HTTP ${response.status}`);return}
  }catch(error){feedback(error.message||'Errore di rete durante il salvataggio');throw error}
  finally{buttons.forEach(button=>button.disabled=false)}
  article.remove();
  if(direct)globalThis.filterTreeAdminEvents?.();
  if(result.notificationEmail){$('treeAdminStatus').innerHTML=`Revisione salvata. <a href="mailto:${encodeURIComponent(result.notificationEmail)}?subject=${encodeURIComponent('A.R.I.A. – esito segnalazione posizione')}">Invia conferma al segnalante</a>.`}
  else $('treeAdminStatus').textContent=action==='split_event'?`Evento diviso in ${result.children?.length||0} interventi. Ricarica gli eventi per modificarli.`:action==='delete_event'?'Evento rimosso: sarà ignorato negli aggiornamenti.':'Revisione salvata.'
  if(result.geocoding?.pending)$('treeAdminStatus').append(' Ricerca posizioni da completare con i prossimi aggiornamenti.');
  if(result.geocoding?.attempted&&result.geocoding.geocoded===0)$('treeAdminStatus').append(' Posizione non trovata: nessun puntatore aggiunto.');
  if(isTrees()&&action!=='reject')await render();
}

function filterTreeAdminEvents(){
  const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it-IT');
  const terms=normalize($('treeAdminSearch')?.value).trim().split(/\s+/).filter(Boolean);
  const articles=[...$('treeAdminEvents').querySelectorAll('[data-admin-direct="true"]')];
  let visible=0;
  for(const article of articles){
    const text=normalize(article.dataset.adminSearch);
    const matches=terms.every(term=>text.includes(term));
    // Hide existing editors instead of rebuilding them: unsaved changes survive filtering.
    article.classList.toggle('hidden',!matches);
    if(matches)visible++;
  }
  $('treeAdminSearchCount').textContent=visible
    ?`${visible} di ${articles.length} eventi`
    :terms.length?'Nessun evento corrisponde alla ricerca.':`0 di ${articles.length} eventi`;
}

function treeAdminEventBody(report){
  let locations=[];try{locations=JSON.parse(report.locations_json||'[]')}catch{}
  return{title:report.event_title||report.location_name,city:report.event_city,year:Number(report.event_year),eventDate:report.event_date||'',eventEndDate:report.event_end_date||'',district:report.event_district||'',locations:locations.length?locations:[report.location_name],eventType:report.event_type,eventStatus:report.event_status,quantity:report.event_quantity??null,sourceUrl:report.source_url,sourcePublishedAt:report.source_published_at||null,description:report.raw_excerpt||''}
}

async function loadTreeAdminEvents(password){
  const city=$('treeAdminCity').value,year=$('treeAdminYear').value;
  const status=$('treeAdminStatus');status.textContent='Caricamento eventi…';
  const base=await treeApiBase();
  const response=await fetch(`${base}/v1/trees/admin/events?city=${encodeURIComponent(city)}&year=${encodeURIComponent(year)}`,{cache:'no-store',headers:{Authorization:`Bearer ${password}`}});
  const data=await response.json();
  if(!response.ok)throw new Error(response.status===404?'Aggiorna il Worker ambientale alla versione 0.10.0 e applica la migrazione 0012.':data.error||`HTTP ${response.status}`);
  if(data.adminSchemaVersion!==3)throw new Error('Aggiorna il Worker ambientale alla versione 0.10.0 e applica la migrazione 0012.');
  const local=await TreeStats.rows(city,year);
  if(local.diagnostic?.dynamicAvailable===false)throw new Error('Archivio aggiornato non disponibile: ricarica prima di modificare gli eventi.');
  $('treeAdminReports').innerHTML='';
  const reports=(data.events||[]).map(report=>({...report,direct:true,location_index:-1}));
  const keys=new Set(reports.map(report=>report.source_key));
  for(const event of local.documentedEvents||[]){
    const key=event.sourceKey||String(event.id).replace(/^dynamic-/,'');
    if(keys.has(key)||String(event.id).startsWith('dynamic-'))continue;
    reports.push({id:`local-${key}`,direct:true,source_key:key,location_index:-1,event_title:event.title||event.locationName,event_city:city,event_year:Number(year),event_end_date:event.eventEndDate||'',event_date:event.eventDate||(/^\d{4}-\d{2}-\d{2}$/.test(event.date||'')?event.date:''),event_district:event.district,locations_json:JSON.stringify(event.locations?.length?event.locations:[event.locationName]),location_name:event.locationName,event_type:event.eventType,event_status:event.status,event_quantity:event.quantity,source_url:event.sourceUrl,source_published_at:event.sourcePublishedAt,raw_excerpt:event.description||event.notes||''});
    keys.add(key);
  }
  state.treeAdminOriginals=new Map(reports.map(report=>[report.source_key,treeAdminEventBody(report)]));
  renderTreeAdminReports(reports,'treeAdminEvents');
  $('treeAdminSearchField')?.classList?.remove('hidden');
  globalThis.filterTreeAdminEvents?.();
  status.textContent=`${reports.length} eventi. Apri un evento per modificarlo, dividerlo o rimuoverlo.`;
}

function addTreeAdminSplitPart(article,locations=[]){
  const container=article.querySelector('[data-admin-split-parts]');
  if(container.children.length>=20){$('treeAdminStatus').textContent='Massimo 20 interventi per divisione.';return}
  const safe=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const value=name=>article.querySelector(`[data-admin-event-${name}]`).value;
  const part=document.createElement('fieldset');part.dataset.adminSplitPart='true';
  part.innerHTML=`<legend>Intervento</legend><label>Titolo<input data-split-title maxlength="300" value="${safe(value('title'))}"></label><label>Indirizzi <small>(uno per riga)</small><textarea data-split-locations>${safe(locations.join('\n'))}</textarea></label><div class="tree-form-grid"><label>Tipo<select data-split-type><option value="planting">Piantumazione · verde</option><option value="decrement">Abbattimento · rosso</option><option value="unknown">Da verificare</option></select></label><label>Numero alberi <small>(vuoto se sconosciuto)</small><input data-split-quantity type="number" min="0" step="1" value=""></label></div><label>Stato<select data-split-status>${article.querySelector('[data-admin-event-status]').innerHTML}</select></label><label>Data lavori <small>(vuoto se non indicata)</small><input data-split-date type="date" value="${safe(value('date'))}"></label><label>Fine lavori<input data-split-end type="date" value="${safe(value('end'))}"></label><button type="button" data-admin-split-remove>Rimuovi questo intervento dalla divisione</button>`;
  part.querySelector('[data-split-type]').value=value('type');
  part.querySelector('[data-split-status]').value=value('status');
  container.append(part);
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

  state.activeSource=source();
  $('sourceSelect').addEventListener('change',changeSource);

  $('eeaScopeSelect').addEventListener('change',()=>{
    if(source()!=='eea')return;
    resetEeaViewport();
    configureSourceUI();
    focusSelectedEeaScope();
    render()
  });

  $('eeaCitySelect')?.addEventListener('change',()=>{
    if(isTrees()){
      fillYears();
      const treeCity=TREE_CITY_CONFIG[eeaCity()];
      if(treeCity){
        withMapRefreshSuppressed(()=>state.map?.flyTo({center:treeCity.center,zoom:treeCity.zoom,duration:700}))
      }
      render();
      return
    }
    if(source()==='openaq'){
      globalThis.OpenAQCitySelection?.();
      return
    }
    if(source()!=='eea'||eeaScope()!=='italy')return;
    resetEeaViewport();
    focusSelectedEeaScope();
    render()
  });


  ['pollutantSelect','yearSelect','compareYearA','compareYearB']
    .forEach(id=>$(id)?.addEventListener('change',render));

  window.addEventListener('beforeinstallprompt',e=>{
    e.preventDefault();
    state.deferredPrompt=e;
    updateInstallButtonVisibility()
  });

  window.addEventListener('appinstalled',()=>{
    state.deferredPrompt=null;
    updateInstallButtonVisibility(true)
  });

  const displayMode=window.matchMedia('(display-mode: standalone)');
  if(typeof displayMode.addEventListener==='function'){
    displayMode.addEventListener('change',()=>updateInstallButtonVisibility())
  }else if(typeof displayMode.addListener==='function'){
    displayMode.addListener(()=>updateInstallButtonVisibility())
  }

  $('installBtn').addEventListener('click',installApp);
  document.addEventListener('click',event=>{
    const reportButton=event.target.closest('[data-tree-report]');
    if(reportButton){event.preventDefault();openTreeLocationReport(reportButton.dataset.treeReport,reportButton.dataset.treeLocationIndex)}
    const eventReportButton=event.target.closest('[data-tree-event-report]');
    if(eventReportButton){event.preventDefault();openTreeEventReport(eventReportButton.dataset.treeEventReport)}
    const closeButton=event.target.closest('[data-dialog-close]');
    if(closeButton)$(closeButton.dataset.dialogClose)?.close();
    const splitPrepare=event.target.closest('[data-admin-split-prepare]');
    if(splitPrepare){
      const article=splitPrepare.closest('[data-report-id]'),parts=article.querySelector('[data-admin-split-parts]');
      if(!parts.children.length){
        const locations=article.querySelector('[data-admin-event-locations]').value.split(/\n+/).map(value=>value.trim()).filter(Boolean);
        const count=Math.max(2,Math.min(20,locations.length));
        for(let i=0;i<count;i++)addTreeAdminSplitPart(article,i===count-1?locations.slice(i):locations[i]?[locations[i]]:[]);
      }
    }
    const splitAdd=event.target.closest('[data-admin-split-add]');
    if(splitAdd)addTreeAdminSplitPart(splitAdd.closest('[data-report-id]'));
    const splitRemove=event.target.closest('[data-admin-split-remove]');
    if(splitRemove)splitRemove.closest('[data-admin-split-part]').remove();
    const adminAction=event.target.closest('[data-admin-action]');
    if(adminAction)reviewTreeAdminReport(adminAction.closest('[data-report-id]'),adminAction.dataset.adminAction).catch(error=>$('treeAdminStatus').textContent=error.message||error)
    const addressResult=event.target.closest('[data-tree-address-lon]');
    if(addressResult){state.treeReportMap?.flyTo({center:[Number(addressResult.dataset.treeAddressLon),Number(addressResult.dataset.treeAddressLat)],zoom:18,duration:650});$('treeAddressResults').innerHTML=''}
  });
  $('treeReportLocation')?.addEventListener('change',event=>positionTreeReportMarker(state.treeReportEvent,Number(event.target.value)));
  $('treeReportForm')?.addEventListener('submit',submitTreeLocationReport);
  $('treeEventReportForm')?.addEventListener('submit',submitTreeEventReport);
  $('treeAddressSearchBtn')?.addEventListener('click',searchTreeReportAddress);
  $('treeReportReset')?.addEventListener('click',resetTreeReportMap);
  $('treeReportMapToggle')?.addEventListener('click',toggleTreeReportMapStyle);
  $('treeAddressSearch')?.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();searchTreeReportAddress()}});
  $('treeAdminSearch')?.addEventListener('input',filterTreeAdminEvents);
  $('treeAdminLogin')?.addEventListener('submit',event=>{
    event.preventDefault();
    const password=$('treeAdminPassword').value;$('treeAdminPassword').value='';
    const action=event.submitter?.value||'events';
    (action==='reports'?loadTreeAdminReports(password):loadTreeAdminEvents(password)).catch(error=>$('treeAdminStatus').textContent=error.message||error)
  });
  let versionClicks=0,lastVersionClick=0;
  const openAdmin=()=>{
    const now=Date.now();versionClicks=now-lastVersionClick<1800?versionClicks+1:1;lastVersionClick=now;
    if(versionClicks===5){versionClicks=0;$('treeAdminReports').innerHTML='';$('treeAdminEvents').innerHTML='';$('treeAdminSearch').value='';$('treeAdminSearchCount').textContent='';$('treeAdminSearchField').classList.add('hidden');$('treeAdminCity').value=TREE_CITY_CONFIG[eeaCity()]?eeaCity():'roma';$('treeAdminYear').value=/^20\d{2}$/.test($('yearSelect').value)?$('yearSelect').value:String(new Date().getFullYear());$('treeAdminStatus').textContent='';$('treeAdminDialog').showModal();$('treeAdminPassword').focus()}
  };
  $('appVersion')?.addEventListener('click',openAdmin);
  $('appVersion')?.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();openAdmin()}});
  bindSwipe()
}

async function loadVersion(){
  const [appVersion,dataVersion]=await Promise.all([
    fetch('version.json?v=1.1.9',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.7.6',{cache:'no-store'}).then(r=>r.json())
  ]);
  $('appVersion').textContent=appVersion.version;
  $('dataVersion').textContent=dataVersion.version
}

async function boot(){
  // All deferred source modules must install their handlers before initial setup.
  if(document.readyState!=='complete')await new Promise(resolve=>document.addEventListener('DOMContentLoaded',resolve,{once:true}));
  updateInstallButtonVisibility();
  await loadEeaCities();
  fillYears();
  configureSourceUI();
  bind();
  await loadVersion();
  initMaps();
  if(['weather','nearby'].includes(source()))render();

  if('serviceWorker'in navigator){
    navigator.serviceWorker.register('./service-worker.js?v=1.1.9')
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
