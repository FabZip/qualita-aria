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

function validBbox(value){
  if(value===null||value===undefined||value==='')return'';

  const parts=String(value).split(',').map(Number);
  if(parts.length!==4||parts.some(v=>!Number.isFinite(v)))return null;

  const[minLon,minLat,maxLon,maxLat]=parts;
  if(
    minLon < -180 || maxLon > 180 ||
    minLat < -90 || maxLat > 90 ||
    minLon >= maxLon || minLat >= maxLat
  )return null;

  return parts.map(v=>Number(v.toFixed(4))).join(',')
}

function validDate(value){
  if(value===null||value===undefined||value==='')return'';
  const raw=String(value).trim();

  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return raw;

  const d=new Date(raw);
  return Number.isNaN(d.getTime())?null:d.toISOString()
}

function cacheTtl(route,year=null){
  if(route==='latest')return 900;       // 15 minuti
  if(route==='locations')return 86400;  // 24 ore
  if(route==='location')return 86400;   // 24 ore

  if(route==='yearly'){
    const currentYear=new Date().getUTCFullYear();
    return Number(year)===currentYear?21600:604800; // 6 ore / 7 giorni
  }

  return 300
}

function cacheKeyFor(request,origin){
  const url=new URL(request.url);

  // The response carries an origin-specific CORS header, therefore the origin
  // is part of the internal cache key.
  url.searchParams.set('__qa_origin',origin||'server');

  return new Request(url.toString(),{method:'GET'})
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
  const key=cacheKeyFor(request,origin);
  const cache=caches.default;

  try{
    const hit=await cache.match(key);
    if(hit){
      const response=new Response(hit.body,hit);
      response.headers.set('X-Proxy-Cache','HIT');
      return response
    }
  }catch{
    // Cache API has no effect in some local/dashboard preview environments.
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

  if(response.ok){
    try{
      ctx.waitUntil(cache.put(key,proxied.clone()))
    }catch{
      // Non bloccare la risposta se la cache non è disponibile.
    }
  }

  return proxied
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
        version:'0.1.0',
        openaqConfigured:Boolean(env.OPENAQ_API_KEY),
        upstream:'OpenAQ API v3'
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
    const page=intParam(url.searchParams.get('page'),{min:1,max:10,defaultValue:1});

    if(url.pathname==='/v1/locations'){
      if(!pollutant)return badRequest('Inquinante non supportato',cors);
      if(page===null)return badRequest('Pagina non valida: consentiti valori da 1 a 10',cors);

      const iso=validIso(url.searchParams.get('iso'));
      const bbox=validBbox(url.searchParams.get('bbox'));

      if(iso===null)return badRequest('Codice ISO non valido',cors);
      if(bbox===null)return badRequest('Bounding box non valida',cors);

      const params=new URLSearchParams({
        parameters_id:String(pollutant.id),
        monitor:'true',
        mobile:'false',
        limit:'1000',
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
      if(page===null)return badRequest('Pagina non valida: consentiti valori da 1 a 10',cors);

      const datetimeMin=validDate(url.searchParams.get('datetime_min'));
      if(datetimeMin===null)return badRequest('datetime_min non valido',cors);

      const params=new URLSearchParams({
        limit:'1000',
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
        limit:'1000',
        page:'1'
      });

      return cachedOpenAQ({
        request,env,ctx,origin,
        route:'yearly',
        year,
        endpoint:`/sensors/${sensor}/days/yearly?${params}`
      })
    }

    return json({
      error:'Endpoint non trovato',
      available:[
        '/health',
        '/v1/locations?pollutant=pm25&page=1',
        '/v1/latest?pollutant=pm25&page=1',
        '/v1/location?id=2178',
        '/v1/yearly?sensor=3920&year=2025'
      ]
    },404,cors)
  }
};
