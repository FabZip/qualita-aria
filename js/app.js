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
const MAP_STYLE='https://tiles.openfreemap.org/styles/positron';
const ROME={center:[12.4964,41.9028],zoom:10.2,bbox:[12.15,41.65,12.85,42.15]};
const ITALY={center:[12.5,42.3],zoom:5.2,bbox:[6.3,35.4,19.0,47.6]};
const EUROPE={center:[10.0,50.0],zoom:3.15,bbox:[-25.0,27.0,45.0,72.0]};

const EEA_SCOPES={
  rome:{label:'Roma',bbox:ROME.bbox,center:ROME.center,zoom:ROME.zoom,country:'IT'},
  italy:{label:'Italia',bbox:ITALY.bbox,center:ITALY.center,zoom:ITALY.zoom,country:'IT'},
  europe:{label:'Europa',bbox:EUROPE.bbox,center:EUROPE.center,zoom:EUROPE.zoom,country:null}
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
 * Geographic scope for the Comune di Roma.
 * The file contains municipality boundaries in WGS84 derived from ISTAT limits.
 * We download the Rome-province collection once and retain only ISTAT 058091.
 */
const ROME_BOUNDARY_URL='https://raw.githubusercontent.com/guglielmo/geojson-italy/main/geojson/limits_P_58_municipalities.geojson';

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
    description:'<strong>EEA:</strong> statistiche annuali delle stazioni ufficialmente riportate dai Paesi europei.',
    hint:"EEA mostra stazioni reali sull’area selezionata. La sfumatura è solo una visualizzazione attorno alle stazioni, non una superficie modellata continua."
  },
  arpa:{
    name:'ARPA Lazio',
    years:ARPA_YEARS,
    description:'<strong>ARPA Lazio:</strong> stime comunali ufficiali. I dati sono letti dai file annuali pubblicati da ARPA, senza dipendere dal Data API CKAN.',
    hint:'Il colore copre il territorio amministrativo di Roma per mostrare a quale area si riferisce il dato comunale. Non significa che la concentrazione sia uniforme in ogni punto del Comune.'
  }
};

function source(){return $('sourceSelect').value}
function eeaScope(){return $('eeaScopeSelect')?.value||'rome'}
function currentEeaScope(){return EEA_SCOPES[eeaScope()]||EEA_SCOPES.rome}
function currentYears(){return SOURCE_INFO[source()].years}
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
  $('eeaScopeField').classList.toggle('hidden',source()!=='eea');
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
  const scope=currentEeaScope();
  const [minLon,minLat,maxLon,maxLat]=scope.bbox;

  const countryFilter=scope.country
    ?`AND CountryCode='${scope.country}'`
    :'';

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
  const scope=currentEeaScope();
  const cacheKey=`${eeaScope()}:${year}:${pollutant}`;

  if(state.eeaCache.has(cacheKey)){
    const cached=state.eeaCache.get(cacheKey);
    diagnostics({...cached.diagnostic,cache:'memory'});
    return cached.rows
  }

  const sql=eeaSql(year,pollutant);
  let paged;

  try{
    paged=await fetchDiscodataPages(sql)
  }catch(err){
    diagnostics({
      source:'EEA / Discodata',
      scope:scope.label,
      year,pollutant,
      aggregation:'P1Y annual mean',
      endpoint:EEA_SQL_API,
      error:String(err.message||err)
    });
    throw new Error(`EEA: impossibile leggere Discodata (${err.message||err}).`)
  }

  const raw=paged.rows;

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
      country:String(r.CountryCode||''),
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
  }).sort((a,b)=>{
    const countryCmp=a.country.localeCompare(b.country);
    return countryCmp||a.name.localeCompare(b.name,'it')
  });

  const sample=raw[0]?{
    CountryCode:raw[0].CountryCode,
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
    scope:scope.label,
    boundingBox:scope.bbox,
    table:'AirQualityDataFlows.latest.AirQualityStatistics',
    year,pollutant,
    component_code:POLLUTANTS[pollutant].eeaCode,
    aggregation:'P1Y annual mean',
    pages:paged.pages,
    truncated:paged.truncated,
    rowsReceived:raw.length,
    stationsUsed:rows.length,
    countries:[...new Set(rows.map(r=>r.country).filter(Boolean))].sort(),
    sample
  };

  diagnostics(diagnostic);
  state.eeaCache.set(cacheKey,{rows,diagnostic});

  if(!rows.length){
    throw new Error(`EEA: nessuna stazione utilizzabile per ${scope.label}, ${pollutant}, ${year}.`)
  }

  if(paged.truncated){
    showToast(`EEA: raggiunto il limite di ${paged.pages*1000} record. Restringi l’area per un risultato completo.`)
  }

  return rows
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

