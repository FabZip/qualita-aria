const OPENAQ_BASE='https://api.openaq.org/v3';

const PARAMETERS={
  pm10:{id:1,label:'PM10',units:'µg/m³'},
  pm25:{id:2,label:'PM2.5',units:'µg/m³'},
  no2:{id:7,label:'NO₂',units:'ppm'},
  co:{id:8,label:'CO',units:'ppm'},
  so2:{id:9,label:'SO₂',units:'ppm'},
  o3:{id:10,label:'O₃',units:'ppm'}
};

const PROD_ORIGIN='https://fabzip.github.io';
const PAGE_LIMIT=1000;
const MAX_UPSTREAM_PAGES=20;

/*
 * OpenAQ general-use keys are rate limited. A viewport request therefore
 * intentionally refuses overly dense areas instead of silently truncating.
 * One discovery query + at most 40 location/latest queries stays below the
 * normal per-minute budget; one automatic 4-way split is also supported.
 */
const VIEWPORT_MAX_RECENT_LOCATIONS=40;
const VIEWPORT_MAX_BBOX_WIDTH=60;
const VIEWPORT_MAX_BBOX_HEIGHT=45;
const VIEWPORT_SPLIT_DEPTH=1;
const VIEWPORT_LATEST_TTL=1800;

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

function intParam(value,{min=1,max=Number.MAX_SAFE_INTEGER,defaultValue=null}={}){
  if(value===null||value===undefined||value==='')return defaultValue;
  const n=Number(value);
  if(!Number.isInteger(n)||n<min||n>max)return null;
  return n
}

function pollutantParam(value){
  const key=String(value||'pm25')
    .trim()
    .toLowerCase()
    .replace('pm2.5','pm25');

  return PARAMETERS[key]?{key,...PARAMETERS[key]}:null
}

function validIso(value){
  if(value===null||value===undefined||value==='')return'';
  const iso=String(value).trim().toUpperCase();
  return/^[A-Z]{2}$/.test(iso)?iso:null
}

function bboxNumbers(value){
  if(value===null||value===undefined||value==='')return null;
  const parts=String(value).split(',').map(Number);
  if(parts.length!==4||parts.some(v=>!Number.isFinite(v)))return null;

  const[minLon,minLat,maxLon,maxLat]=parts;
  if(
    minLon < -180 || maxLon > 180 ||
    minLat < -90 || maxLat > 90 ||
    minLon >= maxLon || minLat >= maxLat
  )return null;

  return parts.map(v=>Number(v.toFixed(4)))
}

function validBbox(value){
  const parts=bboxNumbers(value);
  return parts?parts.join(','):null
}

function validDate(value){
  if(value===null||value===undefined||value==='')return'';
  const raw=String(value).trim();

  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;

  const d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d.toISOString()
}

function cacheTtl(route,year=null){
  if(route==='latest')return 900;
  if(route==='world_latest')return 1800;
  if(route==='viewport_latest')return VIEWPORT_LATEST_TTL;
  if(route==='locations')return 86400;
  if(route==='location')return 86400;

  if(route==='yearly'||route==='years'){
    const currentYear=new Date().getUTCFullYear();
    return Number(year)===currentYear?21600:604800
  }

  return 300
}

function cacheKeyFor(request,origin){
  const url=new URL(request.url);
  url.searchParams.set('__qa_origin',origin||'server');
  return new Request(url.toString(),{method:'GET'})
}

async function cacheMatch(request,origin){
  try{
    return await caches.default.match(cacheKeyFor(request,origin))
  }catch{
    return null
  }
}

function cachePut(request,origin,response,ctx){
  try{
    ctx.waitUntil(caches.default.put(cacheKeyFor(request,origin),response.clone()))
  }catch{}
}

function internalCacheRequest(path,params={}){
  const url=new URL(`https://qualita-aria-cache.invalid/${path}`);
  Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,String(value)));
  return new Request(url.toString(),{method:'GET'})
}

