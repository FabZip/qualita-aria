const OPEN_METEO_ARCHIVE='https://archive-api.open-meteo.com/v1/archive';
const NCEI_GSOY_STATIONS='https://gis.ncdc.noaa.gov/arcgis/rest/services/cdo/stations/MapServer/9/query';
const NCEI_GSOD_STATIONS='https://gis.ncdc.noaa.gov/arcgis/rest/services/cdo/stations/MapServer/6/query';
const NCEI_DATA='https://www.ncei.noaa.gov/access/services/data/v1';
const METEOSTAT_DAILY='https://data.meteostat.net/daily';
const ARPA_MICROMETEO_BASE='https://www.arpalazio.it/documents/20124/163276';

const PROD_ORIGIN='https://fabzip.github.io';
const NATIVE_RESOLUTION_DEG=0.1;
const MAX_GRID_POINTS=25;
const MAX_OBSERVED_STATIONS=18;
const MAX_NCEI_STATIONS=12;
const MAX_BBOX_WIDTH=12;
const MAX_BBOX_HEIGHT=9;
const CACHE_TTL=2592000;
const OBSERVED_COVERAGE_MIN=.75;
const TEMPERATURE_AGGREGATION_VERSION='annual-extremes-v1';

const METEOSTAT_OBSERVED_SOURCES=new Set([
  'isd_lite','metar','ghcnd','climat',
  'dwd_poi','dwd_hourly','dwd_daily',
  'eccc_hourly','eccc_daily'
]);

const LAZIO_BBOX=[11.35,40.75,14.10,42.95];

const ARPA_STATIONS=[
  {id:'AL001',name:'Tor Vergata',municipality:'Roma',latitude:41.84153,longitude:12.64792,elevation:104},
  {id:'AL002',name:'Latina',municipality:'Latina',latitude:41.485,longitude:12.84555,elevation:25},
  {id:'AL003',name:'Cavaliere',municipality:'Roma',latitude:41.92889,longitude:12.65832,elevation:57},
  {id:'AL004',name:'Castel di Guido',municipality:'Roma',latitude:41.88942,longitude:12.2665,elevation:61},
  {id:'AL005',name:'Istituto Jucci',municipality:'Rieti',latitude:42.42192,longitude:12.81172,elevation:379},
  {id:'AL006',name:'Aeroporto militare Frosinone',municipality:'Frosinone',latitude:41.64012,longitude:13.29754,elevation:178},
  {id:'AL007',name:'Boncompagni',municipality:'Roma',latitude:41.9096,longitude:12.49657,elevation:72},
  {id:'AL008',name:'Aeroporto militare Viterbo',municipality:'Viterbo',latitude:42.42887,longitude:12.05653,elevation:297},
  {id:'AL009',name:'Ceprano',municipality:'Ceprano',latitude:41.543958,longitude:13.483648,elevation:111,activeFrom:2023}
];

function json(data,status=200,headers={}){
  return new Response(JSON.stringify(data,null,2),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'X-Content-Type-Options':'nosniff',
      ...headers
    }
  })
}

function originAllowed(origin){
  if(!origin)return true;
  if(origin===PROD_ORIGIN)return true;

  try{
    const url=new URL(origin);
    return(
      (url.hostname==='localhost'||url.hostname==='127.0.0.1')&&
      (url.protocol==='http:'||url.protocol==='https:')
    )
  }catch{
    return false
  }
}

function corsHeaders(origin){
  if(!origin)return{};
  if(!originAllowed(origin))return null;

  return{
    'Access-Control-Allow-Origin':origin,
    'Access-Control-Allow-Methods':'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers':'Accept,Content-Type,Authorization',
    'Access-Control-Max-Age':'86400',
    'Vary':'Origin'
  }
}

function badRequest(message,cors={}){
  return json({error:message},400,cors)
}

function yearParam(value){
  const year=Number(value);
  const lastCompleteYear=new Date().getUTCFullYear()-1;

  return Number.isInteger(year)&&year>=1950&&year<=lastCompleteYear
    ?year
    :null
}

function bboxNumbers(value){
  const parts=String(value||'').split(',').map(Number);
  if(parts.length!==4||parts.some(v=>!Number.isFinite(v)))return null;

  const[minLon,minLat,maxLon,maxLat]=parts;
  if(
    minLon<-180||maxLon>180||
    minLat<-85||maxLat>85||
    minLon>=maxLon||minLat>=maxLat
  )return null;

  return parts.map(v=>Number(v.toFixed(4)))
}

function pointInsideBbox(lon,lat,bbox){
  const[minLon,minLat,maxLon,maxLat]=bbox;
  return lon>=minLon&&lon<=maxLon&&lat>=minLat&&lat<=maxLat
}

function bboxIntersects(a,b){
  return !(
    a[2]<b[0]||
    a[0]>b[2]||
    a[3]<b[1]||
    a[1]>b[3]
  )
}

function daysInYear(year){
  return new Date(Date.UTC(year,1,29)).getUTCMonth()===1?366:365
}

function average(values){
  const clean=(values||[]).filter(Number.isFinite);
  return clean.length
    ?clean.reduce((sum,value)=>sum+value,0)/clean.length
    :null
}

function finiteNumber(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;

  const raw=String(value).trim();
  if(!raw||/^(?:nan|null|n\/a|nd|-{1,2})$/i.test(raw))return null;

  const number=Number(
    raw.replace(/\s+/g,'').replace(',','.')
  );

  return Number.isFinite(number)?number:null
}

function fixed(value,digits=2){
  return Number(Number(value).toFixed(digits))
}

function cacheRequest(path,params={}){
  const url=new URL(`https://qualita-aria-temperature-cache.invalid/${path}`);

  Object.entries(params).forEach(([key,value])=>{
    url.searchParams.set(key,String(value))
  });

  return new Request(url.toString(),{method:'GET'})
}

async function cacheGet(request){
  try{return await caches.default.match(request)}
  catch{return null}
}

function cachePut(request,response,ctx){
  try{ctx.waitUntil(caches.default.put(request,response.clone()))}
  catch{}
}

async function cachedResponse(cached,cors){
  const body=await cached.arrayBuffer();
  const headers=new Headers(cached.headers);

  Object.entries(cors).forEach(([key,value])=>{
    headers.set(key,value)
  });

  headers.set('X-Proxy-Cache','HIT');
  return new Response(body,{status:200,headers})
}

function cacheableJson(payload,cors,ctx,key){
  const serialized=JSON.stringify(payload);
  const cacheHeaders={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':`public, max-age=${CACHE_TTL}`,
    'X-Content-Type-Options':'nosniff',
    'X-Proxy-Cache':'MISS',
    'X-Qualita-Aria-Proxy':'Temperature'
  };

  cachePut(
    key,
    new Response(serialized,{status:200,headers:cacheHeaders}),
    ctx
  );

  return new Response(serialized,{
    status:200,
    headers:{...cacheHeaders,...cors}
  })
}

/* ================================================================
 * ERA5-Land
 * ================================================================ */

function roundTo(value,step){
  return Number((Math.round(value/step)*step).toFixed(4))
}

function ceilTo(value,step){
  return Number((Math.ceil((value-1e-9)/step)*step).toFixed(4))
}

function floorTo(value,step){
  return Number((Math.floor((value+1e-9)/step)*step).toFixed(4))
}

function candidateStep(bbox){
  const width=bbox[2]-bbox[0];
  const height=bbox[3]-bbox[1];

  let step=NATIVE_RESOLUTION_DEG;
  while(
    (Math.floor(width/step)+1)*(Math.floor(height/step)+1)>MAX_GRID_POINTS
  ){
    step=Number((step+NATIVE_RESOLUTION_DEG).toFixed(1))
  }

  return step
}

