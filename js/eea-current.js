(() => {
  'use strict';
  const baseConfigure=configureSourceUI;
  const baseRender=render;
  const baseNotice=sourceNotice;
  const baseFillYears=fillYears;
  let periodInitialized=false;
  let locationPromise=null;
  let renderSequence=0;
  let latestMeasurement=null;
  let latestIsDaily=false;

  function isCurrent(){return source()==='eea'&&$('yearSelect').value==='today'&&state.mode==='map'}

  function configurePeriods(){
    if(source()!=='eea'||isTemperature())return;
    const select=$('yearSelect');
    const available=eeaScope()==='italy'&&state.mode==='map';
    const today=select.querySelector('[value="today"]');
    if(available){
      if(!today){
        const old=select.value;
        const option=document.createElement('option');
        option.value='today';option.textContent='Oggi';select.prepend(option);
        select.value=periodInitialized&&old?old:'today'
      }
      periodInitialized=true
    }else if(today){
      const selected=select.value==='today';today.remove();
      if(selected)select.value=SOURCE_INFO.eea.years[0]
    }
  }

  fillYears=function(){
    const wasToday=source()==='eea'&&$('yearSelect').value==='today';
    baseFillYears();configurePeriods();
    if(wasToday&&eeaScope()==='italy'&&state.mode==='map')$('yearSelect').value='today'
  };

  configureSourceUI=function(){
    const result=baseConfigure();
    if(source()!=='eea'||isTemperature())return result;
    configurePeriods();
    $('monthField').classList.add('hidden');
    $('yearFieldLabel').textContent='Periodo';
    if(state.mode==='map')$('singleYearField').classList.remove('hidden');
    $('yearSelect').title='Scegli Oggi per l’ultima misura disponibile o un anno per le statistiche annuali.';
    $('sourceDescription').innerHTML=isCurrent()
      ?'<strong>EEA:</strong> ultimo dato disponibile per ogni stazione, con la relativa data. Può essere un dato orario o una media giornaliera. I dati sono preliminari e possono arrivare in ritardo.'
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
    if(isCurrent()){
      const latest=rows.filter(row=>Number.isFinite(Date.parse(row.latestAt)))
        .reduce((best,row)=>!best||Date.parse(row.latestAt)>Date.parse(best.latestAt)?row:best,null);
      latestMeasurement=latest?new Date(latest.latestAt):null;
      latestIsDaily=latest?.aggregation==='day';
      return rows.length?'EEA · ultime misure disponibili · dati preliminari':'EEA · nessuna misura disponibile'
    }
    return baseNotice(rows)
  };

  render=async function(){
    const sequence=++renderSequence;
    if(source()==='eea')configureSourceUI();
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
    latestMeasurement=null;
    latestIsDaily=false;
    await baseRender();
    if(sequence!==renderSequence||!isCurrent())return;
    $('singleYearField').classList.remove('hidden');
    $('periodValue').textContent=latestMeasurement
      ?latestMeasurement.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
    $('periodValue').title=latestMeasurement
      ?latestIsDaily?`Media giornaliera più recente visualizzata: ${latestMeasurement.toLocaleDateString('it-IT')}`
        :`Misura più recente tra le stazioni visualizzate: ${latestMeasurement.toLocaleString('it-IT')}`:'Nessuna misura disponibile';
    $('mapBadge').textContent=`${POLLUTANTS[$('pollutantSelect').value].label} - ultima misura`;
    $('avgLabel').textContent='Media ultimi valori';
    $('mapHint').textContent='Ogni stazione mostra il proprio ultimo dato disponibile, anche precedente a oggi. Il periodo indica la data più recente; nell’elenco sono distinti i dati orari dalle medie giornaliere.'
  };

})();