async function internalJsonCacheGet(request){
  try{
    const hit=await caches.default.match(request);
    if(!hit)return null;
    return await hit.json()
  }catch{
    return null
  }
}

function internalJsonCachePut(request,payload,ctx,ttl=VIEWPORT_LATEST_TTL){
  try{
    const response=json(payload,200,{'Cache-Control':`public, max-age=${ttl}`});
    ctx.waitUntil(caches.default.put(request,response))
  }catch{}
}

async function openAqJson(env,endpoint){
  const response=await fetch(`${OPENAQ_BASE}${endpoint}`,{
    headers:{
      'Accept':'application/json',
      'X-API-Key':env.OPENAQ_API_KEY
    }
  });

  const payload=await response.json().catch(()=>null);
  if(!response.ok){
    const detail=payload?.detail||payload?.error||`HTTP ${response.status}`;
    const error=new Error(typeof detail==='string'?detail:JSON.stringify(detail));
    error.status=response.status;
    throw error
  }

  return payload||{results:[],meta:{}}
}

async function openAqPages(env,endpointForPage,{maxPages=MAX_UPSTREAM_PAGES}={}){
  const first=await openAqJson(env,endpointForPage(1));
  const firstRows=Array.isArray(first?.results)?first.results:[];
  const foundRaw=Number(first?.meta?.found);
  const found=Number.isFinite(foundRaw)?foundRaw:null;
  const rows=[...firstRows];

  if(firstRows.length<PAGE_LIMIT){
    return{rows,found:found??firstRows.length,pages:1,truncated:false}
  }

  if(found!==null){
    const requestedPages=Math.max(1,Math.ceil(found/PAGE_LIMIT));
    const totalPages=Math.min(maxPages,requestedPages);

    for(let start=2;start<=totalPages;start+=5){
      const numbers=[];
      for(let page=start;page<Math.min(start+5,totalPages+1);page++)numbers.push(page);
      const batch=await Promise.all(numbers.map(page=>openAqJson(env,endpointForPage(page))));
      batch.forEach(payload=>rows.push(...(Array.isArray(payload?.results)?payload.results:[])))
    }

    return{
      rows,
      found,
      pages:totalPages,
      truncated:requestedPages>totalPages
    }
  }

  let pages=1;
  for(let page=2;page<=maxPages;page++){
    const payload=await openAqJson(env,endpointForPage(page));
    const chunk=Array.isArray(payload?.results)?payload.results:[];
    rows.push(...chunk);
    pages=page;
    if(chunk.length<PAGE_LIMIT)return{rows,found:rows.length,pages,truncated:false}
  }

  return{rows,found:rows.length,pages:maxPages,truncated:true}
}

async function cachedOpenAQ({
  request,
  env,
  ctx,
  origin,
  endpoint,
  route,
  year=null
}){
  const ttl=cacheTtl(route,year);
  const hit=await cacheMatch(request,origin);
  if(hit){
    const response=new Response(hit.body,hit);
    response.headers.set('X-Proxy-Cache','HIT');
    return response
  }

  const upstream=new URL(`${OPENAQ_BASE}${endpoint}`);
  const response=await fetch(upstream.toString(),{
    headers:{
      'Accept':'application/json',
      'X-API-Key':env.OPENAQ_API_KEY
    }
  });

  const body=await response.arrayBuffer();
  const headers=new Headers({
    'Content-Type':response.headers.get('Content-Type')||'application/json; charset=utf-8',
    'Cache-Control':response.ok?`public, max-age=${ttl}`:'no-store',
    'X-Content-Type-Options':'nosniff',
    'X-Qualita-Aria-Proxy':'OpenAQ',
    'X-OpenAQ-Endpoint':endpoint,
    'X-Proxy-Cache':'MISS'
  });

  const cors=corsHeaders(origin);
  Object.entries(cors||{}).forEach(([name,value])=>headers.set(name,value));

  const proxied=new Response(body,{
    status:response.status,
    statusText:response.statusText,
    headers
  });

  if(response.ok)cachePut(request,origin,proxied,ctx);
  return proxied
}

