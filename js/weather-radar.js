(()=>{
  'use strict';
  const MANIFEST='https://api.rainviewer.com/public/weather-maps.json',TTL=5*60*1000;
  let cached=null,pending=null;
  function parseManifest(payload){
    const host=new URL(payload?.host||'');
    if(host.protocol!=='https:'||host.hostname!=='tilecache.rainviewer.com'||host.port)throw Error('Origine radar non valida');
    const frames=(Array.isArray(payload?.radar?.past)?payload.radar.past:[]).filter(frame=>Number.isInteger(frame?.time)&&frame.time>0&&/^\/v2\/radar\/[a-zA-Z0-9_-]+$/.test(frame.path)).sort((a,b)=>a.time-b.time);
    const unique=[...new Map(frames.map(frame=>[frame.time,{time:frame.time,path:frame.path}])).values()].slice(-13);
    if(!unique.length)throw Error('Nessuna immagine radar disponibile');
    return{host:host.origin,frames:unique,generated:Number(payload.generated)||null}
  }
  function tiles(data,index,coverage=false){
    return `${data.host}${coverage?'/v2/coverage/0':data.frames[index].path}/512/{z}/{x}/{y}/${coverage?'0/0_0':'2/1_1'}.png`
  }
  async function manifest(force=false){
    if(!force&&cached&&Date.now()-cached.savedAt<TTL)return cached.data;
    if(pending)return pending;
    pending=(async()=>{
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
      try{const response=await fetch(MANIFEST,{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error(`Radar non disponibile (HTTP ${response.status})`);const data=parseManifest(await response.json());cached={savedAt:Date.now(),data};return data}finally{clearTimeout(timer)}
    })();try{return await pending}finally{pending=null}
  }
  // A per-browser queue limits fresh tile traffic to <80/minute, including rapid scrubbing/panning.
  // Repeated frames reuse a bounded memory cache; abandoned requests never consume a slot.
  function tileLoader({fetcher=fetch,now=()=>Date.now(),wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}){
    const memory=new Map();let tail=Promise.resolve(),nextAt=0;
    return async(url,signal)=>{
      if(!/^https:\/\/tilecache\.rainviewer\.com\/v2\/(?:radar\/[\w-]+|coverage\/0)\/512\/\d+\/\d+\/\d+\/[02]\/[01]_[01]\.png$/.test(url))throw Error('URL radar non valido');
      const abort=()=>{if(signal?.aborted)throw new DOMException('Annullato','AbortError')};abort();
      if(memory.has(url))return memory.get(url).slice(0);
      let release;const previous=tail;tail=new Promise(resolve=>release=resolve);
      await previous;
      try{
        abort();if(memory.has(url))return memory.get(url).slice(0);
        if(nextAt>now())await wait(nextAt-now());abort();nextAt=now()+800;
      }finally{release()}
      const response=await fetcher(url,{signal});if(!response.ok)throw Error(`Immagine radar non disponibile (HTTP ${response.status})`);
      const data=await response.arrayBuffer();memory.set(url,data);if(memory.size>128)memory.delete(memory.keys().next().value);return data.slice(0)
    }
  }
  globalThis.WeatherRadar={parseManifest,tiles,manifest,tileLoader};
  if(typeof document==='undefined'||typeof source!=='function')return;
  const $=id=>document.getElementById(id);
  let map=null,marker=null,city=null,data=null,index=0,timer=null,sequence=0,ready=false,opacity=.7,coverage=false;
  const active=()=>source()==='weather'&&!document.hidden;
  function pause(){clearTimeout(timer);timer=null;$('radarPlay').textContent='▶ Riproduci';$('radarPlay').setAttribute('aria-pressed','false')}
  function status(text){$('radarStatus').textContent=text}
  function sourceFor(name,url){
    if(map.getSource(name))map.getSource(name).setTiles([url.replace('https://','aria-radar://')]);
    else{map.addSource(name,{type:'raster',tiles:[url.replace('https://','aria-radar://')],tileSize:512,minzoom:0,maxzoom:7,attribution:'<a href="https://www.rainviewer.com/" target="_blank" rel="noopener">Radar © RainViewer</a>'});map.addLayer({id:name,type:'raster',source:name,paint:{'raster-opacity':name==='weather-radar'?opacity:.55,'raster-fade-duration':0}})}
  }
  function frame(next){
    if(!active()||!map||!ready||!data)return;
    index=Math.max(0,Math.min(data.frames.length-1,Number(next)||0));
    sourceFor('weather-radar',tiles(data,index));
    if(coverage)sourceFor('weather-coverage',tiles(data,index,true));
    $('radarTimeline').value=String(index);
    const date=new Date(data.frames[index].time*1000);
    $('radarTime').textContent=new Intl.DateTimeFormat('it-IT',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:city.timezone||'UTC'}).format(date)+(city.timezone?'':' UTC');
    $('radarTimeline').setAttribute('aria-valuetext',$('radarTime').textContent);
    $('radarTime').dateTime=date.toISOString();
    const age=Date.now()/1000-data.frames.at(-1).time;
    status(age>1800?'Immagini radar non recenti: controlla data e ora.':'Radar osservato · ultime 2 ore · nessuna previsione futura');
  }
  function step(){
    if(!active()){pause();return}
    if(ready&&map?.getSource('weather-radar')&&map.isSourceLoaded('weather-radar'))frame((index+1)%data.frames.length);
    timer=setTimeout(step,3500)
  }
  function initMap(){
    if(map)return;
    const loadTile=tileLoader();
    maplibregl.addProtocol('aria-radar',async(params,controller)=>({data:await loadTile(params.url.replace('aria-radar://','https://'),controller.signal)}));
    map=new maplibregl.Map({container:'weatherRadarMap',style:MAP_STYLE,center:[city.lon,city.lat],zoom:7,maxZoom:12,minZoom:2,cooperativeGestures:globalThis.matchMedia?.('(pointer: coarse)').matches??false,locale:{'CooperativeGesturesHandler.MobileHelpText':'Usa due dita per spostare la mappa'}});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
    map.addControl(new maplibregl.FullscreenControl(),'top-right');
    map.addControl(new maplibregl.ScaleControl({unit:'metric'}),'bottom-left');
    marker=new maplibregl.Marker({color:'#0284c7'}).setLngLat([city.lon,city.lat]).addTo(map);
    map.on('load',()=>{ready=true;frame(index)});
    map.on('error',event=>{if(event.error?.name==='AbortError')return;status('Alcune immagini radar non sono disponibili. Riprova o aggiorna il radar.');pause()});
    map.on('movestart',()=>{if(timer)pause()});
  }
  async function show(location){
    city=location;const token=++sequence;$('weatherRadarPanel').classList.remove('hidden');
    status('Caricamento radar…');pause();
    try{
      initMap();map.resize();map.jumpTo({center:[city.lon,city.lat],zoom:7});marker.setLngLat([city.lon,city.lat]);marker.getElement().setAttribute('aria-label',city.name);
      data=await manifest();if(token!==sequence||!active())return;
      index=data.frames.length-1;$('radarTimeline').max=String(index);
      for(const id of ['radarPlay','radarPrevious','radarNext','radarTimeline'])$(id).disabled=false;
      frame(index)
    }catch(error){if(token!==sequence)return;status(error.message||'Radar temporaneamente non disponibile. Le previsioni restano consultabili.');for(const id of ['radarPlay','radarPrevious','radarNext','radarTimeline'])$(id).disabled=true}
  }
  function suspend(){++sequence;pause()}
  $('radarPlay').addEventListener('click',()=>{if(timer){pause();return}if(!data)return;$('radarPlay').textContent='Ⅱ Pausa';$('radarPlay').setAttribute('aria-pressed','true');timer=setTimeout(step,100)});
  $('radarPrevious').addEventListener('click',()=>{pause();frame(index-1)});
  $('radarNext').addEventListener('click',()=>{pause();frame(index+1)});
  $('radarTimeline').addEventListener('input',event=>{pause();frame(event.target.value)});
  $('radarOpacity').addEventListener('input',event=>{opacity=Number(event.target.value)/100;if(map?.getLayer('weather-radar'))map.setPaintProperty('weather-radar','raster-opacity',opacity)});
  $('radarCoverage').addEventListener('change',event=>{coverage=event.target.checked;if(!ready||!data)return;if(coverage){sourceFor('weather-coverage',tiles(data,index,true));map.setLayoutProperty('weather-coverage','visibility','visible')}else if(map.getLayer('weather-coverage'))map.setLayoutProperty('weather-coverage','visibility','none')});
  $('radarCenter').addEventListener('click',()=>{if(city&&map)map.flyTo({center:[city.lon,city.lat],zoom:7})});
  $('radarRefresh').addEventListener('click',()=>{cached=null;if(city)show(city)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();else if(source()==='weather'&&city)return show(city)});
  Object.assign(globalThis.WeatherRadar,{show,suspend});
})();