function gridForBbox(bbox){
  const step=candidateStep(bbox);
  const[minLon,minLat,maxLon,maxLat]=bbox;

  let lonStart=ceilTo(minLon,step);
  let lonEnd=floorTo(maxLon,step);
  let latStart=ceilTo(minLat,step);
  let latEnd=floorTo(maxLat,step);

  if(lonStart>lonEnd){
    lonStart=lonEnd=roundTo((minLon+maxLon)/2,NATIVE_RESOLUTION_DEG)
  }
  if(latStart>latEnd){
    latStart=latEnd=roundTo((minLat+maxLat)/2,NATIVE_RESOLUTION_DEG)
  }

  const points=[];
  for(
    let lat=latStart;
    lat<=latEnd+1e-9;
    lat=Number((lat+step).toFixed(4))
  ){
    for(
      let lon=lonStart;
      lon<=lonEnd+1e-9;
      lon=Number((lon+step).toFixed(4))
    ){
      points.push({
        latitude:Number(lat.toFixed(4)),
        longitude:Number(lon.toFixed(4))
      })
    }
  }

  return{
    points:points.slice(0,MAX_GRID_POINTS),
    sampleStepDegrees:step
  }
}

function annualDates(year){
  return{
    start:`${year}-01-01`,
    end:`${year}-12-31`
  }
}

function annualStatsFromDaily(daily){
  const means=(daily?.temperature_2m_mean||[])
    .map(Number).filter(Number.isFinite);
  const mins=(daily?.temperature_2m_min||[])
    .map(Number).filter(Number.isFinite);
  const maxs=(daily?.temperature_2m_max||[])
    .map(Number).filter(Number.isFinite);

  if(!means.length||!mins.length||!maxs.length)return null;

  return{
    min:fixed(Math.min(...mins)),
    mean:fixed(average(means)),
    max:fixed(Math.max(...maxs)),
    observations:Math.min(mins.length,means.length,maxs.length)
  }
}

function annualArchiveUrl(points,year){
  const{start,end}=annualDates(year);
  const url=new URL(OPEN_METEO_ARCHIVE);

  url.searchParams.set(
    'latitude',
    points.map(point=>point.latitude).join(',')
  );
  url.searchParams.set(
    'longitude',
    points.map(point=>point.longitude).join(',')
  );
  url.searchParams.set('start_date',start);
  url.searchParams.set('end_date',end);
  url.searchParams.set(
    'daily',
    'temperature_2m_mean,temperature_2m_min,temperature_2m_max'
  );
  url.searchParams.set('models','era5_land');
  url.searchParams.set('timezone','GMT');
  url.searchParams.set('temperature_unit','celsius');
  url.searchParams.set('cell_selection','nearest');

  return{url,start,end}
}

async function fetchEraBatch(points,year){
  const{url,start,end}=annualArchiveUrl(points,year);
  const started=Date.now();

  const response=await fetch(url.toString(),{
    headers:{Accept:'application/json'}
  });

  const payload=await response.json().catch(()=>null);

  if(!response.ok){
    const error=new Error(
      `Open-Meteo HTTP ${response.status}: `+
      String(payload?.reason||payload?.error||'errore upstream')
    );
    error.status=response.status;
    throw error
  }

  return{
    payload,
    start,
    end,
    upstreamMs:Date.now()-started
  }
}

function normalizeEraLocations(payload,requested){
  const locations=Array.isArray(payload)?payload:[payload];
  const seen=new Set();
  const results=[];

  locations.forEach((location,index)=>{
    const latitude=Number(location?.latitude);
    const longitude=Number(location?.longitude);
    const stats=annualStatsFromDaily(location?.daily);

    if(
      !Number.isFinite(latitude)||
      !Number.isFinite(longitude)||
      !stats
    )return;

    const cellKey=`${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    if(seen.has(cellKey))return;
    seen.add(cellKey);

    results.push({
      id:`era5-land:${cellKey}`,
      name:`Cella ERA5-Land ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
      latitude,
      longitude,
      elevation:Number.isFinite(Number(location?.elevation))
        ?Number(location.elevation)
        :null,
      ...stats,
      unit:'°C',
      requested:requested[index]||null,
      type:'climate-reanalysis',
      sourceTemperature:'Copernicus ERA5-Land',
      resolutionKm:'circa 9 km'
    })
  });

  return results
}

