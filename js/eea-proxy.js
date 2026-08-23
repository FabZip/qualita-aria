(() => {
  'use strict';

  const CONFIG_URL='data/eea-proxy.json?v=0.2.14';
  let configPromise=null;

  function normalizeBaseUrl(value){
    return String(value||'').trim().replace(/\/+$/,'')
  }

  async function loadConfig(force=false){
    if(configPromise&&!force)return configPromise;

    configPromise=fetch(CONFIG_URL,{cache:'no-store'})
      .then(async response=>{
        if(!response.ok){
          throw new Error(`Configurazione proxy EEA non disponibile (HTTP ${response.status})`)
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

  async function proxyUrl(path,params={}){
    const config=await loadConfig();

    if(!config.enabled||!config.baseUrl){
      throw new Error('Proxy EEA non configurato.')
    }

    const url=new URL(`${config.baseUrl}${path}`);
    Object.entries(params).forEach(([key,value])=>{
      if(value===null||value===undefined||value==='')return;
      url.searchParams.set(key,String(value))
    });

    return url
  }

  async function request(path,params={}){
    const url=await proxyUrl(path,params);
    const started=performance.now();

    const response=await fetch(url.toString(),{
      method:'GET',
      mode:'cors',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });

    const payload=await response.json().catch(()=>null);

    if(!response.ok){
      const detail=payload?.error||payload?.detail||`HTTP ${response.status}`;
      const error=new Error(`Proxy EEA: ${detail}`);
      error.status=response.status;
      error.payload=payload;
      throw error
    }

    return{
      data:payload,
      cache:response.headers.get('X-Proxy-Cache')||'UNKNOWN',
      status:response.status,
      durationMs:Math.round(performance.now()-started)
    }
  }

  async function binaryRequest(path,params={}){
    const url=await proxyUrl(path,params);
    const started=performance.now();

    const response=await fetch(url.toString(),{
      method:'GET',
      mode:'cors',
      cache:'no-store',
      headers:{Accept:'application/octet-stream,*/*'}
    });

    if(!response.ok){
      let detail=`HTTP ${response.status}`;
      try{
        const payload=await response.json();
        detail=payload?.error||payload?.detail||detail
      }catch{}
      throw new Error(`Proxy EEA: ${detail}`)
    }

    return{
      data:await response.arrayBuffer(),
      cache:response.headers.get('X-Proxy-Cache')||'UNKNOWN',
      upstreamMs:Number(response.headers.get('X-EEA-Upstream-Ms')||0),
      durationMs:Math.round(performance.now()-started),
      status:response.status
    }
  }

  globalThis.QualitaAriaEEAProxy={
    loadConfig,
    reloadConfig:()=>loadConfig(true),

    async health(){
      const url=await proxyUrl('/health');
      const response=await fetch(url.toString(),{cache:'no-store'});
      const data=await response.json().catch(()=>null);

      if(!response.ok){
        throw new Error(data?.error||`Proxy EEA health: HTTP ${response.status}`)
      }

      return data
    },

    annual({year,pollutant,country='',bbox=''}={}){
      return request('/v1/annual',{
        year,
        pollutant,
        country,
        bbox:Array.isArray(bbox)?bbox.join(','):bbox
      })
    },

    metadata({year,pollutant,country='IT',bbox=''}={}){
      return request('/v1/metadata',{
        year,
        pollutant,
        country,
        bbox:Array.isArray(bbox)?bbox.join(','):bbox
      })
    },

    utdFiles({country='IT',city='',pollutant='PM2.5'}={}){
      return request('/v1/utd/files',{
        country,
        city,
        pollutant
      })
    },

    utdFile({country='IT',city='',pollutant='PM2.5',index=0}={}){
      return binaryRequest('/v1/utd/file',{
        country,
        city,
        pollutant,
        index
      })
    }
  }
})();
