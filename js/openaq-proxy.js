(() => {
  'use strict';

  const CONFIG_URL='data/openaq-proxy.json?v=0.2.3';
  let configPromise=null;

  function normalizeBaseUrl(value){
    return String(value||'').trim().replace(/\/+$/,'')
  }

  async function loadConfig(force=false){
    if(configPromise&&!force)return configPromise;

    configPromise=fetch(CONFIG_URL,{cache:'no-store'})
      .then(async response=>{
        if(!response.ok){
          throw new Error(`Configurazione proxy OpenAQ non disponibile (HTTP ${response.status})`)
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
      throw new Error('Proxy OpenAQ non configurato. Imposta enabled=true e base_url in data/openaq-proxy.json.')
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
    const response=await fetch(url.toString(),{
      method:'GET',
      mode:'cors',
      cache:'no-store',
      headers:{Accept:'application/json'}
    });

    let payload=null;
    try{payload=await response.json()}
    catch{payload=null}

    if(!response.ok){
      const detail=payload?.error||payload?.detail||`HTTP ${response.status}`;
      throw new Error(`Proxy OpenAQ: ${detail}`)
    }

    return{
      data:payload,
      cache:response.headers.get('X-Proxy-Cache')||'UNKNOWN',
      endpoint:response.headers.get('X-OpenAQ-Endpoint')||path,
      status:response.status
    }
  }

  globalThis.QualitaAriaOpenAQProxy={
    loadConfig,
    reloadConfig:()=>loadConfig(true),

    async health(){
      const url=await proxyUrl('/health');
      const response=await fetch(url.toString(),{cache:'no-store'});
      const data=await response.json().catch(()=>null);

      if(!response.ok){
        throw new Error(data?.error||`Proxy OpenAQ health: HTTP ${response.status}`)
      }

      return data
    },

    locations({
      pollutant='pm25',
      page=1,
      iso='',
      bbox=''
    }={}){
      return request('/v1/locations',{pollutant,page,iso,bbox})
    },

    latest({
      pollutant='pm25',
      page=1,
      datetimeMin=''
    }={}){
      return request('/v1/latest',{
        pollutant,
        page,
        datetime_min:datetimeMin
      })
    },

    location(id){
      return request('/v1/location',{id})
    },

    yearly({
      sensor,
      year
    }={}){
      return request('/v1/yearly',{sensor,year})
    }
  }
})();