function locationEndpoint(pollutant,bbox){
  const params=new URLSearchParams({
    parameters_id:String(pollutant.id),
    monitor:'true',
    mobile:'false',
    bbox:bbox.join(','),
    limit:String(PAGE_LIMIT),
    page:'1'
  });
  return `/locations?${params}`
}

function splitBbox([minLon,minLat,maxLon,maxLat]){
  const midLon=(minLon+maxLon)/2;
  const midLat=(minLat+maxLat)/2;
  return[
    [minLon,minLat,midLon,midLat],
    [midLon,minLat,maxLon,midLat],
    [minLon,midLat,midLon,maxLat],
    [midLon,midLat,maxLon,maxLat]
  ].map(box=>box.map(v=>Number(v.toFixed(4))))
}

async function discoverViewportLocations(env,pollutant,bbox,stats,depth=0){
  stats.discoveryQueries++;
  const payload=await openAqJson(env,locationEndpoint(pollutant,bbox));
  const rows=Array.isArray(payload?.results)?payload.results:[];
  const foundRaw=Number(payload?.meta?.found);
  const found=Number.isFinite(foundRaw)?foundRaw:rows.length;

  if(found<=PAGE_LIMIT){
    return rows
  }

  if(depth>=VIEWPORT_SPLIT_DEPTH){
    const error=new Error('Area troppo densa anche dopo la suddivisione automatica.');
    error.code='AREA_TOO_DENSE';
    error.status=413;
    error.found=found;
    throw error
  }

  stats.splitApplied=true;
  const quadrants=splitBbox(bbox);
  const chunks=await Promise.all(
    quadrants.map(box=>discoverViewportLocations(env,pollutant,box,stats,depth+1))
  );
  return chunks.flat()
}

function locationTargetSensorIds(location,pollutant){
  return new Set(
    (Array.isArray(location?.sensors)?location.sensors:[])
      .filter(sensor=>Number(sensor?.parameter?.id)===Number(pollutant.id))
      .map(sensor=>Number(sensor.id))
      .filter(Number.isFinite)
  )
}

async function latestForLocation(env,ctx,location,pollutant,cutoffIso,maxAgeDays){
  const locationId=Number(location.id);
  const targetSensors=locationTargetSensorIds(location,pollutant);
  if(!targetSensors.size)return null;

  const cacheRequest=internalCacheRequest('location-latest',{
    location:locationId,
    pollutant:pollutant.id,
    days:maxAgeDays
  });

  let payload=await internalJsonCacheGet(cacheRequest);
  let cache='HIT';

  if(!payload){
    cache='MISS';
    const params=new URLSearchParams({
      limit:'100',
      page:'1',
      datetime_min:cutoffIso
    });
    payload=await openAqJson(env,`/locations/${locationId}/latest?${params}`);
    internalJsonCachePut(cacheRequest,payload,ctx)
  }

  const matches=(Array.isArray(payload?.results)?payload.results:[])
    .filter(measurement=>targetSensors.has(Number(measurement?.sensorsId)))
    .filter(measurement=>{
      const value=Number(measurement?.value);
      const time=Date.parse(measurement?.datetime?.utc||'');
      return Number.isFinite(value)&&value>=0&&Number.isFinite(time)&&time>=Date.parse(cutoffIso)
    })
    .sort((a,b)=>
      (Date.parse(b?.datetime?.utc||'')||0)-(Date.parse(a?.datetime?.utc||'')||0)
    );

  if(!matches.length)return null;

  return{measurement:matches[0],cache}
}

