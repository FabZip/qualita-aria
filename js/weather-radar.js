(()=>{
  'use strict';
  // Parameters supplied by RainViewer's official Share > Embed dialog.
  function widgetUrl(city){
    const lat=city?.lat,lon=city?.lon;
    if(lat===null||lat===undefined||lon===null||lon===undefined||!Number.isFinite(Number(lat))||!Number.isFinite(Number(lon))||Math.abs(Number(lat))>90||Math.abs(Number(lon))>180)throw Error('Coordinate radar non valide');
    const url=new URL('https://www.rainviewer.com/map.html');
    url.search=new URLSearchParams({loc:`${Number(lat)},${Number(lon)},7`,oC:'true',oCS:'1',c:'9',o:'83',lm:'1',layer:'radar',sm:'1',sn:'1',ts:'2'}).toString();
    return url.href
  }
  globalThis.WeatherRadar={widgetUrl};
  if(typeof document==='undefined'||typeof source!=='function')return;
  const $=id=>document.getElementById(id);
  let city=null,iframe=null,sequence=0,timer=null;
  const touch=()=>globalThis.matchMedia?.('(pointer: coarse)').matches??false;
  function lock(locked){
    $('radarTouchShield').classList.toggle('hidden',!locked);
    $('radarLock').classList.toggle('hidden',!touch()||locked);
    if(iframe)iframe.style.pointerEvents=locked?'none':'auto'
  }
  function suspend(){
    ++sequence;clearTimeout(timer);iframe?.remove();iframe=null;
  }
  function show(location){
    city=location;const url=widgetUrl(city);suspend();const token=sequence;
    $('weatherRadarPanel').classList.remove('hidden');
    $('radarPlace').textContent=city.name;
    $('radarOpen').href=url;
    $('radarStatus').textContent='Caricamento del radar ufficiale RainViewer…';
    iframe=document.createElement('iframe');
    iframe.title=`Radar meteo RainViewer · ${city.name}`;
    iframe.allowFullscreen=true;iframe.allow='fullscreen';iframe.referrerPolicy='strict-origin-when-cross-origin';
    iframe.setAttribute('aria-label',iframe.title);
    iframe.onload=()=>{if(token!==sequence)return;clearTimeout(timer);$('radarStatus').textContent='Widget ufficiale RainViewer: animazione e controlli sono gestiti dal servizio. Se la mappa non compare, aprila con il collegamento qui sotto.'};
    iframe.onerror=()=>{if(token!==sequence)return;clearTimeout(timer);$('radarStatus').textContent='Widget non disponibile. Riprova oppure apri RainViewer.'};
    $('weatherRadarMap').replaceChildren(iframe);
    lock(touch());
    timer=setTimeout(()=>{if(token===sequence)$('radarStatus').textContent='Il radar sta impiegando più tempo del previsto. Puoi ricaricarlo o aprire RainViewer.'},20000);
    iframe.src=url;
  }
  $('radarActivate').addEventListener('click',()=>lock(false));
  $('radarLock').addEventListener('click',()=>lock(true));
  $('radarCenter').addEventListener('click',()=>{if(city)show(city)});
  $('radarRefresh').addEventListener('click',()=>{if(city)show(city)});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)suspend();else if(source()==='weather'&&city)show(city)});
  Object.assign(globalThis.WeatherRadar,{show,suspend});
})();
