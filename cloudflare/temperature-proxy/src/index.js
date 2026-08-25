const OPEN_METEO_ARCHIVE='https://archive-api.open-meteo.com/v1/archive';
const NCEI_GSOY_STATIONS='https://gis.ncdc.noaa.gov/arcgis/rest/services/cdo/stations/MapServer/9/query';
const NCEI_DATA='https://www.ncei.noaa.gov/access/services/data/v1';
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
    'Access-Control-Allow-Methods':'GET,OPTIONS',
    'Access-Control-Allow-Headers':'Accept,Content-Type',
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
    min:fixed(average(mins)),
    mean:fixed(average(means)),
    max:fixed(average(maxs)),
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
        aggregation:'annual averages of daily min / mean / max',
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
      min:fixed(average(dailyMin)),
      mean:fixed(average(dailyMean)),
      max:fixed(average(dailyMax)),
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

  const key=cacheRequest('arpa-observed',{year});
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
 * TMIN = Mean Min Temp
 * TAVG = Annual Mean Temp
 * TMAX = Mean Max Temp
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
  url.searchParams.set('dataTypes','TAVG,TMIN,TMAX');
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

    const min=finiteNumber(record.TMIN??record.tmin);
    const mean=finiteNumber(record.TAVG??record.tavg);
    const max=finiteNumber(record.TMAX??record.tmax);

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
      annualElements:['TMIN','TAVG','TMAX'],
      upstreamMs:Date.now()-started,
      generatedAt:new Date().toISOString()
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

function mergeObservedPrioritizingArpa(arpa,ncei){
  const merged=[...arpa];

  for(const station of ncei){
    const duplicate=arpa.some(
      local=>haversineKm(local,station)<15
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

      try{
        ncei=await fetchNceiObserved(year,bbox)
      }catch(err){
        ncei={
          results:[],
          meta:{error:String(err.message||err)}
        }
      }

      const results=mergeObservedPrioritizingArpa(
        arpaResults,
        ncei.results||[]
      );

      return cacheableJson({
        meta:{
          pollutantSource,
          temperatureProvider:
            'Physical meteorological stations',
          providerStrategy:
            'ARPA Lazio in Lazio, then NOAA/NCEI Global Summary of the Year observational stations',
          sciaStatus:
            'SCIA/ISPRA remains preferred for future Italian integration but no compatible machine endpoint is used by this release.',
          type:'measured',
          year,
          bbox,
          arpa:arpaMeta,
          ncei:ncei.meta,
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

export default{
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
        version:'0.5.0',
        era5Land:true,
        observedStations:true,
        arpaLazioPhysical:true,
        nceiGlobalSummaryOfYear:true,
        stationCoverageThresholdPct:OBSERVED_COVERAGE_MIN*100,
        historicalFrom:1950,
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

    return json({
      error:'Endpoint non trovato',
      endpoints:[
        '/health',
        '/v1/temperature?bbox=12.2,41.7,12.8,42.1&year=2025',
        '/v1/observed?pollutantSource=arpa&bbox=12.1,41.7,12.8,42.1&year=2025',
        '/v1/observed?pollutantSource=eea&bbox=9,45,10,46&year=2025'
      ]
    },404,cors)
  }
};