async function viewportLatest(request,env,ctx,origin,cors,pollutant,bbox,maxAgeDays){
  if(!['pm25','pm10'].includes(pollutant.key)){
    return badRequest('La mappa OpenAQ supporta per ora PM2.5 e PM10 in µg/m³',cors)
  }

  const width=bbox[2]-bbox[0];
  const height=bbox[3]-bbox[1];
  if(width>VIEWPORT_MAX_BBOX_WIDTH||height>VIEWPORT_MAX_BBOX_HEIGHT){
    return json({
      error:'Area troppo ampia. Aumenta lo zoom per caricare i dati OpenAQ della zona.',
      code:'AREA_TOO_WIDE',
      bbox,
      width:+width.toFixed(2),
      height:+height.toFixed(2)
    },413,{...cors,'Cache-Control':'no-store'})
  }

  const hit=await cacheMatch(request,origin);
  if(hit){
    const response=new Response(hit.body,hit);
    response.headers.set('X-Proxy-Cache','HIT');
    return response
  }

  const cutoffMs=Date.now()-maxAgeDays*86400_000;
  const cutoffIso=new Date(cutoffMs).toISOString();
  const stats={discoveryQueries:0,splitApplied:false};

  let discovered;
  try{
    discovered=await discoverViewportLocations(env,pollutant,bbox,stats)
  }catch(err){
    return json({
      error:err.message||'Impossibile suddividere l’area OpenAQ.',
      code:err.code||'OPENAQ_DISCOVERY_ERROR',
      upstreamStatus:err.status||null,
      found:err.found||null
    },err.status||502,{...cors,'Cache-Control':'no-store'})
  }

  const unique=new Map();
  for(const location of discovered){
    const id=Number(location?.id);
    if(!Number.isFinite(id))continue;
    if(!location?.isMonitor||location?.isMobile)continue;
    if(!locationTargetSensorIds(location,pollutant).size)continue;
    unique.set(id,location)
  }

  const allLocations=[...unique.values()];
  const recentCandidates=allLocations.filter(location=>{
    const last=Date.parse(location?.datetimeLast?.utc||'');
    return Number.isFinite(last)&&last>=cutoffMs
  });

  if(recentCandidates.length>VIEWPORT_MAX_RECENT_LOCATIONS){
    return json({
      error:`Area con ${recentCandidates.length} stazioni recenti. Aumenta lo zoom: il limite sicuro per una singola vista è ${VIEWPORT_MAX_RECENT_LOCATIONS}.`,
      code:'AREA_TOO_DENSE',
      locations:recentCandidates.length,
      maxLocations:VIEWPORT_MAX_RECENT_LOCATIONS,
      bbox
    },413,{...cors,'Cache-Control':'no-store'})
  }

  const latestRows=[];
  let locationLatestCacheHits=0;
  let locationLatestCacheMisses=0;

  /*
   * Process in small parallel batches. Total upstream calls are capped by
   * VIEWPORT_MAX_RECENT_LOCATIONS and cached per location for 30 minutes.
   */
  for(let start=0;start<recentCandidates.length;start+=8){
    const batch=recentCandidates.slice(start,start+8);
    const results=await Promise.all(batch.map(async location=>{
      try{
        return await latestForLocation(env,ctx,location,pollutant,cutoffIso,maxAgeDays)
      }catch(err){
        if(err.status===429)throw err;
        return null
      }
    }));

    results.forEach((result,index)=>{
      if(!result)return;
      if(result.cache==='HIT')locationLatestCacheHits++;
      else locationLatestCacheMisses++;

      const location=batch[index];
      const measurement=result.measurement;
      const coordinates=measurement?.coordinates||location?.coordinates||{};
      const latitude=Number(coordinates.latitude);
      const longitude=Number(coordinates.longitude);
      const datetimeUtc=measurement?.datetime?.utc||'';
      const time=Date.parse(datetimeUtc);

      if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||!Number.isFinite(time))return;

      latestRows.push({
        locationId:Number(location.id),
        sensorId:Number(measurement.sensorsId),
        name:location.name||location.locality||`OpenAQ ${location.id}`,
        locality:location.locality||'',
        countryCode:location.country?.code||'',
        countryName:location.country?.name||'',
        providerName:location.provider?.name||'',
        latitude,
        longitude,
        value:Number(measurement.value),
        datetimeUtc,
        datetimeLocal:measurement.datetime?.local||'',
        ageHours:+((Date.now()-time)/3600_000).toFixed(1),
        isMonitor:true
      })
    })
  }

  latestRows.sort((a,b)=>{
    const country=String(a.countryCode).localeCompare(String(b.countryCode));
    return country||String(a.name).localeCompare(String(b.name))
  });

  const payload={
    meta:{
      pollutant:{
        key:pollutant.key,
        id:pollutant.id,
        label:pollutant.label,
        units:pollutant.units
      },
      bbox,
      maxAgeDays,
      generatedAt:new Date().toISOString(),
      locationsDiscovered:allLocations.length,
      recentCandidates:recentCandidates.length,
      staleLocationsSkipped:Math.max(0,allLocations.length-recentCandidates.length),
      discoveryQueries:stats.discoveryQueries,
      splitApplied:stats.splitApplied,
      locationLatestCacheHits,
      locationLatestCacheMisses,
      count:latestRows.length
    },
    results:latestRows
  };

  const ttl=cacheTtl('viewport_latest');
  const response=json(payload,200,{
    ...cors,
    'Cache-Control':`public, max-age=${ttl}`,
    'X-Qualita-Aria-Proxy':'OpenAQ',
    'X-OpenAQ-Endpoint':`viewport/latest/${pollutant.key}`,
    'X-Proxy-Cache':'MISS'
  });

  cachePut(request,origin,response,ctx);
  return response
}

