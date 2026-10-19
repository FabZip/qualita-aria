(() => {
  'use strict';
  const baseConfigure=configureSourceUI;
  const baseRender=render;
  const baseNotice=sourceNotice;
  let period='today';
  let locationPromise=null;
  let renderSequence=0;

  function isCurrent(){return source()==='eea'&&$('monthSelect').value==='today'&&state.mode==='map'}

  configureSourceUI=function(){
    const result=baseConfigure();
    if(source()!=='eea'||isTemperature())return result;
    const select=$('monthSelect');
    const available=eeaScope()==='italy'&&state.mode==='map';
    select.innerHTML='<option value="today">Oggi</option><option value="0">Intero anno</option>';
    select.querySelector('[value="today"]').disabled=!available;
    select.value=available?period:'0';
    select.disabled=false;
    $('monthField').classList.remove('hidden');
    if(available&&period==='today')$('singleYearField').classList.add('hidden');
    select.title='Oggi mostra l’ultima misura preliminare ricevuta nella giornata.';
    $('sourceDescription').innerHTML=available&&period==='today'
      ?'<strong>EEA:</strong> ultime misure disponibili oggi dalle stazioni. I dati sono preliminari e possono arrivare in ritardo.'
      :SOURCE_INFO.eea.description;
    return result
  };

  async function locate(){
    if(state.eeaGeoCity)return;
    if(!locationPromise)locationPromise=new Promise((resolve,reject)=>{
      if(!navigator.geolocation){reject(new Error('Geolocalizzazione non disponibile. Seleziona una città.'));return}
      navigator.geolocation.getCurrentPosition(position=>{
        const {latitude:lat,longitude:lon}=position.coords;
        // Il download EEA è indicizzato per città: usa il capoluogo più vicino
        // per il catalogo, conservando la posizione reale per il filtro spaziale.
        const cities=[...state.eeaCities.values()];
        const distance=city=>((Number(city.lon)-lon)*Math.cos(lat*Math.PI/180))**2+(Number(city.lat)-lat)**2;
        const nearest=cities.reduce((best,city)=>!best||distance(city)<distance(best)?city:best,null);
        if(!nearest){reject(new Error('Catalogo città EEA non disponibile.'));return}
        state.eeaGeoCity={id:'geolocate',name:nearest.name,lat,lon};
        resolve()
      },()=>reject(new Error('Consenti la posizione oppure seleziona una città dall’elenco.')),
      {timeout:10000,maximumAge:300000,enableHighAccuracy:false})
    }).finally(()=>{locationPromise=null});
    await locationPromise
  }

  sourceNotice=function(rows){
    if(isCurrent())return rows.length?'EEA · ultime misure di oggi · dati preliminari':'EEA · nessuna misura di oggi disponibile';
    return baseNotice(rows)
  };

  render=async function(){
    const sequence=++renderSequence;
    if(source()==='eea'&&eeaScope()==='italy'&&eeaCity()==='geolocate'){
      try{
        $('loadingOverlay').classList.remove('hidden');
        $('loadingText').textContent='Ricerca della posizione…';
        await locate();
        if(sequence!==renderSequence||source()!=='eea')return;
      }catch(error){
        if(sequence!==renderSequence||source()!=='eea')return;
        ++state.renderToken;
        clearTemperatureOverlays();
        showAirOnSingle([]);renderList([]);
        $('avgValue').textContent='—';$('stationCount').textContent='0';
        $('dataNotice').textContent=error.message;
        $('loadingOverlay').classList.add('hidden');
        showToast(error.message);return
      }
    }
    await baseRender();
    if(sequence!==renderSequence||!isCurrent())return;
    $('singleYearField').classList.add('hidden');
    $('periodValue').textContent='Oggi';
    $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} · ultima misura di oggi`;
    $('avgLabel').textContent='Media ultimi valori';
    $('mapHint').textContent='Ogni stazione mostra l’ultima misura ricevuta oggi. La disponibilità dipende dai tempi di trasmissione.'
  };

  $('monthSelect').addEventListener('change',()=>{
    if(source()!=='eea')return;
    period=$('monthSelect').value;
    configureSourceUI();render()
  });
})();
