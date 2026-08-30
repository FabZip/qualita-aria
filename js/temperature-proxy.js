(() => {
  'use strict';

  const CONFIG_URL='data/temperature-proxy.json?v=0.3.9';
  const OPEN_METEO_ARCHIVE='https://archive-api.open-meteo.com/v1/archive';
  const NATIVE_RESOLUTION_DEG=.1;
  const MAX_GRID_POINTS=25;

  let configPromise=null;

  function normalizeBaseUrl(value){
    return String(value||'').trim().replace(/\/+$/,'')
  }

  async function loadConfig(force=false){
    if(configPromise&&!force)return configPromise;

    configPromise=fetch(CONFIG_URL,{cache:'no-store'})
      .then(async response=>{
        if(!response.ok){
          throw new Error(
            `Configurazione proxy temperatura non disponibile (HTTP ${response.status})`
          )
        }

        const config=await response.json();

        return{
          enabled:Boolean(config?.enabled),
          baseUrl:normalizeBaseUrl(config?.base_url),
          note:String(config?.note||'')
        }
      });

    return configPromise
  }

  async function request(path,params={}){
    const config=await loadConfig();

    if(!config.enabled||!config.baseUrl){
      throw new Error('Proxy temperatura non configurato.')
    }

    const url=new URL(`${config.baseUrl}${path}`);

    Object.entries(params).forEach(([key,value])=>{
      if(value===null||value===undefined||value==='')return;
      url.searchParams.set(key,String(value))
    });

    const started=performance.now();
    const response=await fetch(url.toString(),{
      mode:'cors',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });

    const payload=await response.json().catch(()=>null);

    if(!response.ok){
      const error=new Error(
        payload?.error||
        payload?.detail||
        `Proxy temperatura HTTP ${response.status}`
      );
      error.status=response.status;
      error.code=payload?.code||'';
      error.payload=payload;
      throw error
    }

    return{
      data:payload,
      cache:response.headers.get('X-Proxy-Cache')||'UNKNOWN',
      durationMs:Math.round(performance.now()-started),
      status:response.status,
      transport:'cloudflare-proxy'
    }
  }

  function bboxNumbers(value){
    const parts=Array.isArray(value)
      ?value.map(Number)
      :String(value||'').split(',').map(Number);

    if(parts.length!==4||parts.some(v=>!Number.isFinite(v))){
      throw new Error('Bounding box temperatura non valida.')
    }

    return parts
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

    const avg=values=>
      values.reduce((sum,value)=>sum+value,0)/values.length;

    return{
      min:Number(Math.min(...mins).toFixed(2)),
      mean:Number(avg(means).toFixed(2)),
      max:Number(Math.max(...maxs).toFixed(2)),
      observations:Math.min(mins.length,means.length,maxs.length)
    }
  }

  async function directEraViewport({bbox,year},fallbackReason=''){
    const numericBbox=bboxNumbers(bbox);
    const grid=gridForBbox(numericBbox);
    const start=`${year}-01-01`;
    const end=`${year}-12-31`;

    const url=new URL(OPEN_METEO_ARCHIVE);

    url.searchParams.set(
      'latitude',
      grid.points.map(point=>point.latitude).join(',')
    );
    url.searchParams.set(
      'longitude',
      grid.points.map(point=>point.longitude).join(',')
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

    const started=performance.now();
    const response=await fetch(url.toString(),{
      mode:'cors',
      cache:'default',
      headers:{Accept:'application/json'}
    });

    const payload=await response.json().catch(()=>null);

    if(!response.ok){
      const error=new Error(
        payload?.reason||
        payload?.error||
        `Open-Meteo HTTP ${response.status}`
      );
      error.status=response.status;
      error.payload=payload;
      throw error
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
        name:`Cella ERA5-Land ${latitude.toFixed(2)}, ${longitude.toFixed(2)}`,
        latitude,
        longitude,
        elevation:Number.isFinite(Number(location?.elevation))
          ?Number(location.elevation)
          :null,
        ...summary,
        unit:'°C',
        type:'climate-reanalysis',
        sourceTemperature:'Copernicus ERA5-Land',
        resolutionKm:'circa 9 km'
      })
    });

    return{
      data:{
        meta:{
          source:'Copernicus ERA5-Land via Open-Meteo',
          type:'climate-reanalysis',
          year:Number(year),
          bbox:numericBbox,
          sampleStepDegrees:grid.sampleStepDegrees,
          returnedCells:results.length,
          fallbackReason
        },
        results
      },
      cache:'DIRECT',
      durationMs:Math.round(performance.now()-started),
      status:response.status,
      transport:'direct-open-meteo-fallback'
    }
  }

  async function viewport({bbox,year}={}){
    const params={
      bbox:Array.isArray(bbox)?bbox.join(','):bbox,
      year
    };

    try{
      const proxied=await request('/v1/temperature',params);

      if(
        Array.isArray(proxied.data?.results)&&
        proxied.data.results.length
      ){
        return proxied
      }

      return directEraViewport(
        {bbox,year},
        'Proxy raggiungibile ma risposta ERA5-Land senza celle'
      )
    }catch(err){
      console.warn(
        'Proxy ERA5-Land non disponibile, uso Open-Meteo diretto.',
        err
      );

      return directEraViewport(
        {bbox,year},
        String(err.message||err)
      )
    }
  }

  async function observed({pollutantSource,bbox,year}={}){
    /*
     * Nessun fallback ERA5-Land qui.
     * ARPA ed EEA devono mostrare soltanto stazioni fisiche.
     */
    return request('/v1/observed',{
      pollutantSource,
      bbox:Array.isArray(bbox)?bbox.join(','):bbox,
      year
    })
  }

  globalThis.QualitaAriaTemperatureProxy={
    loadConfig,
    reloadConfig:()=>loadConfig(true),

    async health(){
      const config=await loadConfig();
      const response=await fetch(
        `${config.baseUrl}/health`,
        {cache:'no-store'}
      );
      const data=await response.json().catch(()=>null);

      if(!response.ok){
        throw new Error(
          data?.error||
          `Health temperatura HTTP ${response.status}`
        )
      }

      return data
    },

    viewport,
    observed
  }
})();