async function worldLatest(request,env,ctx,origin,cors,pollutant,maxAgeHours){
  if(!['pm25','pm10'].includes(pollutant.key)){
    return badRequest('La mappa mondiale supporta per ora PM2.5 e PM10 in µg/m³',cors)
  }

  const hit=await cacheMatch(request,origin);
  if(hit){
    const response=new Response(hit.body,hit);
    response.headers.set('X-Proxy-Cache','HIT');
    return response
  }

  const datetimeMin=new Date(Date.now()-maxAgeHours*3600_000).toISOString();
  const locationEndpointForPage=page=>{
    const params=new URLSearchParams({
      parameters_id:String(pollutant.id),
      monitor:'true',
      mobile:'false',
      limit:String(PAGE_LIMIT),
      page:String(page)
    });
    return `/locations?${params}`
  };
  const latestEndpoint=page=>{
    const params=new URLSearchParams({
      limit:String(PAGE_LIMIT),
      page:String(page),
      datetime_min:datetimeMin
    });
    return `/parameters/${pollutant.id}/latest?${params}`
  };

  let locationPages,latestPages;
  try{
    [locationPages,latestPages]=await Promise.all([
      openAqPages(env,locationEndpointForPage),
      openAqPages(env,latestEndpoint)
    ])
  }catch(err){
    return json({
      error:`OpenAQ upstream: ${err.message||err}`,
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }

  const locations=new Map();
  for(const location of locationPages.rows){
    if(!location?.isMonitor||location?.isMobile)continue;
    locations.set(Number(location.id),location)
  }

  const latestByLocation=new Map();
  for(const measurement of latestPages.rows){
    const locationId=Number(measurement?.locationsId);
    const location=locations.get(locationId);
    if(!location)continue;

    const value=Number(measurement?.value);
    if(!Number.isFinite(value)||value<0)continue;

    const current=latestByLocation.get(locationId);
    const nextTime=Date.parse(measurement?.datetime?.utc||'')||0;
    const currentTime=Date.parse(current?.datetime?.utc||'')||0;
    if(!current||nextTime>currentTime)latestByLocation.set(locationId,measurement)
  }

  const results=[];
  for(const [locationId,measurement] of latestByLocation){
    const location=locations.get(locationId);
    const coordinates=measurement?.coordinates||location?.coordinates||{};
    const latitude=Number(coordinates.latitude);
    const longitude=Number(coordinates.longitude);
    if(!Number.isFinite(latitude)||!Number.isFinite(longitude))continue;

    results.push({
      locationId,
      sensorId:Number(measurement.sensorsId),
      name:location.name||location.locality||`OpenAQ ${locationId}`,
      locality:location.locality||'',
      countryCode:location.country?.code||'',
      countryName:location.country?.name||'',
      providerName:location.provider?.name||'',
      latitude,
      longitude,
      value:Number(measurement.value),
      datetimeUtc:measurement.datetime?.utc||'',
      datetimeLocal:measurement.datetime?.local||'',
      isMonitor:true
    })
  }

  results.sort((a,b)=>{
    const country=String(a.countryCode).localeCompare(String(b.countryCode));
    return country||String(a.name).localeCompare(String(b.name))
  });

  const payload={
    meta:{
      pollutant:{
        key:pollutant.key,
        id:pollutant.id,
        label:pollutant.label,
        units:pollutant.units
      },
      maxAgeHours,
      generatedAt:new Date().toISOString(),
      locationsFound:locationPages.found,
      latestFound:latestPages.found,
      locationPages:locationPages.pages,
      latestPages:latestPages.pages,
      locationsTruncated:locationPages.truncated,
      latestTruncated:latestPages.truncated,
      count:results.length
    },
    results
  };

  const ttl=cacheTtl('world_latest');
  const response=json(payload,200,{
    ...cors,
    'Cache-Control':`public, max-age=${ttl}`,
    'X-Qualita-Aria-Proxy':'OpenAQ',
    'X-OpenAQ-Endpoint':`world/latest/${pollutant.key}`,
    'X-Proxy-Cache':'MISS'
  });
  cachePut(request,origin,response,ctx);
  return response
}

function badRequest(message,cors={}){
  return json({error:message},400,cors)
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
        'Allow':'GET,OPTIONS'
      })
    }

    if(url.pathname==='/health'){
      return json({
        ok:true,
        service:'qualita-aria-openaq-proxy',
        version:'0.3.0',
        openaqConfigured:Boolean(env.OPENAQ_API_KEY),
        upstream:'OpenAQ API v3',
        worldLatest:true,
        viewportLatest:true,
        viewportMaxRecentLocations:VIEWPORT_MAX_RECENT_LOCATIONS
      },200,{
        ...cors,
        'Cache-Control':'no-store'
      })
    }

    if(!env.OPENAQ_API_KEY){
      return json({
        error:'OPENAQ_API_KEY non configurata nel Worker'
      },503,cors)
    }

    const pollutant=pollutantParam(url.searchParams.get('pollutant'));
    const page=intParam(url.searchParams.get('page'),{min:1,max:20,defaultValue:1});

    if(url.pathname==='/v1/viewport/latest'){
      if(!pollutant)return badRequest('Inquinante non supportato',cors);

      const bbox=bboxNumbers(url.searchParams.get('bbox'));
      if(!bbox)return badRequest('Bounding box non valida',cors);

      const maxAgeDays=intParam(url.searchParams.get('max_age_days'),{
        min:1,max:30,defaultValue:30
      });
      if(maxAgeDays===null)return badRequest('max_age_days deve essere compreso tra 1 e 30',cors);

      return viewportLatest(request,env,ctx,origin,cors,pollutant,bbox,maxAgeDays)
    }

    if(url.pathname==='/v1/world/latest'){
      if(!pollutant)return badRequest('Inquinante non supportato',cors);
      const maxAgeHours=intParam(url.searchParams.get('max_age_hours'),{
        min:1,max:168,defaultValue:72
      });
      if(maxAgeHours===null)return badRequest('max_age_hours deve essere compreso tra 1 e 168',cors);
      return worldLatest(request,env,ctx,origin,cors,pollutant,maxAgeHours)
    }

    if(url.pathname==='/v1/locations'){
      if(!pollutant)return badRequest('Inquinante non supportato',cors);
      if(page===null)return badRequest('Pagina non valida: consentiti valori da 1 a 20',cors);

      const iso=validIso(url.searchParams.get('iso'));
      const bbox=validBbox(url.searchParams.get('bbox'));

      if(iso===null)return badRequest('Codice ISO non valido',cors);
      if(url.searchParams.has('bbox')&&bbox===null)return badRequest('Bounding box non valida',cors);

      const params=new URLSearchParams({
        parameters_id:String(pollutant.id),
        monitor:'true',
        mobile:'false',
        limit:String(PAGE_LIMIT),
        page:String(page)
      });

      if(iso)params.set('iso',iso);
      if(bbox)params.set('bbox',bbox);

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'locations',
        endpoint:`/locations?${params}`
      })
    }

    if(url.pathname==='/v1/latest'){
      if(!pollutant)return badRequest('Inquinante non supportato',cors);
      if(page===null)return badRequest('Pagina non valida: consentiti valori da 1 a 20',cors);

      const datetimeMin=validDate(url.searchParams.get('datetime_min'));
      if(datetimeMin===null)return badRequest('datetime_min non valido',cors);

      const params=new URLSearchParams({
        limit:String(PAGE_LIMIT),
        page:String(page)
      });

      if(datetimeMin)params.set('datetime_min',datetimeMin);

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'latest',
        endpoint:`/parameters/${pollutant.id}/latest?${params}`
      })
    }

    if(url.pathname==='/v1/location'){
      const id=intParam(url.searchParams.get('id'),{min:1,max:100000000});
      if(id===null)return badRequest('ID location non valido',cors);

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'location',
        endpoint:`/locations/${id}`
      })
    }

    if(url.pathname==='/v1/yearly'){
      const sensor=intParam(url.searchParams.get('sensor'),{min:1,max:100000000});
      const currentYear=new Date().getUTCFullYear();
      const year=intParam(url.searchParams.get('year'),{
        min:1900,
        max:currentYear,
        defaultValue:currentYear
      });

      if(sensor===null)return badRequest('ID sensor non valido',cors);
      if(year===null)return badRequest(`Anno non valido: massimo ${currentYear}`,cors);

      const params=new URLSearchParams({
        date_from:`${year}-01-01`,
        date_to:`${year}-12-31`,
        limit:'100',
        page:'1'
      });

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'yearly',
        year,
        endpoint:`/sensors/${sensor}/years?${params}`
      })
    }

    if(url.pathname==='/v1/years'){
      const sensor=intParam(url.searchParams.get('sensor'),{min:1,max:100000000});
      const currentYear=new Date().getUTCFullYear();
      const fromYear=intParam(url.searchParams.get('from_year'),{
        min:1900,max:currentYear,defaultValue:2000
      });
      const toYear=intParam(url.searchParams.get('to_year'),{
        min:1900,max:currentYear,defaultValue:currentYear
      });

      if(sensor===null)return badRequest('ID sensor non valido',cors);
      if(fromYear===null||toYear===null||fromYear>toYear){
        return badRequest('Intervallo anni non valido',cors)
      }
      if(toYear-fromYear>80)return badRequest('Intervallo anni troppo ampio',cors);

      const params=new URLSearchParams({
        date_from:`${fromYear}-01-01`,
        date_to:`${toYear}-12-31`,
        limit:'100',
        page:'1'
      });

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'years',
        year:toYear,
        endpoint:`/sensors/${sensor}/years?${params}`
      })
    }

    return json({
      error:'Endpoint non trovato',
      available:[
        '/health',
        '/v1/viewport/latest?pollutant=pm25&bbox=12,41,13,42&max_age_days=30',
        '/v1/world/latest?pollutant=pm25&max_age_hours=72',
        '/v1/locations?pollutant=pm25&page=1',
        '/v1/latest?pollutant=pm25&page=1',
        '/v1/location?id=2178',
        '/v1/yearly?sensor=3920&year=2025',
        '/v1/years?sensor=3920&from_year=2020&to_year=2025'
      ]
    },404,cors)
  }
};