function isRomeRecord(record){
  const entries=Object.entries(record||{});
  const istatEntry=entries.find(([k])=>normalizeArpaKey(k).includes('istat'));
  const raw=String(istatEntry?.[1]??'').replace(/\D/g,'');
  const code=raw.padStart(6,'0');
  if(code==='058091')return true;

  const nameEntry=entries.find(([k])=>{
    const n=normalizeArpaKey(k);
    return n==='nome'||n.includes('comune')||n.includes('denominazione')
  });
  const name=normalizeText(nameEntry?.[1]??'');
  return name==='roma'||name==='roma capitale'
}

async function fetchRomeBoundary(){
  if(state.romeBoundary)return state.romeBoundary;

  try{
    const response=await fetch(ROME_BOUNDARY_URL,{cache:'force-cache'});
    if(!response.ok)throw new Error(`HTTP ${response.status}`);

    const collection=await response.json();
    const feature=(collection.features||[]).find(f=>{
      const p=f.properties||{};
      return String(p.com_istat_code||'')==='058091'
        || Number(p.com_istat_code_num)===58091
        || normalizeText(p.name)==='roma'
    });

    if(!feature?.geometry)throw new Error('confine del Comune di Roma non trovato');

    state.romeBoundary={
      type:'FeatureCollection',
      features:[{
        type:'Feature',
        properties:{
          ...(feature.properties||{}),
          scope:'Comune di Roma',
          source:'ISTAT / geojson-italy'
        },
        geometry:feature.geometry
      }]
    };

    return state.romeBoundary
  }catch(err){
    console.error('Perimetro Roma non disponibile',err);
    throw new Error(`Perimetro Roma non disponibile: ${err.message||err}`)
  }
}


function fetchWithTimeout(url,options={},timeoutMs=16000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  return fetch(url,{...options,signal:controller.signal})
    .finally(()=>clearTimeout(timer))
}

