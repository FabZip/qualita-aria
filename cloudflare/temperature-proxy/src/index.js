const OPEN_METEO_ARCHIVE='https://archive-api.open-meteo.com/v1/archive';

const PROD_ORIGIN='https://fabzip.github.io';
const NATIVE_RESOLUTION_DEG=0.1;
const MAX_GRID_POINTS=25;
const MAX_BBOX_WIDTH=8;
const MAX_BBOX_HEIGHT=6;
const CACHE_TTL=2592000;

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
  if(!Number.isInteger(year)||year<1950||year>lastCompleteYear)return null;
  return year
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
  for(let lat=latStart;lat<=latEnd+1e-9;lat=Number((lat+step).toFixed(4))){
    for(let lon=lonStart;lon<=lonEnd+1e-9;lon=Number((lon+step).toFixed(4))){
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

function internalCacheRequest(year,grid){
  const url=new URL('https://qualita-aria-temperature-cache.invalid/year');
  url.searchParams.set('year',String(year));
  url.searchParams.set(
    'points',
    grid.points
      .map(point=>`${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`)
      .join(';')
  );
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

function finite(values){
  return(Array.isArray(values)?values:[])
    .map(Number)
    .filter(Number.isFinite)
}

function annualStats(daily){
  const means=finite(daily?.temperature_2m_mean);
  const mins=finite(daily?.temperature_2m_min);
  const maxs=finite(daily?.temperature_2m_max);

  if(!means.length||!mins.length||!maxs.length)return null;

  return{
    mean:Number(
      (means.reduce((sum,value)=>sum+value,0)/means.length).toFixed(2)
    ),
    min:Number(Math.min(...mins).toFixed(2)),
    max:Number(Math.max(...maxs).toFixed(2)),
    observations:means.length
  }
}

async function temperatureResponse(ctx,cors,{bbox,year}){
  const width=bbox[2]-bbox[0];
  const height=bbox[3]-bbox[1];

  if(width>MAX_BBOX_WIDTH||height>MAX_BBOX_HEIGHT){
    return json({
      error:'Area temperatura troppo ampia. Aumenta lo zoom per caricare la griglia ERA5-Land.',
      code:'AREA_TOO_WIDE',
      bbox,
      maxWidth:MAX_BBOX_WIDTH,
      maxHeight:MAX_BBOX_HEIGHT
    },413,{...cors,'Cache-Control':'no-store'})
  }

  const grid=gridForBbox(bbox);
  const cacheRequest=internalCacheRequest(year,grid);
  const cached=await cacheGet(cacheRequest);

  if(cached){
    const body=await cached.arrayBuffer();
    const headers=new Headers(cached.headers);
    Object.entries(cors).forEach(([key,value])=>headers.set(key,value));
    headers.set('X-Proxy-Cache','HIT');

    return new Response(body,{
      status:200,
      headers
    })
  }

  const{start,end}=annualDates(year);
  const latitude=grid.points.map(point=>point.latitude).join(',');
  const longitude=grid.points.map(point=>point.longitude).join(',');

  const upstreamUrl=new URL(OPEN_METEO_ARCHIVE);
  upstreamUrl.searchParams.set('latitude',latitude);
  upstreamUrl.searchParams.set('longitude',longitude);
  upstreamUrl.searchParams.set('start_date',start);
  upstreamUrl.searchParams.set('end_date',end);
  upstreamUrl.searchParams.set(
    'daily',
    'temperature_2m_mean,temperature_2m_min,temperature_2m_max'
  );
  upstreamUrl.searchParams.set('models','era5_land');
  upstreamUrl.searchParams.set('timezone','GMT');
  upstreamUrl.searchParams.set('temperature_unit','celsius');
  upstreamUrl.searchParams.set('cell_selection','nearest');

  const started=Date.now();
  const upstream=await fetch(upstreamUrl.toString(),{
    headers:{Accept:'application/json'}
  });

  const payload=await upstream.json().catch(()=>null);
  if(!upstream.ok){
    return json({
      error:`Open-Meteo archive HTTP ${upstream.status}`,
      detail:payload?.reason||payload?.error||null
    },502,{...cors,'Cache-Control':'no-store'})
  }

  const locations=Array.isArray(payload)?payload:[payload];
  const seen=new Set();
  const results=[];

  locations.forEach((location,index)=>{
    const latitude=Number(location?.latitude);
    const longitude=Number(location?.longitude);
    const summary=annualStats(location?.daily);

    if(
      !Number.isFinite(latitude)||
      !Number.isFinite(longitude)||
      !summary
    )return;

    const key=`${latitude.toFixed(3)},${longitude.toFixed(3)}`;
    if(seen.has(key))return;
    seen.add(key);

    results.push({
      id:`era5-land:${key}`,
      name:`Cella ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
      latitude,
      longitude,
      elevation:Number.isFinite(Number(location?.elevation))
        ?Number(location.elevation)
        :null,
      ...summary,
      unit:'°C',
      requested:grid.points[index]||null
    })
  });

  const responsePayload={
    meta:{
      source:'Copernicus ERA5-Land via Open-Meteo',
      model:'ERA5-Land',
      variable:'temperature_2m',
      variableLabel:'Temperatura aria a 2 m',
      aggregation:'annual min / mean / max from daily aggregates',
      nativeResolutionDegrees:NATIVE_RESOLUTION_DEG,
      nativeResolutionApproxKm:'9–11',
      sampleStepDegrees:grid.sampleStepDegrees,
      requestedPoints:grid.points.length,
      returnedCells:results.length,
      bbox,
      year,
      startDate:start,
      endDate:end,
      upstreamMs:Date.now()-started,
      generatedAt:new Date().toISOString()
    },
    results
  };

  const cacheHeaders={
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':`public, max-age=${CACHE_TTL}`,
    'X-Content-Type-Options':'nosniff',
    'X-Proxy-Cache':'MISS',
    'X-Qualita-Aria-Proxy':'Temperature'
  };

  const serialized=JSON.stringify(responsePayload);
  cachePut(
    cacheRequest,
    new Response(serialized,{status:200,headers:cacheHeaders}),
    ctx
  );

  return new Response(serialized,{
    status:200,
    headers:{
      ...cacheHeaders,
      ...cors
    }
  })
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
        version:'0.2.0',
        source:'ERA5-Land via Open-Meteo',
        temperature2m:true,
        aggregation:'annual min / mean / max',
        historicalFrom:1950,
        maxGridPoints:MAX_GRID_POINTS,
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

      return temperatureResponse(ctx,cors,{bbox,year})
    }

    return json({
      error:'Endpoint non trovato',
      endpoints:[
        '/health',
        '/v1/temperature?bbox=12.2,41.7,12.8,42.1&year=2025'
      ]
    },404,cors)
  }
};
