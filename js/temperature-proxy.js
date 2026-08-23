(() => {
  'use strict';

  const CONFIG_URL='data/temperature-proxy.json?v=0.3.0';
  let configPromise=null;

  function normalizeBaseUrl(value){
    return String(value||'').trim().replace(/\/+$/,'')
  }

  async function loadConfig(force=false){
    if(configPromise&&!force)return configPromise;

    configPromise=fetch(CONFIG_URL,{cache:'no-store'})
      .then(async response=>{
        if(!response.ok){
          throw new Error(`Configurazione proxy temperatura non disponibile (HTTP ${response.status})`)
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
      status:response.status
    }
  }

  globalThis.QualitaAriaTemperatureProxy={
    loadConfig,
    reloadConfig:()=>loadConfig(true),

    async health(){
      const config=await loadConfig();
      const response=await fetch(`${config.baseUrl}/health`,{cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok){
        throw new Error(data?.error||`Health temperatura HTTP ${response.status}`)
      }
      return data
    },

    viewport({bbox,year,month}={}){
      return request('/v1/temperature',{
        bbox:Array.isArray(bbox)?bbox.join(','):bbox,
        year,
        month
      })
    }
  }
})();