async function eraViewportResponse(ctx,cors,{bbox,year}){
  const width=bbox[2]-bbox[0];
  const height=bbox[3]-bbox[1];

  if(width>MAX_BBOX_WIDTH||height>MAX_BBOX_HEIGHT){
    return json({
      error:'Area temperatura troppo ampia. Aumenta lo zoom per caricare ERA5-Land.',
      code:'AREA_TOO_WIDE',
      maxWidth:MAX_BBOX_WIDTH,
      maxHeight:MAX_BBOX_HEIGHT
    },413,{...cors,'Cache-Control':'no-store'})
  }

  const grid=gridForBbox(bbox);
  const key=cacheRequest('era-year',{
    aggregation:TEMPERATURE_AGGREGATION_VERSION,
    year,
    points:grid.points
      .map(point=>`${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`)
      .join(';')
  });

  const cached=await cacheGet(key);
  if(cached)return cachedResponse(cached,cors);

  try{
    const batch=await fetchEraBatch(grid.points,year);
    const results=normalizeEraLocations(batch.payload,grid.points);

    return cacheableJson({
      meta:{
        source:'Copernicus ERA5-Land via Open-Meteo',
        type:'climate-reanalysis',
        variable:'temperature_2m',
        aggregation:'annual absolute minimum / mean of daily means / absolute maximum',
        nativeResolutionDegrees:NATIVE_RESOLUTION_DEG,
        nativeResolutionApproxKm:'9–11',
        sampleStepDegrees:grid.sampleStepDegrees,
        requestedPoints:grid.points.length,
        returnedCells:results.length,
        bbox,
        year,
        startDate:batch.start,
        endDate:batch.end,
        upstreamMs:batch.upstreamMs,
        generatedAt:new Date().toISOString()
      },
      results
    },cors,ctx,key)
  }catch(err){
    return json({
      error:String(err.message||err),
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }
}

/* ================================================================
 * ARPA Lazio physical micro-meteorological stations
 * ================================================================ */

function arpaFileUrl(year){
  const filename=year>=2022
    ?`${year}_all.csv`
    :`${year}.csv`;

  return`${ARPA_MICROMETEO_BASE}/${filename}`
}

function normalizeHeader(value){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,' ')
    .trim()
}

function csvDelimiter(line){
  const candidates=[';',',','\t'];
  let best=';';
  let bestCount=-1;

  for(const delimiter of candidates){
    let count=0;
    let quoted=false;

    for(const ch of line){
      if(ch==='"')quoted=!quoted;
      else if(!quoted&&ch===delimiter)count++
    }

    if(count>bestCount){
      best=delimiter;
      bestCount=count
    }
  }

  return best
}

function splitCsvLine(line,delimiter){
  const out=[];
  let current='';
  let quoted=false;

  for(let index=0;index<line.length;index++){
    const char=line[index];

    if(char==='"'){
      if(quoted&&line[index+1]==='"'){
        current+='"';
        index++;
      }else{
        quoted=!quoted
      }
      continue
    }

    if(char===delimiter&&!quoted){
      out.push(current);
      current='';
    }else{
      current+=char
    }
  }

  out.push(current);
  return out.map(value=>value.trim())
}

function findHeader(headers,predicates){
  for(const predicate of predicates){
    const index=headers.findIndex(predicate);
    if(index>=0)return index
  }
  return-1
}

function arpaSchema(headers){
  const station=findHeader(headers,[
    header=>header==='codice stazione',
    header=>header==='cod stazione',
    header=>header==='id stazione',
    header=>header==='stazione',
    header=>header.includes('codice')&&header.includes('staz')
  ]);

  const date=findHeader(headers,[
    header=>header==='data',
    header=>header==='date',
    header=>header==='giorno',
    header=>header.includes('data')&&!header.includes('ora')
  ]);

  const datetime=findHeader(headers,[
    header=>header.includes('timestamp'),
    header=>header.includes('data ora'),
    header=>header.includes('datetime')
  ]);

  const parameter=findHeader(headers,[
    header=>header==='parametro',
    header=>header==='parameter',
    header=>header==='grandezza',
    header=>header.includes('parametr')
  ]);

  const genericValue=findHeader(headers,[
    header=>header==='valore',
    header=>header==='value',
    header=>header==='misura'
  ]);

  const temperature=findHeader(headers,[
    header=>header==='t',
    header=>header==='ta',
    header=>header==='temp',
    header=>header==='taria',
    header=>header==='temperatura',
    header=>header==='temperatura aria',
    header=>header.includes('temp aria'),
    header=>
      header.includes('temperatura')&&
      !header.includes('radi')&&
      !header.includes('suolo')&&
      !header.includes('min')&&
      !header.includes('max')
  ]);

  return{
    station,
    date,
    datetime,
    parameter,
    genericValue,
    temperature
  }
}

function parseDateKey(value,year){
  const raw=String(value||'').trim();
  if(!raw)return null;

  let match=raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
  if(match){
    const y=Number(match[1]);
    const m=Number(match[2]);
    const d=Number(match[3]);

    return y===year
      ?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      :null
  }

  match=raw.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/);
  if(match){
    const d=Number(match[1]);
    const m=Number(match[2]);
    const y=Number(match[3]);

    return y===year
      ?`${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
      :null
  }

  match=raw.match(/^(\d{4})(\d{2})(\d{2})/);
  if(match&&Number(match[1])===year){
    return`${match[1]}-${match[2]}-${match[3]}`
  }

  return null
}

function temperatureParameter(value){
  const normalized=normalizeHeader(value);

  return(
    normalized==='t'||
    normalized==='ta'||
    normalized==='temp'||
    normalized==='taria'||
    normalized.includes('temperatura aria')||
    normalized.includes('temperatura')
  )
}

function arpaStationCode(row,schema){
  const explicit=schema.station>=0
    ?String(row[schema.station]||'').trim().toUpperCase()
    :'';

  if(/^AL00[1-9]$/.test(explicit))return explicit;

  for(const value of row){
    const candidate=String(value||'').trim().toUpperCase();
    if(/^AL00[1-9]$/.test(candidate))return candidate
  }

  return null
}

function arpaTemperature(row,schema){
  if(schema.parameter>=0&&schema.genericValue>=0){
    if(!temperatureParameter(row[schema.parameter]))return null;

    const value=finiteNumber(row[schema.genericValue]);
    return value!==null&&value>=-50&&value<=60?value:null
  }

  if(schema.temperature>=0){
    const value=finiteNumber(row[schema.temperature]);
    return value!==null&&value>=-50&&value<=60?value:null
  }

  return null
}

function accumulateReading(store,station,day,value){
  if(!store.has(station))store.set(station,new Map());
  const days=store.get(station);

  if(!days.has(day)){
    days.set(day,{
      count:0,
      sum:0,
      min:Infinity,
      max:-Infinity
    })
  }

  const entry=days.get(day);
  entry.count++;
  entry.sum+=value;
  entry.min=Math.min(entry.min,value);
  entry.max=Math.max(entry.max,value)
}

function aggregateArpaCsv(text,year){
  const lines=String(text||'')
    .replace(/^\uFEFF/,'')
    .split(/\r?\n/)
    .filter(line=>line.trim().length);

  if(lines.length<2){
    throw new Error('ARPA Lazio: CSV micro-meteorologico vuoto.')
  }

  const delimiter=csvDelimiter(lines[0]);
  const rawHeaders=splitCsvLine(lines[0],delimiter);
  const headers=rawHeaders.map(normalizeHeader);
  const schema=arpaSchema(headers);

  if(
    schema.temperature<0&&
    !(schema.parameter>=0&&schema.genericValue>=0)
  ){
    const error=new Error(
      'ARPA Lazio: colonna temperatura non riconosciuta nel CSV.'
    );
    error.headers=rawHeaders.slice(0,30);
    throw error
  }

  const byStation=new Map();
  let acceptedReadings=0;

  for(let index=1;index<lines.length;index++){
    const row=splitCsvLine(lines[index],delimiter);
    if(row.length<2)continue;

    const station=arpaStationCode(row,schema);
    if(!station)continue;

    const stationMeta=ARPA_STATIONS.find(item=>item.id===station);
    if(!stationMeta)continue;
    if(stationMeta.activeFrom&&year<stationMeta.activeFrom)continue;

    const dateValue=schema.datetime>=0
      ?row[schema.datetime]
      :schema.date>=0
        ?row[schema.date]
        :row.find(value=>parseDateKey(value,year));

    const day=parseDateKey(dateValue,year);
    if(!day)continue;

    const value=arpaTemperature(row,schema);
    if(value===null)continue;

    accumulateReading(byStation,station,day,value);
    acceptedReadings++
  }

  const requiredDays=Math.ceil(daysInYear(year)*OBSERVED_COVERAGE_MIN);
  const results=[];

  for(const station of ARPA_STATIONS){
    if(station.activeFrom&&year<station.activeFrom)continue;

    const days=byStation.get(station.id);
    if(!days)continue;

    const dailyMin=[];
    const dailyMean=[];
    const dailyMax=[];

    for(const day of days.values()){
      if(day.count<2)continue;

      dailyMin.push(day.min);
      dailyMean.push(day.sum/day.count);
      dailyMax.push(day.max)
    }

    const validDays=Math.min(
      dailyMin.length,
      dailyMean.length,
      dailyMax.length
    );

    if(validDays<requiredDays)continue;

    results.push({
      id:station.id,
      name:station.name,
      municipality:station.municipality,
      latitude:station.latitude,
      longitude:station.longitude,
      elevation:station.elevation,
      min:fixed(Math.min(...dailyMin)),
      mean:fixed(average(dailyMean)),
      max:fixed(Math.max(...dailyMax)),
      validDays,
      coverage:fixed(validDays/daysInYear(year)*100,1),
      type:'measured',
      sourceTemperature:'ARPA Lazio',
      network:'Rete micro-meteorologica ARPA Lazio'
    })
  }

  return{
    results,
    parser:{
      delimiter:delimiter==='\t'?'TAB':delimiter,
      headers:rawHeaders.slice(0,30),
      schema,
      lines:lines.length,
      acceptedReadings
    }
  }
}

async function fetchArpaObserved(year,ctx){
  if(year<2013||year>2025){
    return{
      meta:{
        source:'ARPA Lazio',
        reason:'Anno fuori dalla copertura pubblicata 2013–2025'
      },
      results:[]
    }
  }

  const key=cacheRequest('arpa-observed',{
    aggregation:TEMPERATURE_AGGREGATION_VERSION,
    year
  });
  const cached=await cacheGet(key);

  if(cached){
    return await cached.json()
  }

  const url=arpaFileUrl(year);
  const started=Date.now();
  const response=await fetch(url,{
    headers:{Accept:'text/csv,text/plain,*/*'}
  });

  if(!response.ok){
    const error=new Error(`ARPA Lazio CSV HTTP ${response.status}`);
    error.status=response.status;
    throw error
  }

  const text=await response.text();
  const aggregated=aggregateArpaCsv(text,year);

  const payload={
    meta:{
      source:'ARPA Lazio',
      network:'Rete micro-meteorologica',
      type:'measured',
      year,
      file:url,
      stationsPublished:ARPA_STATIONS.length,
      stationsWithSufficientData:aggregated.results.length,
      coverageThresholdPct:OBSERVED_COVERAGE_MIN*100,
      upstreamMs:Date.now()-started,
      parser:aggregated.parser,
      generatedAt:new Date().toISOString()
    },
    results:aggregated.results
  };

  cachePut(
    key,
    new Response(JSON.stringify(payload),{
      headers:{
        'Content-Type':'application/json; charset=utf-8',
        'Cache-Control':`public, max-age=${CACHE_TTL}`
      }
    }),
    ctx
  );

  return payload
}

/* ================================================================
 * NOAA/NCEI Global Summary of the Year — physical stations
 *
 * EMNT = Extreme Min Temp
 * TAVG = Annual Mean Temp
 * EMXT = Extreme Max Temp
 * ================================================================ */

function normalizeNceiStationId(value){
  return String(value||'')
    .replace(/^(?:GHCND|GSOY):/i,'')
    .trim()
}

function arcGisDateCoversYear(value,year,side){
  if(value===null||value===undefined||value==='')return true;

  const numeric=Number(value);
  let date=null;

  if(Number.isFinite(numeric)&&numeric>1000000000){
    date=new Date(numeric)
  }else{
    const parsed=Date.parse(String(value));
    if(Number.isFinite(parsed))date=new Date(parsed)
  }

  if(!date||Number.isNaN(date.getTime()))return true;

  const stationYear=date.getUTCFullYear();
  return side==='begin'
    ?stationYear<=year
    :stationYear>=year
}

function extractGsoyStations(payload,bbox,year){
  const features=Array.isArray(payload?.features)?payload.features:[];
  const seen=new Set();
  const stations=[];

  for(const feature of features){
    const a=feature?.attributes||feature||{};
    const id=normalizeNceiStationId(a.STATION_ID);
    const latitude=finiteNumber(a.LATITUDE);
    const longitude=finiteNumber(a.LONGITUDE);

    if(
      !id||
      seen.has(id)||
      latitude===null||
      longitude===null||
      !pointInsideBbox(longitude,latitude,bbox)
    )continue;

    if(
      !arcGisDateCoversYear(a.DATA_BEGIN_DATE,year,'begin')||
      !arcGisDateCoversYear(a.DATA_END_DATE,year,'end')
    )continue;

    seen.add(id);
    stations.push({
      id,
      name:String(a.STATION_NAME||id),
      country:String(a.COUNTRY||''),
      latitude,
      longitude,
      elevation:finiteNumber(a.ELEVATION)
    });

    if(stations.length>=MAX_NCEI_STATIONS)break
  }

  return stations
}

async function discoverNceiStations(year,bbox){
  const url=new URL(NCEI_GSOY_STATIONS);

  url.searchParams.set('where','1=1');
  url.searchParams.set(
    'geometry',
    `${bbox[0]},${bbox[1]},${bbox[2]},${bbox[3]}`
  );
  url.searchParams.set('geometryType','esriGeometryEnvelope');
  url.searchParams.set('inSR','4326');
  url.searchParams.set('spatialRel','esriSpatialRelIntersects');
  url.searchParams.set(
    'outFields',
    'STATION_ID,STATION_NAME,DATA_BEGIN_DATE,DATA_END_DATE,COUNTRY,LATITUDE,LONGITUDE,ELEVATION'
  );
  url.searchParams.set('returnGeometry','false');
  url.searchParams.set('resultRecordCount','100');
  url.searchParams.set('f','json');

  const response=await fetch(url.toString(),{
    headers:{Accept:'application/json'}
  });
  const payload=await response.json().catch(()=>null);

  if(!response.ok||payload?.error){
    const detail=payload?.error?.message||`HTTP ${response.status}`;
    const error=new Error(`NOAA/NCEI GSOY station search: ${detail}`);
    error.status=response.status;
    throw error
  }

  return{
    stations:extractGsoyStations(payload,bbox,year),
    searchUrl:url.toString()
  }
}

async function fetchNceiGsoy(year,stations){
  if(!stations.length)return[];

  const url=new URL(NCEI_DATA);
  url.searchParams.set('dataset','global-summary-of-the-year');
  url.searchParams.set(
    'stations',
    stations.map(station=>station.id).join(',')
  );
  url.searchParams.set('startDate',`${year}-01-01`);
  url.searchParams.set('endDate',`${year}-12-31`);
  url.searchParams.set('dataTypes','TAVG,EMNT,EMXT');
  url.searchParams.set('includeStationName','true');
  url.searchParams.set('includeStationLocation','true');
  url.searchParams.set('units','metric');
  url.searchParams.set('format','json');

  const response=await fetch(url.toString(),{
    headers:{Accept:'application/json'}
  });
  const payload=await response.json().catch(()=>null);

  if(!response.ok){
    const error=new Error(`NOAA/NCEI GSOY data HTTP ${response.status}`);
    error.status=response.status;
    throw error
  }

  return Array.isArray(payload)?payload:[]
}

function aggregateNceiGsoy(year,stationMeta,records){
  const metaById=new Map(
    stationMeta.map(station=>[station.id,station])
  );
  const results=[];

  for(const record of records){
    const id=normalizeNceiStationId(record.STATION??record.station);
    const meta=metaById.get(id);
    if(!meta)continue;

    const min=finiteNumber(record.EMNT??record.emnt);
    const mean=finiteNumber(record.TAVG??record.tavg);
    const max=finiteNumber(record.EMXT??record.emxt);

    if(min===null||mean===null||max===null)continue;

    const latitude=
      finiteNumber(record.LATITUDE??record.latitude)??meta.latitude;
    const longitude=
      finiteNumber(record.LONGITUDE??record.longitude)??meta.longitude;

    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;

    results.push({
      id,
      name:String(record.NAME??record.name??meta.name??id),
      latitude,
      longitude,
      elevation:
        finiteNumber(record.ELEVATION??record.elevation)??meta.elevation,
      min:fixed(min),
      mean:fixed(mean),
      max:fixed(max),
      validDays:null,
      coverage:null,
      type:'measured',
      annualSummary:true,
      sourceTemperature:'NOAA/NCEI Global Summary of the Year',
      network:'GSOY'
    })
  }

  return results
}

async function fetchNceiObserved(year,bbox){
  const started=Date.now();
  const discovery=await discoverNceiStations(year,bbox);

  if(!discovery.stations.length){
    return{
      meta:{
        source:'NOAA/NCEI Global Summary of the Year',
        type:'measured',
        year,
        stationsDiscovered:0,
        stationsWithAnnualTemperature:0,
        upstreamMs:Date.now()-started
      },
      results:[]
    }
  }

  const records=await fetchNceiGsoy(year,discovery.stations);
  const results=aggregateNceiGsoy(year,discovery.stations,records);

  return{
    meta:{
      source:'NOAA/NCEI Global Summary of the Year',
      type:'measured',
      year,
      stationsDiscovered:discovery.stations.length,
      stationsWithAnnualTemperature:results.length,
      annualRows:records.length,
      annualElements:['EMNT','TAVG','EMXT'],
      upstreamMs:Date.now()-started,
      generatedAt:new Date().toISOString()
    },
    results
  }
}

/* ================================================================
 * Meteostat — fallback osservazionale basato su stazioni GSOD/WMO.
 *
 * I dump Meteostat possono contenere dati modellati. Per questo vengono
 * accettati soltanto i giorni nei quali TEMP, TMIN e TMAX dichiarano
 * esclusivamente provider osservativi presenti nella allowlist.
 * TMIN e TMAX giornalieri vengono ridotti agli estremi assoluti annuali.
 * ================================================================ */

function compactDateCoversYear(value,year,side){
  const match=String(value||'').match(/^(\d{4})/);
  if(!match)return true;
  const stationYear=Number(match[1]);
  return side==='begin'?stationYear<=year:stationYear>=year
}

function meteostatIdFromGsod(attributes){
  const aws=String(attributes?.AWS||'').replace(/\D/g,'');
  if(/^\d{6}$/.test(aws)&&aws.endsWith('0'))return aws.slice(0,5);
  if(/^\d{5}$/.test(aws))return aws;

  const awsban=String(attributes?.AWSBAN||'').replace(/\D/g,'');
  if(/^\d{11}$/.test(awsban))return awsban.slice(0,5);
  return''
}

function extractGsodStations(payload,bbox,year){
  const features=Array.isArray(payload?.features)?payload.features:[];
  const seen=new Set();
  const stations=[];

  for(const feature of features){
    const a=feature?.attributes||feature||{};
    const id=meteostatIdFromGsod(a);
    const latitude=finiteNumber(a.LATITUDE);
    const longitude=finiteNumber(a.LONGITUDE);

    if(
      !id||seen.has(id)||latitude===null||longitude===null||
      !pointInsideBbox(longitude,latitude,bbox)
    )continue;

    if(
      !compactDateCoversYear(a.BEG_DATE,year,'begin')||
      !compactDateCoversYear(a.END_DATE,year,'end')
    )continue;

    seen.add(id);
    stations.push({
      id,
      name:String(a.STATION||a.ICAO||id),
      icao:String(a.ICAO||''),
      wmo:id,
      latitude,
      longitude,
      elevation:finiteNumber(a.ELEVATION)
    });

    if(stations.length>=MAX_NCEI_STATIONS)break
  }

  return stations
}

async function discoverMeteostatStations(year,bbox){
  const url=new URL(NCEI_GSOD_STATIONS);
  url.searchParams.set('where','1=1');
  url.searchParams.set('geometry',bbox.join(','));
  url.searchParams.set('geometryType','esriGeometryEnvelope');
  url.searchParams.set('inSR','4326');
  url.searchParams.set('spatialRel','esriSpatialRelIntersects');
  url.searchParams.set(
    'outFields',
    'STATION,AWS,WBAN,AWSBAN,ICAO,BEG_DATE,END_DATE,COUNTRY,LATITUDE,LONGITUDE,ELEVATION'
  );
  url.searchParams.set('returnGeometry','false');
  url.searchParams.set('resultRecordCount','100');
  url.searchParams.set('f','json');

  const response=await fetch(url.toString(),{headers:{Accept:'application/json'}});
  const payload=await response.json().catch(()=>null);

  if(!response.ok||payload?.error){
    const detail=payload?.error?.message||`HTTP ${response.status}`;
    throw new Error(`Catalogo stazioni NOAA GSOD: ${detail}`)
  }

  return extractGsodStations(payload,bbox,year)
}

async function responseTextMaybeGzip(response){
  const bytes=await response.arrayBuffer();
  const signature=new Uint8Array(bytes,0,Math.min(2,bytes.byteLength));

  if(signature[0]===0x1f&&signature[1]===0x8b){
    const stream=new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    return new Response(stream).text()
  }

  return new TextDecoder().decode(bytes)
}

function parseSimpleCsv(text){
  const lines=String(text||'').trim().split(/\r?\n/);
  if(lines.length<2)return[];
  const headers=lines[0].split(',').map(value=>value.trim());

  return lines.slice(1).map(line=>{
    const cells=line.split(',');
    return Object.fromEntries(headers.map((header,index)=>[
      header,String(cells[index]??'').trim()
    ]))
  })
}

function observedMeteostatSource(value){
  const sources=String(value||'').trim().split(/\s+/).filter(Boolean);
  return sources.length>0&&sources.every(source=>
    METEOSTAT_OBSERVED_SOURCES.has(source)
  )
}

async function fetchMeteostatStationYear(station,year){
  const url=`${METEOSTAT_DAILY}/${year}/${encodeURIComponent(station.id)}.csv.gz`;
  const response=await fetch(url,{headers:{Accept:'application/gzip,text/csv'}});

  if(response.status===404)return null;
  if(!response.ok)throw new Error(`Meteostat ${station.id}: HTTP ${response.status}`);

  const records=parseSimpleCsv(await responseTextMaybeGzip(response));
  const valid=records.filter(record=>
    finiteNumber(record.temp)!==null&&
    finiteNumber(record.tmin)!==null&&
    finiteNumber(record.tmax)!==null&&
    observedMeteostatSource(record.temp_source)&&
    observedMeteostatSource(record.tmin_source)&&
    observedMeteostatSource(record.tmax_source)
  );

  const validDays=valid.length;
  const coverage=validDays/daysInYear(year);
  if(coverage<OBSERVED_COVERAGE_MIN)return null;

  return{
    id:`meteostat:${station.id}`,
    name:station.name,
    latitude:station.latitude,
    longitude:station.longitude,
    elevation:station.elevation,
    min:fixed(Math.min(...valid.map(record=>finiteNumber(record.tmin)))),
    mean:fixed(average(valid.map(record=>finiteNumber(record.temp)))),
    max:fixed(Math.max(...valid.map(record=>finiteNumber(record.tmax)))),
    validDays,
    coverage:fixed(coverage*100,1),
    type:'measured',
    annualSummary:true,
    sourceTemperature:'Meteostat · sole fonti osservative',
    network:'Meteostat observational',
    wmo:station.wmo,
    icao:station.icao,
    observedProviders:[...new Set(valid.flatMap(record=>[
      ...String(record.temp_source).split(/\s+/),
      ...String(record.tmin_source).split(/\s+/),
      ...String(record.tmax_source).split(/\s+/)
    ]).filter(Boolean))]
  }
}

async function fetchMeteostatObserved(year,bbox){
  const started=Date.now();
  const stations=await discoverMeteostatStations(year,bbox);
  const settled=await Promise.allSettled(
    stations.map(station=>fetchMeteostatStationYear(station,year))
  );
  const results=settled
    .filter(item=>item.status==='fulfilled'&&item.value)
    .map(item=>item.value);

  return{
    meta:{
      source:'Meteostat observational station dumps',
      catalog:'NOAA/NCEI Global Summary of the Day station layer',
      type:'measured',
      modelDataAccepted:false,
      allowedProviders:[...METEOSTAT_OBSERVED_SOURCES],
      year,
      stationsDiscovered:stations.length,
      stationsWithSufficientData:results.length,
      coverageThresholdPct:OBSERVED_COVERAGE_MIN*100,
      failedRequests:settled.filter(item=>item.status==='rejected').length,
      upstreamMs:Date.now()-started
    },
    results
  }
}

function haversineKm(a,b){
  const rad=value=>value*Math.PI/180;
  const dLat=rad(b.latitude-a.latitude);
  const dLon=rad(b.longitude-a.longitude);
  const lat1=rad(a.latitude);
  const lat2=rad(b.latitude);

  const h=
    Math.sin(dLat/2)**2+
    Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;

  return 6371*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h))
}

function mergeObservedSources(...groups){
  const merged=[];

  for(const station of groups.flat()){
    const duplicate=merged.some(existing=>
      haversineKm(existing,station)<15
    );
    if(!duplicate)merged.push(station)
  }

  return merged.slice(0,MAX_OBSERVED_STATIONS)
}

/* ================================================================
 * Provider routing
 * ================================================================ */

async function observedResponse(ctx,cors,{pollutantSource,year,bbox}){
  const key=cacheRequest('observed',{
    aggregation:TEMPERATURE_AGGREGATION_VERSION,
    pollutantSource,
    year,
    bbox:bbox.map(value=>value.toFixed(2)).join(',')
  });

  const cached=await cacheGet(key);
  if(cached)return cachedResponse(cached,cors);

  const started=Date.now();

  try{
    if(pollutantSource==='arpa'){
      const arpa=await fetchArpaObserved(year,ctx);
      const results=(arpa.results||[]).filter(station=>
        pointInsideBbox(
          station.longitude,
          station.latitude,
          bbox
        )
      );

      return cacheableJson({
        meta:{
          pollutantSource,
          temperatureProvider:'ARPA Lazio',
          providerStrategy:
            'Physical ARPA Lazio micro-meteorological network only',
          type:'measured',
          year,
          bbox,
          sourceMeta:arpa.meta,
          stationsUsed:results.length,
          durationMs:Date.now()-started
        },
        results
      },cors,ctx,key)
    }

    if(pollutantSource==='eea'){
      let arpaResults=[];
      let arpaMeta=null;

      if(
        year>=2013&&
        year<=2025&&
        bboxIntersects(bbox,LAZIO_BBOX)
      ){
        try{
          const arpa=await fetchArpaObserved(year,ctx);
          arpaMeta=arpa.meta;
          arpaResults=(arpa.results||[]).filter(station=>
            pointInsideBbox(
              station.longitude,
              station.latitude,
              bbox
            )
          )
        }catch(err){
          arpaMeta={error:String(err.message||err)}
        }
      }

      let ncei={results:[],meta:null};
      let meteostat={results:[],meta:null};

      try{
        ncei=await fetchNceiObserved(year,bbox)
      }catch(err){
        ncei={
          results:[],
          meta:{error:String(err.message||err)}
        }
      }

      try{
        meteostat=await fetchMeteostatObserved(year,bbox)
      }catch(err){
        meteostat={
          results:[],
          meta:{error:String(err.message||err)}
        }
      }

      const results=mergeObservedSources(
        arpaResults,
        ncei.results||[],
        meteostat.results||[]
      );

      return cacheableJson({
        meta:{
          pollutantSource,
          temperatureProvider:
            'Physical meteorological stations',
          providerStrategy:
            'ARPA Lazio in Lazio, then NOAA/NCEI GSOY, then observation-only Meteostat station data',
          sciaStatus:
            'SCIA/ISPRA remains preferred for future Italian integration but no compatible machine endpoint is used by this release.',
          type:'measured',
          year,
          bbox,
          arpa:arpaMeta,
          ncei:ncei.meta,
          meteostat:meteostat.meta,
          stationsUsed:results.length,
          durationMs:Date.now()-started
        },
        results
      },cors,ctx,key)
    }

    return badRequest(
      'Fonte inquinante non supportata per stazioni meteorologiche fisiche.',
      cors
    )
  }catch(err){
    return json({
      error:String(err.message||err),
      pollutantSource,
      year
    },502,{...cors,'Cache-Control':'no-store'})
  }
}

const TREE_SOURCE_LISTS=[
  'https://www.comune.roma.it/web/it/informazioni-di-servizio.page?tem=verde_urbano',
  'https://www.comune.roma.it/web/it/notizie.page?tem=verde_urbano'
];
const TREE_SOURCE_ORIGIN='https://www.comune.roma.it';
const TREE_MAX_PAGES_PER_RUN=40;
const TREE_MAX_GEOCODES_PER_RUN=8;
const ROME_GEOCODE_BBOX={west:12.15,south:41.65,east:12.85,north:42.15};

function decodeHtml(value){
  return String(value||'')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&deg;/gi,'°')
    .replace(/&(?:rsquo|lsquo);/gi,"'")
    .replace(/&(?:rdquo|ldquo);/gi,'"')
    .replace(/&ndash;/gi,'–')
    .replace(/&mdash;/gi,'—')
    .replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(Number.parseInt(code,16)))
    .replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code)))
    .replace(/\s+/g,' ')
    .trim()
}

function treeSourceLinks(html){
  const links=new Set();
  const pattern=/href=["']([^"']+(?:informazione-di-servizio|notizia)[^"']+)["']/gi;
  let match;
  while((match=pattern.exec(html))&&links.size<TREE_MAX_PAGES_PER_RUN){
    try{
      const url=new URL(match[1],TREE_SOURCE_ORIGIN);
      if(url.origin===TREE_SOURCE_ORIGIN)links.add(url.toString())
    }catch{}
  }
  return[...links]
}

function italianMonth(value){
  const months={gennaio:1,febbraio:2,marzo:3,aprile:4,maggio:5,giugno:6,luglio:7,agosto:8,settembre:9,ottobre:10,novembre:11,dicembre:12};
  return months[String(value||'').toLowerCase()]||null
}

function sourceDate(text){
  const match=text.match(/\b(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(20\d{2})\b/i);
  if(!match)return null;
  return`${match[3]}-${String(italianMonth(match[2])).padStart(2,'0')}-${String(match[1]).padStart(2,'0')}`
}

function titleFromHtml(html){
  const h1=html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  const title=html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  return decodeHtml(h1?.[1]||title?.[1]||'Evento arboreo Roma Capitale').slice(0,300)
}

function treeQuantity(text){
  const values=[];
  const numbered=/(?:\bn\.?|n°)\s*(\d{1,5})\s+(?![°^])/gi;
  let match;
  while((match=numbered.exec(text)))values.push(Number(match[1]));
  if(values.length)return values.reduce((sum,value)=>sum+value,0);
  const plain=text.match(/\b(\d{1,5})\s+(?:nuov[ei]\s+)?(?:alber(?:i|ature)|esemplari)\b/i);
  return plain?Number(plain[1]):null
}

function treeLocations(text){
  return[...new Set([...text.matchAll(
    /Ubicazione\s*:\s*(.{2,180}?)(?=\s+(?:Caratteristiche botaniche|Ragioni che hanno condotto|Data di esecuzione|Ubicazione\s*:)|$)/gi
  )]
    .map(match=>String(match[1]||'').trim().replace(/[,:;\s]+$/,''))
    .filter(Boolean))]
}

function treeGeocodeQuery(locationName){
  return String(locationName||'')
    .replace(/\bP\.?\s*co\b/gi,'Parco')
    .replace(/\bP\.?\s*zza\b/gi,'Piazza')
    .replace(/\bP\.?\s*za\b/gi,'Piazza')
    .replace(/\bP\.?\s*le\b/gi,'Piazzale')
    .replace(/\bV\.?\s*le\b/gi,'Viale')
    .replace(/\bL\.?\s*go\b/gi,'Largo')
    .replace(/\bpiazza Cinquecento\b/gi,'Piazza dei Cinquecento')
    .replace(/\bMacchiaveli\b/gi,'Machiavelli')
    .replace(/\bvia C\.\s*Colombo\b/gi,'Via Cristoforo Colombo')
    .replace(/\bviale Marconi\b/gi,'Viale Guglielmo Marconi')
}

function treeGeocodeQueries(locationName){
  const expanded=treeGeocodeQuery(locationName);
  const stripped=expanded.replace(/^(?:Parco|Piazza|Piazzale|Viale|Largo)\s+/i,'').trim();
  const parts=expanded.split(/\s+[–—]\s+/).map(value=>value.trim()).filter(Boolean);
  const areaStripped=expanded.replace(/^area verde\s+(?:svincolo\s+)?/i,'').trim();
  const intersection=areaStripped.match(/^(.+?)\s+incrocio\s+(.+)$/i);
  const aliases=[];
  if(/^Parco Corto Maltese$/i.test(expanded))aliases.push('Parco Corto Maltese, Via Gianluigi Bonelli');
  if(/^Parco Agnelli$/i.test(expanded))aliases.push('Parco Agnelli, Via Elio Vittorini');
  if(intersection)aliases.push(`${intersection[1]} & ${intersection[2]}`,`${intersection[1]}, ${intersection[2]}`,intersection[1],intersection[2]);
  return[...new Set([expanded,...aliases,...parts,areaStripped,stripped].filter(Boolean))]
}

function classifyTreePage(html,url){
  const text=decodeHtml(html);
  if(!/alber|arbore|piantum|messa a dimora|abbattiment/i.test(text))return null;
  const published=sourceDate(text);
  const year=Number(published?.slice(0,4));
  if(!Number.isInteger(year)||year<2022)return null;
  const hasPlanting=/piantum|mess[aei]\s+a dimora|nuov[ei]\s+alber/i.test(text);
  const hasCut=/abbattiment|alber[oi]\s+abbattut/i.test(text);
  const eventType=hasPlanting&&!hasCut?'planting':hasCut&&!hasPlanting?'decrement':'unknown';
  const locations=treeLocations(text);
  const locationName=(locations[0]||'Roma').slice(0,180);
  const planned=/saranno?\s+(?:messi|effettuat|abbattut)|(?:sarà|verrà|verranno?)\s+(?:mess[oa]|effettuat[oa]|abbattut[oa])|in previsione|programmati?|previsti?/i.test(text);
  const executed=/sono stati effettuati|intervento eseguito|sono stati messi a dimora|già (?:messi a dimora|piantati)|data di esecuzione/i.test(text);
  const structuredNotice=/\/informazione-di-servizio\.page/i.test(url);
  const documentedScope=structuredNotice&&locations.length>=1&&eventType!=='unknown';
  const status=planned?'planned':executed&&documentedScope?(eventType==='decrement'?'emergency_completed':'completed'):'reported';
  const quantity=documentedScope?treeQuantity(text):null;
  const validation=executed&&documentedScope&&Number.isFinite(quantity)
    ?'automatic_confirmed'
    :'automatic_pending';
  const sourceKey=new URL(url).searchParams.get('contentId')||new URL(url).pathname;
  return{
    sourceKey,year,eventDate:published,locationName,locations,eventType,
    quantity:Number.isFinite(quantity)?quantity:null,status,validation,
    title:titleFromHtml(html),sourceUrl:url,sourcePublishedAt:published,
    rawExcerpt:text.slice(0,1000)
  }
}

async function discoverTreePages(){
  const links=new Set();
  for(const sourceUrl of TREE_SOURCE_LISTS){
    const response=await fetch(sourceUrl,{headers:{Accept:'text/html','User-Agent':'A.R.I.A. environmental-data-indexer/1.0'}});
    if(!response.ok)throw new Error(`Fonte Roma Capitale HTTP ${response.status}`);
    treeSourceLinks(await response.text()).forEach(link=>links.add(link))
  }
  return[...links].slice(0,TREE_MAX_PAGES_PER_RUN)
}

async function upsertTreeEvent(db,event,now){
  const existing=await db.prepare('SELECT id FROM tree_events WHERE source_key = ?').bind(event.sourceKey).first();
  await db.prepare(`
    INSERT INTO tree_events (
      source_key,city,year,event_date,location_name,locations_json,event_type,quantity,status,
      validation,title,source_url,source_published_at,first_seen_at,last_checked_at,
      raw_excerpt,updated_at
    ) VALUES (?, 'roma', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(source_key) DO UPDATE SET
      year=excluded.year,event_date=excluded.event_date,
      latitude=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.latitude END,
      longitude=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.longitude END,
      geocode_precision=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.geocode_precision END,
      geocode_label=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.geocode_label END,
      geocoded_at=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.geocoded_at END,
      location_points_json=CASE WHEN COALESCE(tree_events.locations_json,'')!=excluded.locations_json THEN NULL ELSE tree_events.location_points_json END,
      location_name=excluded.location_name,
      locations_json=excluded.locations_json,
      event_type=excluded.event_type,quantity=excluded.quantity,status=excluded.status,
      validation=CASE
        WHEN tree_events.validation IN ('manual_confirmed','manual_rejected') THEN tree_events.validation
        ELSE excluded.validation
      END,
      title=excluded.title,source_url=excluded.source_url,
      source_published_at=excluded.source_published_at,last_checked_at=excluded.last_checked_at,
      raw_excerpt=excluded.raw_excerpt,updated_at=excluded.updated_at
  `).bind(
    event.sourceKey,event.year,event.eventDate,event.locationName,JSON.stringify(event.locations),event.eventType,
    event.quantity,event.status,event.validation,event.title,event.sourceUrl,
    event.sourcePublishedAt,now,now,event.rawExcerpt,now
  ).run();
  return existing?'updated':'inserted'
}

function wait(milliseconds){
  return new Promise(resolve=>setTimeout(resolve,milliseconds))
}

async function geocodePendingTreeEvents(db){
  const pending=await db.prepare(`
    SELECT source_key,location_name,locations_json,location_points_json FROM tree_events
    WHERE city='roma' AND geocoded_at IS NULL AND location_name!='Roma'
    ORDER BY first_seen_at ASC LIMIT ?
  `).bind(TREE_MAX_GEOCODES_PER_RUN).all();
  let geocoded=0,rejected=0,attempted=0;
  for(const [index,row] of (pending.results||[]).entries()){
    const locations=JSON.parse(row.locations_json||'null')||[row.location_name];
    const points=JSON.parse(row.location_points_json||'null')||Array(locations.length).fill(null);
    for(let locationIndex=0;locationIndex<locations.length&&attempted<TREE_MAX_GEOCODES_PER_RUN;locationIndex+=1){
      if(points[locationIndex])continue;
      if(attempted||index)await wait(1100);
      attempted+=1;
      try{
        let match=null,latitude=null,longitude=null,inside=false;
        for(const [candidateIndex,candidate] of treeGeocodeQueries(locations[locationIndex]).entries()){
          if(candidateIndex)await wait(1100);
          const url=new URL('https://nominatim.openstreetmap.org/search');
          url.searchParams.set('format','jsonv2');
          url.searchParams.set('limit','1');
          url.searchParams.set('countrycodes','it');
          url.searchParams.set('q',`${candidate}, Roma, Italia`);
          const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'A.R.I.A. environmental-data-indexer/0.8 (https://fabzip.github.io/qualita-aria/)','Referer':'https://fabzip.github.io/qualita-aria/'}});
          if(!response.ok)throw new Error(`Geocoding HTTP ${response.status}`);
          match=(await response.json())?.[0]||null;
          latitude=Number(match?.lat);longitude=Number(match?.lon);
          inside=Number.isFinite(latitude)&&Number.isFinite(longitude)&&longitude>=ROME_GEOCODE_BBOX.west&&longitude<=ROME_GEOCODE_BBOX.east&&latitude>=ROME_GEOCODE_BBOX.south&&latitude<=ROME_GEOCODE_BBOX.north;
          if(inside)break
        }
        points[locationIndex]={coordinates:inside?[longitude,latitude]:null,precision:inside?'address':'unresolved',label:String(match?.display_name||'').slice(0,300)};
        if(inside)geocoded++;else rejected++
      }catch{
        points[locationIndex]={coordinates:null,precision:'unresolved',label:''};
        rejected++
      }
    }
    const complete=points.length===locations.length&&points.every(Boolean);
    const firstResolved=points.find(point=>Array.isArray(point?.coordinates));
    await db.prepare(`UPDATE tree_events SET latitude=?,longitude=?,geocode_precision=?,geocode_label=?,location_points_json=?,geocoded_at=? WHERE source_key=?`)
      .bind(firstResolved?.coordinates?.[1]??null,firstResolved?.coordinates?.[0]??null,firstResolved?.precision||'unresolved',firstResolved?.label||'',JSON.stringify(points),complete?new Date().toISOString():null,row.source_key).run();
    if(attempted>=TREE_MAX_GEOCODES_PER_RUN)break
  }
  return{geocoded,rejected,attempted,pending:(pending.results||[]).length}
}

async function refreshTreeSources(env){
  if(!env.TREE_DB)throw new Error('Binding D1 TREE_DB non configurato');
  const startedAt=new Date().toISOString();
  const run=await env.TREE_DB.prepare(
    "INSERT INTO tree_sync_runs(started_at,status) VALUES (?,'running') RETURNING id"
  ).bind(startedAt).first();
  let discovered=0,inserted=0,updated=0,errors=0;
  try{
    const links=await discoverTreePages();
    discovered=links.length;
    for(const link of links){
      try{
        const response=await fetch(link,{headers:{Accept:'text/html','User-Agent':'A.R.I.A. environmental-data-indexer/1.0'}});
        if(!response.ok)throw new Error(`HTTP ${response.status}`);
        const event=classifyTreePage(await response.text(),link);
        if(!event)continue;
        const action=await upsertTreeEvent(env.TREE_DB,event,new Date().toISOString());
        if(action==='inserted')inserted++;else updated++
      }catch{errors++}
    }
    const geocoding=await geocodePendingTreeEvents(env.TREE_DB);
    await env.TREE_DB.prepare(`UPDATE tree_sync_runs SET completed_at=?,status='completed',discovered=?,inserted=?,updated=?,errors=? WHERE id=?`)
      .bind(new Date().toISOString(),discovered,inserted,updated,errors,run.id).run();
    return{ok:true,discovered,inserted,updated,errors,geocoding,startedAt,completedAt:new Date().toISOString()}
  }catch(error){
    await env.TREE_DB.prepare(`UPDATE tree_sync_runs SET completed_at=?,status='failed',discovered=?,inserted=?,updated=?,errors=?,detail=? WHERE id=?`)
      .bind(new Date().toISOString(),discovered,inserted,updated,errors+1,String(error?.message||error).slice(0,500),run.id).run();
    throw error
  }
}

async function treeEventsResponse(env,cors,url){
  if(!env.TREE_DB)return json({error:'Archivio arboreo dinamico non configurato'},503,{...cors,'Cache-Control':'no-store'});
  const city=String(url.searchParams.get('city')||'roma').toLowerCase();
  const year=Number(url.searchParams.get('year'));
  if(city!=='roma')return badRequest('Città non supportata',cors);
  if(!Number.isInteger(year)||year<2013||year>new Date().getUTCFullYear())return badRequest('Anno non valido',cors);
  const result=await env.TREE_DB.prepare(`
    SELECT source_key,year,event_date,location_name,locations_json,location_points_json,district,event_type,quantity,latitude,longitude,geocode_precision,
      status,validation,title,source_url,source_published_at,first_seen_at,last_checked_at
    FROM tree_events
    WHERE city=? AND year=? AND validation!='manual_rejected'
    ORDER BY COALESCE(event_date,source_published_at) DESC, id DESC
  `).bind(city,year).all();
  const events=(result.results||[]).map(row=>{
    const locations=JSON.parse(row.locations_json||'null')||[row.location_name];
    const points=JSON.parse(row.location_points_json||'null')||[];
    const markerCoordinates=points.map(point=>point?.coordinates).filter(coordinates=>Array.isArray(coordinates));
    return{
    id:`dynamic-${row.source_key}`,year:String(row.year),date:row.event_date||row.source_published_at||String(row.year),
    locationName:locations.join(' · '),locations,district:row.district||undefined,
    eventType:row.event_type,status:row.status,quantity:row.quantity,
    coordinates:markerCoordinates[0]||(Number.isFinite(row.longitude)&&Number.isFinite(row.latitude)?[row.longitude,row.latitude]:undefined),
    markerCoordinates:markerCoordinates.length?markerCoordinates:undefined,
    locationPrecision:row.geocode_precision||(row.location_name==='Roma'?'city':'address'),
    validation:row.validation,title:row.title,sourceUrl:row.source_url,
    firstSeenAt:row.first_seen_at,lastCheckedAt:row.last_checked_at
  }});
  const lastRun=await env.TREE_DB.prepare("SELECT completed_at,status,discovered,inserted,updated,errors FROM tree_sync_runs ORDER BY id DESC LIMIT 1").first();
  return json({source:'Roma Capitale · aggiornamento automatico settimanale',city,year,events,lastSync:lastRun||null},200,{...cors,'Cache-Control':'public, max-age=3600'})
}

function adminAuthorized(request,env){
  const expected=String(env.TREE_ADMIN_TOKEN||'');
  const supplied=String(request.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
  return Boolean(expected)&&supplied===expected
}

async function reviewTreeEvent(request,env,cors){
  if(!env.TREE_DB)return json({error:'Archivio arboreo dinamico non configurato'},503,{...cors,'Cache-Control':'no-store'});
  const body=await request.json().catch(()=>null);
  const sourceKey=String(body?.sourceKey||'').trim();
  const validation=String(body?.validation||'').trim();
  const status=String(body?.status||'').trim();
  const eventType=String(body?.eventType||'').trim();
  const quantity=body?.quantity===null?null:Number(body?.quantity);
  if(!sourceKey)return badRequest('sourceKey obbligatorio',cors);
  if(!['manual_confirmed','manual_rejected'].includes(validation))return badRequest('validation non valida',cors);
  if(!['completed','emergency_completed','planned','reported','unknown'].includes(status))return badRequest('status non valido',cors);
  if(!['planting','decrement','unknown'].includes(eventType))return badRequest('eventType non valido',cors);
  if(quantity!==null&&(!Number.isInteger(quantity)||quantity<0))return badRequest('quantity non valida',cors);
  const result=await env.TREE_DB.prepare(`
    UPDATE tree_events SET validation=?,status=?,event_type=?,quantity=?,
      location_name=COALESCE(?,location_name),updated_at=? WHERE source_key=?
  `).bind(validation,status,eventType,quantity,body?.locationName||null,new Date().toISOString(),sourceKey).run();
  if(!result.meta?.changes)return json({error:'Evento non trovato'},404,{...cors,'Cache-Control':'no-store'});
  return json({ok:true,sourceKey,validation,status,eventType,quantity},200,{...cors,'Cache-Control':'no-store'})
}

export default{
  async scheduled(controller,env,ctx){
    if(String(env.TREE_SYNC_ENABLED||'true')!=='true')return;
    ctx.waitUntil(refreshTreeSources(env))
  },
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    const origin=request.headers.get('Origin')||'';
    const cors=corsHeaders(origin);

    if(cors===null){
      return json({error:'Origin non autorizzata'},403)
    }

    if(request.method==='OPTIONS'){
      return new Response(null,{status:204,headers:cors})
    }

    if(request.method==='POST'&&url.pathname==='/v1/trees/refresh'){
      if(!adminAuthorized(request,env))return json({error:'Non autorizzato'},401,{...cors,'Cache-Control':'no-store'});
      try{return json(await refreshTreeSources(env),200,{...cors,'Cache-Control':'no-store'})}
      catch(error){return json({error:String(error?.message||error)},502,{...cors,'Cache-Control':'no-store'})}
    }

    if(request.method==='POST'&&url.pathname==='/v1/trees/review'){
      if(!adminAuthorized(request,env))return json({error:'Non autorizzato'},401,{...cors,'Cache-Control':'no-store'});
      return reviewTreeEvent(request,env,cors)
    }

    if(request.method!=='GET'){
      return json({error:'Metodo non consentito'},405,{
        ...cors,
        Allow:'GET,OPTIONS'
      })
    }

    if(url.pathname==='/health'){
      return json({
        ok:true,
        service:'qualita-aria-temperature-proxy',
        version:'0.8.5',
        era5Land:true,
        observedStations:true,
        arpaLazioPhysical:true,
        nceiGlobalSummaryOfYear:true,
        meteostatObservationOnlyFallback:true,
        modeledTemperatureAccepted:false,
        stationCoverageThresholdPct:OBSERVED_COVERAGE_MIN*100,
        historicalFrom:1950,
        treeEventsDynamic:Boolean(env.TREE_DB),
        treeSyncSchedule:'0 3 * * 1',
        cacheSeconds:CACHE_TTL
      },200,{
        ...cors,
        'Cache-Control':'no-store'
      })
    }

    if(url.pathname==='/v1/temperature'){
      const bbox=bboxNumbers(url.searchParams.get('bbox'));
      const year=yearParam(url.searchParams.get('year'));

      if(!bbox)return badRequest('Bounding box non valida',cors);
      if(year===null){
        return badRequest(
          'Anno non valido: sono ammessi anni completi dal 1950.',
          cors
        )
      }

      return eraViewportResponse(ctx,cors,{bbox,year})
    }

    if(url.pathname==='/v1/observed'){
      const bbox=bboxNumbers(url.searchParams.get('bbox'));
      const year=yearParam(url.searchParams.get('year'));
      const pollutantSource=String(
        url.searchParams.get('pollutantSource')||''
      ).trim().toLowerCase();

      if(!bbox)return badRequest('Bounding box non valida',cors);
      if(year===null)return badRequest('Anno non valido',cors);
      if(!['arpa','eea'].includes(pollutantSource)){
        return badRequest(
          'pollutantSource deve essere arpa oppure eea.',
          cors
        )
      }

      return observedResponse(ctx,cors,{
        pollutantSource,
        year,
        bbox
      })
    }

    if(url.pathname==='/v1/trees/events'){
      return treeEventsResponse(env,cors,url)
    }

    return json({
      error:'Endpoint non trovato',
      endpoints:[
        '/health',
        '/v1/trees/events?city=roma&year=2026',
        '/v1/temperature?bbox=12.2,41.7,12.8,42.1&year=2025',
        '/v1/observed?pollutantSource=arpa&bbox=12.1,41.7,12.8,42.1&year=2025',
        '/v1/observed?pollutantSource=eea&bbox=9,45,10,46&year=2025'
      ]
    },404,cors)
  }
};