function csvDelimiter(text){
  const sample=text.split(/\r?\n/).slice(0,15).join('\n');
  const candidates=[',',';','\t'];
  return candidates
    .map(d=>({d,count:sample.split(d).length-1}))
    .sort((a,b)=>b.count-a.count)[0]?.d||';'
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
  const cacheKey=`${year}:${pollutant}`;
  if(state.arpaCache.has(cacheKey)){
    const cached=state.arpaCache.get(cacheKey);
    report({...cached.diagnostic,cache:'memory'});
    return cached.rows
  }

  // Load the geographical scope independently, so a data failure can be
  // distinguished from a map/geometry failure in diagnostics.
  let boundary=null;
  try{
    boundary=await fetchRomeBoundary()
  }catch(err){
    report({
      source:'ARPA Lazio',
      year,pollutant,
      geometry:'FAILED',
      geometryError:String(err.message||err)
    });
    throw err
  }

  let loaded;
  try{
    loaded=await loadArpaStaticRecords(year)
  }catch(err){
    report({
      source:'ARPA Lazio · file statico ufficiale',
      year,pollutant,
      geometry:'OK',
      boundaryFeatures:boundary?.features?.length||0,
      data:'FAILED',
      error:String(err.message||err),
      attempts:err.attempts||null
    });
    throw err
  }

  const records=loaded.records||[];
  const record=records.find(isRomeRecord);

  if(!record){
    report({
      source:'ARPA Lazio · file statico ufficiale',
      year,pollutant,
      geometry:'OK',
      data:'OK',
      file:loaded.url,
      format:loaded.format,
      rowsReceived:records.length,
      romaRecordFound:false,
      firstColumns:Object.keys(records[0]||{}).slice(0,12)
    });
    throw new Error(`ARPA Lazio: record del Comune di Roma non trovato nel file ${year}.`)
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
      romaRecordFound:true,
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
    throw new Error(`ARPA Lazio: valore MED ${pollutant} non disponibile per Roma nel ${year}.`)
  }

  const rows=[{
    id:'ARPA-ROMA-058091',
    name:'Roma · valutazione comunale',
    lat:ROME.center[1],
    lon:ROME.center[0],
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
    romaRecordFound:true,
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
    boundarySource:'ISTAT municipality limits · geojson-italy · ISTAT 058091',
    note:'Nessuna chiamata CKAN DataStore viene eseguita a runtime.'
  };

  report(diagnostic);
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
        coverage:r.coverage??'',country:r.country??'',kind:r.kind||'station',
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
      'circle-radius':['case',
        ['==',['get','kind'],'municipal'],13,
        ['interpolate',['linear'],['zoom'],3,2.5,5,4,8,8,10,11,13,14]
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
      .setHTML(`<strong>${p.name}</strong>${p.country?` · ${p.country}`:''}<br>${fmt(p.value)} µg/m³${extra}`)
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
      'circle-radius':['case',['==',['get','kind'],'municipal'],13,
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
      ?`${r.country?`${r.country} · `:''}${r.id}${r.coverage!==null&&r.coverage!==undefined?` · copertura ${fmt(r.coverage)}%`:''}`
      :`Comune di Roma${r.zone?` · zona ${r.zone}`:''}`;

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
  $('arpaHistorySubtitle').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · MIN, MED e MAX annuali · Comune di Roma`;
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

function fitEeaScope(map){
  if(!map||source()!=='eea')return;
  const scope=currentEeaScope();
  const [minLon,minLat,maxLon,maxLat]=scope.bbox;
  map.fitBounds([[minLon,minLat],[maxLon,maxLat]],{
    padding:scope===EEA_SCOPES.rome?34:22,
    duration:0,
    maxZoom:scope.zoom
  })
}

function fitCurrentScope(map,rows){
  if(source()==='arpa')fitArpaScope(map,rows);
  else fitEeaScope(map)
}

function setLoading(on){
  $('loadingOverlay').classList.toggle('hidden',!on);
  $('loadingText').textContent=source()==='eea'
    ?`Caricamento EEA · ${currentEeaScope().label}…`
    :'Caricamento file ARPA Lazio…'
}

function sourceNotice(rows){
  if(source()==='arpa')return'ARPA Lazio · Standard comunali';
  const unverified=rows.some(r=>normalizeText(r.verification).includes('unverified'));
  const scope=currentEeaScope().label;
  return unverified?`EEA · ${scope} · presenti dati non verificati`:`EEA · ${scope} · statistiche annuali P1Y`
}

async function updateCompareMaps(){
  const [a,b]=await Promise.all([
    rowsFor($('compareYearA').value),
    rowsFor($('compareYearB').value)
  ]);
  setAirData(state.mapBefore,a,'before');
  setAirData(state.mapAfter,b,'after');
  fitCurrentScope(state.mapBefore,a);
  fitCurrentScope(state.mapAfter,b);
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
  updateArpaHistoryVisibility();

  try{
    let rows=[];

    if(state.mode==='difference'){
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
      const pair=await updateCompareMaps();
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
      $('avgValue').textContent=fmt(avg(pair.b));
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
      $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · ${$('yearSelect').value}`;
      $('avgLabel').textContent=source()==='arpa'?'Valore MED':'Media stazioni';
      $('avgValue').textContent=fmt(avg(rows));
      $('periodValue').textContent=$('yearSelect').value;
    }

    $('stationCount').textContent=source()==='arpa'?'Roma':rows.length;
    $('sourceValue').textContent=source()==='eea'?`EEA · ${currentEeaScope().label}`:SOURCE_INFO[source()].name;
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

  $('eeaScopeSelect').addEventListener('change',()=>{
    if(source()==='eea')render()
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
    fetch('version.json?v=0.1.16',{cache:'no-store'}).then(r=>r.json()),
    fetch('data/version.json?v=0.1.16',{cache:'no-store'}).then(r=>r.json())
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
    navigator.serviceWorker.register('./service-worker.js?v=0.1.16')
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
