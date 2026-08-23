const EEA_SQL_API='https://discodata.eea.europa.eu/sql';
const EEA_DOWNLOAD_BASE='https://eeadmz1-downloads-api-appservice.azurewebsites.net';

const PROD_ORIGIN='https://fabzip.github.io';
const PAGE_SIZE=1000;
const ANNUAL_MAX_PAGES=20;
const METADATA_MAX_PAGES=5;

const EEA_UTD_DATASET=1;
const EEA_UTD_URL_TTL=21600;
const EEA_UTD_FILE_TTL=21600;
const EEA_UTD_MAX_FILES=100;
const EEA_UTD_MAX_FILE_BYTES=40*1024*1024;

const POLLUTANTS={
  'PM2.5':{code:6001,label:'PM2.5'},
  'PM10':{code:5,label:'PM10'},
  'NO2':{code:8,label:'NO₂'}
};

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

function validIso(value){
  const iso=String(value||'').trim().toUpperCase();
  return/^[A-Z]{2}$/.test(iso)?iso:null
}

function validCity(value){
  const city=String(value||'').trim();
  if(!city||city.length>100)return null;
  if(/[\u0000-\u001f<>?#{}\\]/.test(city))return null;
  return city
}

function pollutantParam(value){
  const raw=String(value||'')
    .trim()
    .toUpperCase()
    .replace(/\s+/g,'')
    .replace('PM25','PM2.5')
    .replace('NO₂','NO2');

  return POLLUTANTS[raw]?{key:raw,...POLLUTANTS[raw]}:null
}

function yearParam(value){
  const n=Number(value);
  const current=new Date().getUTCFullYear();
  return Number.isInteger(n)&&n>=2013&&n<=current?n:null
}

function intParam(value,{min=0,max=Number.MAX_SAFE_INTEGER,defaultValue=null}={}){
  if(value===null||value===undefined||value==='')return defaultValue;
  const n=Number(value);
  return Number.isInteger(n)&&n>=min&&n<=max?n:null
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

function normalizeText(value){
  return String(value??'').toLowerCase().replace(/\s+/g,' ').trim()
}

function numberOrNull(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number')return Number.isFinite(value)?value:null;

  const raw=String(value).trim();
  if(!raw||/^(?:-|--|n\/?a|n\.d\.?|nd|null)$/i.test(raw))return null;

  const n=Number(raw.replace(/[\u00a0\s]/g,'').replace(',','.'));
  return Number.isFinite(n)?n:null
}

function acceptedRank(value){
  return['1','true','yes','y'].includes(normalizeText(value))?100:0
}

function verificationRank(value){
  const n=normalizeText(value);
  if(n.includes('verified')&&!n.includes('unverified'))return 60;
  if(n.includes('unverified'))return 0;
  return 20
}

function recordScore(row){
  let score=acceptedRank(row.AcceptedforProducts)+verificationRank(row.Verification);
  const coverage=numberOrNull(row.DataCoverage??row.Timecoverage??row.DataCapture);
  if(coverage!==null)score+=Math.max(0,Math.min(100,coverage))/10;
  return score
}

function annualTtl(year){
  const current=new Date().getUTCFullYear();
  if(Number(year)>=current-1)return 21600;       // 6 ore per anno recente
  return 2592000;                               // 30 giorni per anni consolidati
}

function internalCacheRequest(path,params={}){
  const url=new URL(`https://qualita-aria-eea-cache.invalid/${path}`);
  Object.entries(params).forEach(([key,value])=>{
    url.searchParams.set(key,String(value))
  });
  return new Request(url.toString(),{method:'GET'})
}

async function cacheJsonGet(request){
  try{
    const hit=await caches.default.match(request);
    return hit?await hit.json():null
  }catch{
    return null
  }
}

function cacheJsonPut(request,payload,ctx,ttl){
  try{
    const response=json(payload,200,{
      'Cache-Control':`public, max-age=${ttl}`
    });
    ctx.waitUntil(caches.default.put(request,response))
  }catch{}
}

async function cacheBinaryGet(request){
  try{
    return await caches.default.match(request)
  }catch{
    return null
  }
}

function cacheBinaryPut(request,response,ctx){
  try{
    ctx.waitUntil(caches.default.put(request,response.clone()))
  }catch{}
}

function annualSql({year,pollutant,country,bbox}){
  const[minLon,minLat,maxLon,maxLat]=bbox;
  const countryFilter=country?`AND CountryCode='${country}'`:'';

  return`
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
WHERE YearOfStatistics=${year}
  AND component_code=${pollutant.code}
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

function metadataSql({year,country,bbox}){
  const[minLon,minLat,maxLon,maxLat]=bbox;
  const previous=Math.max(2013,year-1);

  return`
SELECT
  AirPollutant,
  AirPollutantCode,
  AirQualityStation,
  AirQualityStationEoICode,
  AQStationName,
  AirQualityStationArea,
  AirQualityStationType,
  CountryCode,
  Latitude,
  Longitude,
  ReportingYear,
  SampleId
FROM [AirQualityDataFlows].[latest].[Measurements]
WHERE CountryCode='${country}'
  AND Latitude BETWEEN ${minLat} AND ${maxLat}
  AND Longitude BETWEEN ${minLon} AND ${maxLon}
  AND (ReportingYear='${year}' OR ReportingYear='${previous}')
`.trim()
}

async function discodataPages(sql,{maxPages=20}={}){
  const rows=[];
  const started=Date.now();

  for(let page=1;page<=maxPages;page++){
    const url=`${EEA_SQL_API}?${new URLSearchParams({
      query:sql,
      p:String(page),
      nrOfHits:String(PAGE_SIZE)
    })}`;

    const response=await fetch(url,{
      headers:{Accept:'application/json'}
    });

    if(!response.ok){
      const error=new Error(`Discodata HTTP ${response.status} · pagina ${page}`);
      error.status=response.status;
      throw error
    }

    const data=await response.json().catch(()=>null);
    const chunk=Array.isArray(data?.results)?data.results:
      Array.isArray(data)?data:
      Array.isArray(data?.data)?data.data:[];

    rows.push(...chunk);

    if(chunk.length<PAGE_SIZE){
      return{
        rows,
        pages:page,
        truncated:false,
        upstreamMs:Date.now()-started
      }
    }
  }

  return{
    rows,
    pages:maxPages,
    truncated:true,
    upstreamMs:Date.now()-started
  }
}

function normalizeAnnualRows(raw){
  const best=new Map();

  for(const row of raw){
    const id=String(
      row.AirQualityStationEoICode||
      row.AirQualityStation||
      row.AQStationName||
      ''
    ).trim();

    const value=numberOrNull(row.AirPollutionLevel);
    const lat=numberOrNull(row.Latitude);
    const lon=numberOrNull(row.Longitude);

    if(!id||value===null||lat===null||lon===null)continue;

    const candidate={row,score:recordScore(row)};
    if(!best.has(id)||candidate.score>best.get(id).score){
      best.set(id,candidate)
    }
  }

  return[...best.entries()].map(([id,{row}])=>({
    id,
    name:String(row.AQStationName||row.AirQualityStation||id),
    country:String(row.CountryCode||''),
    lat:numberOrNull(row.Latitude),
    lon:numberOrNull(row.Longitude),
    value:numberOrNull(row.AirPollutionLevel),
    coverage:numberOrNull(row.DataCoverage??row.Timecoverage??row.DataCapture),
    verification:String(row.Verification||''),
    accepted:String(row.AcceptedforProducts??''),
    area:String(row.AirQualityStationArea||''),
    stationType:String(row.AirQualityStationType||''),
    kind:'station',
    provider:'EEA'
  })).sort((a,b)=>{
    const countryCmp=a.country.localeCompare(b.country);
    return countryCmp||a.name.localeCompare(b.name,'it')
  })
}

function pollutantMatchesMetadata(row,pollutant){
  const code=String(pollutant.code);
  const label=normalizeText(pollutant.key).replace('₂','2');

  return[row?.AirPollutantCode,row?.AirPollutant].some(value=>{
    const raw=String(value??'');
    const normalized=normalizeText(raw).replace('₂','2');

    return raw===code||
      raw.endsWith(`/${code}`)||
      raw.includes(`/pollutant/${code}`)||
      normalized.includes(label)
  })
}

async function annualResponse(ctx,cors,{year,pollutant,country,bbox}){
  const key=internalCacheRequest('annual',{
    year,
    pollutant:pollutant.key,
    country:country||'EU',
    bbox:bbox.join(',')
  });

  const cached=await cacheJsonGet(key);
  if(cached){
    return json(cached,200,{
      ...cors,
      'Cache-Control':`public, max-age=${annualTtl(year)}`,
      'X-Proxy-Cache':'HIT',
      'X-Qualita-Aria-Proxy':'EEA'
    })
  }

  try{
    const paged=await discodataPages(
      annualSql({year,pollutant,country,bbox}),
      {maxPages:ANNUAL_MAX_PAGES}
    );

    const results=normalizeAnnualRows(paged.rows);
    const payload={
      meta:{
        source:'EEA / Discodata',
        table:'AirQualityDataFlows.latest.AirQualityStatistics',
        flow:'E1a',
        year,
        pollutant:pollutant.key,
        componentCode:pollutant.code,
        country:country||null,
        bbox,
        pages:paged.pages,
        truncated:paged.truncated,
        rowsReceived:paged.rows.length,
        stations:results.length,
        upstreamMs:paged.upstreamMs,
        generatedAt:new Date().toISOString()
      },
      results
    };

    cacheJsonPut(key,payload,ctx,annualTtl(year));

    return json(payload,200,{
      ...cors,
      'Cache-Control':`public, max-age=${annualTtl(year)}`,
      'X-Proxy-Cache':'MISS',
      'X-Qualita-Aria-Proxy':'EEA'
    })
  }catch(err){
    return json({
      error:`EEA Discodata: ${err.message||err}`,
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }
}

async function metadataResponse(ctx,cors,{year,pollutant,country,bbox}){
  const key=internalCacheRequest('metadata',{
    year,
    pollutant:pollutant.key,
    country,
    bbox:bbox.join(',')
  });

  const cached=await cacheJsonGet(key);
  if(cached){
    return json(cached,200,{
      ...cors,
      'Cache-Control':'public, max-age=86400',
      'X-Proxy-Cache':'HIT',
      'X-Qualita-Aria-Proxy':'EEA'
    })
  }

  try{
    const paged=await discodataPages(
      metadataSql({year,country,bbox}),
      {maxPages:METADATA_MAX_PAGES}
    );

    const results=paged.rows.filter(
      row=>pollutantMatchesMetadata(row,pollutant)
    );

    const payload={
      meta:{
        source:'EEA / Discodata',
        table:'AirQualityDataFlows.latest.Measurements',
        year,
        pollutant:pollutant.key,
        country,
        bbox,
        pages:paged.pages,
        truncated:paged.truncated,
        rowsReceived:paged.rows.length,
        rowsMatched:results.length,
        upstreamMs:paged.upstreamMs,
        generatedAt:new Date().toISOString()
      },
      results
    };

    cacheJsonPut(key,payload,ctx,86400);

    return json(payload,200,{
      ...cors,
      'Cache-Control':'public, max-age=86400',
      'X-Proxy-Cache':'MISS',
      'X-Qualita-Aria-Proxy':'EEA'
    })
  }catch(err){
    return json({
      error:`EEA metadata: ${err.message||err}`,
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }
}

function parseParquetUrls(text){
  const matches=String(text||'').match(
    /https?:\/\/[^\s,"']+?\.parquet(?:\?[^\s,"']*)?/gi
  )||[];

  return[...new Set(matches)].slice(0,EEA_UTD_MAX_FILES)
}

async function utdUrls(ctx,{country,city,pollutant}){
  const key=internalCacheRequest('utd-urls',{
    country,
    city,
    pollutant:pollutant.key,
    dataset:EEA_UTD_DATASET
  });

  const cached=await cacheJsonGet(key);
  if(cached?.urls){
    return{...cached,cache:'HIT'}
  }

  const payload={
    countries:[country],
    cities:[city],
    pollutants:[pollutant.key],
    dataset:EEA_UTD_DATASET,
    source:'qualita-aria'
  };

  const started=Date.now();
  const response=await fetch(`${EEA_DOWNLOAD_BASE}/ParquetFile/urls`,{
    method:'POST',
    headers:{
      'Accept':'text/plain, text/csv, */*',
      'Content-Type':'application/json'
    },
    body:JSON.stringify(payload)
  });

  const text=await response.text();

  if(!response.ok){
    const error=new Error(
      `EEA Download API HTTP ${response.status}: ${text.slice(0,300)}`
    );
    error.status=response.status;
    throw error
  }

  const result={
    urls:parseParquetUrls(text),
    generatedAt:new Date().toISOString(),
    upstreamMs:Date.now()-started,
    country,
    city,
    pollutant:pollutant.key,
    dataset:'E2a/UTD',
    datasetId:EEA_UTD_DATASET
  };

  cacheJsonPut(key,result,ctx,EEA_UTD_URL_TTL);
  return{...result,cache:'MISS'}
}

async function utdFilesResponse(ctx,cors,{country,city,pollutant}){
  try{
    const result=await utdUrls(ctx,{country,city,pollutant});

    return json({
      meta:{
        country,
        city,
        pollutant:pollutant.key,
        dataset:'E2a/UTD',
        datasetId:EEA_UTD_DATASET,
        count:result.urls.length,
        cache:result.cache,
        upstreamMs:result.upstreamMs??0,
        generatedAt:result.generatedAt
      },
      files:result.urls.map((url,index)=>{
        let name=`utd-${index}.parquet`;
        try{
          name=decodeURIComponent(
            new URL(url).pathname.split('/').pop()||name
          )
        }catch{}
        return{index,name}
      })
    },200,{
      ...cors,
      'Cache-Control':`public, max-age=${EEA_UTD_URL_TTL}`,
      'X-Proxy-Cache':result.cache,
      'X-Qualita-Aria-Proxy':'EEA'
    })
  }catch(err){
    return json({
      error:`EEA UTD: ${err.message||err}`,
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }
}

async function utdFileResponse(ctx,cors,{country,city,pollutant,index}){
  const binaryKey=internalCacheRequest('utd-file',{
    country,
    city,
    pollutant:pollutant.key,
    index
  });

  const cached=await cacheBinaryGet(binaryKey);
  if(cached){
    const body=await cached.arrayBuffer();

    return new Response(body,{
      status:200,
      headers:{
        ...cors,
        'Content-Type':'application/octet-stream',
        'Content-Length':String(body.byteLength),
        'Cache-Control':`public, max-age=${EEA_UTD_FILE_TTL}`,
        'X-Content-Type-Options':'nosniff',
        'X-Proxy-Cache':'HIT',
        'X-Qualita-Aria-Proxy':'EEA'
      }
    })
  }

  try{
    const result=await utdUrls(ctx,{country,city,pollutant});
    const target=result.urls[index];

    if(!target){
      return json({
        error:'File EEA UTD non trovato',
        index,
        count:result.urls.length
      },404,cors)
    }

    const started=Date.now();
    const upstream=await fetch(target,{
      headers:{Accept:'application/octet-stream,*/*'}
    });

    if(!upstream.ok){
      return json({
        error:`Download file EEA UTD: HTTP ${upstream.status}`,
        index
      },502,{...cors,'Cache-Control':'no-store'})
    }

    const declared=Number(upstream.headers.get('content-length')||0);
    if(Number.isFinite(declared)&&declared>EEA_UTD_MAX_FILE_BYTES){
      return json({
        error:`File EEA UTD troppo grande (${Math.round(declared/1024/1024)} MB)`,
        code:'EEA_UTD_FILE_TOO_LARGE'
      },413,{...cors,'Cache-Control':'no-store'})
    }

    const body=await upstream.arrayBuffer();

    if(body.byteLength>EEA_UTD_MAX_FILE_BYTES){
      return json({
        error:`File EEA UTD troppo grande (${Math.round(body.byteLength/1024/1024)} MB)`,
        code:'EEA_UTD_FILE_TOO_LARGE'
      },413,{...cors,'Cache-Control':'no-store'})
    }

    const cachedResponse=new Response(body,{
      status:200,
      headers:{
        'Content-Type':'application/octet-stream',
        'Content-Length':String(body.byteLength),
        'Cache-Control':`public, max-age=${EEA_UTD_FILE_TTL}`,
        'X-EEA-Upstream-Ms':String(Date.now()-started)
      }
    });

    cacheBinaryPut(binaryKey,cachedResponse,ctx);

    return new Response(body,{
      status:200,
      headers:{
        ...cors,
        'Content-Type':'application/octet-stream',
        'Content-Length':String(body.byteLength),
        'Cache-Control':`public, max-age=${EEA_UTD_FILE_TTL}`,
        'X-Content-Type-Options':'nosniff',
        'X-Proxy-Cache':'MISS',
        'X-EEA-Upstream-Ms':String(Date.now()-started),
        'X-Qualita-Aria-Proxy':'EEA'
      }
    })
  }catch(err){
    return json({
      error:`EEA UTD: ${err.message||err}`,
      upstreamStatus:err.status||null
    },502,{...cors,'Cache-Control':'no-store'})
  }
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
        Allow:'GET,OPTIONS'
      })
    }

    if(url.pathname==='/health'){
      return json({
        ok:true,
        service:'qualita-aria-eea-proxy',
        version:'0.1.0',
        annualValidated:true,
        metadata:true,
        utd:true,
        utdBinaryCache:true,
        utdDataset:'E2a/UTD'
      },200,{
        ...cors,
        'Cache-Control':'no-store'
      })
    }

    if(url.pathname==='/v1/annual'){
      const year=yearParam(url.searchParams.get('year'));
      const pollutant=pollutantParam(url.searchParams.get('pollutant'));
      const countryRaw=url.searchParams.get('country')||'';
      const country=countryRaw?validIso(countryRaw):'';
      const bbox=bboxNumbers(url.searchParams.get('bbox'));

      if(year===null)return badRequest('Anno EEA non valido',cors);
      if(!pollutant)return badRequest('Inquinante EEA non supportato',cors);
      if(countryRaw&&country===null)return badRequest('Codice Paese non valido',cors);
      if(!bbox)return badRequest('Bounding box non valida',cors);

      return annualResponse(ctx,cors,{
        year,
        pollutant,
        country,
        bbox
      })
    }

    if(url.pathname==='/v1/metadata'){
      const year=yearParam(url.searchParams.get('year'));
      const pollutant=pollutantParam(url.searchParams.get('pollutant'));
      const country=validIso(url.searchParams.get('country')||'IT');
      const bbox=bboxNumbers(url.searchParams.get('bbox'));

      if(year===null)return badRequest('Anno EEA non valido',cors);
      if(!pollutant)return badRequest('Inquinante EEA non supportato',cors);
      if(!country)return badRequest('Codice Paese non valido',cors);
      if(!bbox)return badRequest('Bounding box non valida',cors);

      return metadataResponse(ctx,cors,{
        year,
        pollutant,
        country,
        bbox
      })
    }

    if(url.pathname==='/v1/utd/files'||url.pathname==='/v1/utd/file'){
      const country=validIso(url.searchParams.get('country')||'IT');
      const city=validCity(url.searchParams.get('city'));
      const pollutant=pollutantParam(url.searchParams.get('pollutant'));

      if(!country)return badRequest('Codice Paese non valido',cors);
      if(!city)return badRequest('Città EEA non valida',cors);
      if(!pollutant)return badRequest('Inquinante EEA non supportato',cors);

      if(url.pathname==='/v1/utd/files'){
        return utdFilesResponse(ctx,cors,{
          country,
          city,
          pollutant
        })
      }

      const index=intParam(url.searchParams.get('index'),{
        min:0,
        max:EEA_UTD_MAX_FILES-1,
        defaultValue:null
      });

      if(index===null)return badRequest('Indice file EEA UTD non valido',cors);

      return utdFileResponse(ctx,cors,{
        country,
        city,
        pollutant,
        index
      })
    }

    return json({
      error:'Endpoint non trovato',
      endpoints:[
        '/health',
        '/v1/annual?year=2024&pollutant=PM2.5&country=IT&bbox=16,40,17,42',
        '/v1/metadata?year=2025&pollutant=PM2.5&country=IT&bbox=16,40,17,42',
        '/v1/utd/files?country=IT&city=Bari&pollutant=PM2.5',
        '/v1/utd/file?country=IT&city=Bari&pollutant=PM2.5&index=0'
      ]
    },404,cors)
  }
};
