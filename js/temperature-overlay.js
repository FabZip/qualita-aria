(() => {
  'use strict';

  const markersBySide=new Map();
  const requestIdBySide=new Map();
  const SOURCE_LABELS={arpa:'ARPA Lazio',eea:'EEA'};

  function fmt(value){
    return Number(value).toLocaleString('it-IT',{
      minimumFractionDigits:1,
      maximumFractionDigits:1
    })
  }

  function clearSide(side){
    const markers=markersBySide.get(side)||[];
    markers.forEach(marker=>marker.remove());
    markersBySide.set(side,[])
  }

  function clearAll(){
    [...markersBySide.keys()].forEach(clearSide);
    setLegend(false)
  }

  function setLegend(visible,{year=null,status=''}={}){
    const root=document.getElementById('temperatureOverlayLegend');
    const icon=document.getElementById('temperatureOverlayLegendIcon');
    const text=document.getElementById('temperatureOverlayLegendText');
    if(!root||!icon||!text)return;

    root.classList.toggle('hidden',!visible);
    if(!visible)return;

    icon.textContent='🌡';
    icon.classList.remove('temperature-overlay-dot--cell');
    text.textContent=status||
      `Temperatura misurata ${year||''} · MIN / MEDIA / MAX`
  }

  function markerElement(row){
    const el=document.createElement('button');
    el.type='button';
    el.className='qa-temperature-marker qa-temperature-marker--observed';
    el.setAttribute(
      'aria-label',
      `${row.name}: ${fmt(row.min)}, ${fmt(row.mean)}, ${fmt(row.max)} gradi`
    );

    const icon=document.createElement('span');
    icon.className='qa-temperature-marker__icon';
    icon.textContent='🌡';

    const values=document.createElement('span');
    values.className='qa-temperature-marker__values';
    values.textContent=`${fmt(row.min)} · ${fmt(row.mean)} · ${fmt(row.max)}°`;

    el.append(icon,values);
    return el
  }

  function popupHtml(row,context){
    const provider=String(
      row.sourceTemperature||row.network||'Rete meteorologica osservazionale'
    );
    const providerHtml=provider.startsWith('Meteostat')
      ?'<a href="https://meteostat.net/" target="_blank" rel="noopener noreferrer">Meteostat</a> · sole fonti osservative'
      :provider;

    return(
      `<strong>${row.name} — ${context.year}</strong>`+
      `<br>Minima media annuale: ${fmt(row.min)} °C`+
      `<br>Temperatura media annuale: ${fmt(row.mean)} °C`+
      `<br>Massima media annuale: ${fmt(row.max)} °C`+
      `<br>Tipo: Misurato`+
      `<br>Fonte temperatura: ${providerHtml}`+
      `${row.wmo?`<br>Codice WMO: ${row.wmo}`:''}`+
      `${row.icao?`<br>Codice ICAO: ${row.icao}`:''}`+
      `<br>Fonte inquinante: ${SOURCE_LABELS[context.pollutantSource]||context.pollutantSource}`+
      `${Number.isFinite(Number(row.coverage))
        ?`<br>Copertura annuale: ${fmt(row.coverage)}%`
        :''}`
    )
  }

  function addMarkers(map,rows,context){
    const markers=[];

    rows.forEach(row=>{
      const lat=Number(row.latitude??row.lat);
      const lon=Number(row.longitude??row.lon);
      const min=Number(row.min);
      const mean=Number(row.mean);
      const max=Number(row.max);

      if(
        !Number.isFinite(lat)||
        !Number.isFinite(lon)||
        !Number.isFinite(min)||
        !Number.isFinite(mean)||
        !Number.isFinite(max)
      )return;

      const normalized={...row,min,mean,max};
      const popup=new maplibregl.Popup({offset:18})
        .setHTML(popupHtml(normalized,context));

      markers.push(
        new maplibregl.Marker({
          element:markerElement(normalized),
          anchor:'bottom'
        })
          .setLngLat([lon,lat])
          .setPopup(popup)
          .addTo(map)
      )
    });

    return markers
  }

  async function renderOverlay(detail){
    const map=detail?.map;
    const side=String(detail?.side||'single');
    const pollutantSource=String(detail?.pollutantSource||'');
    const year=Number(detail?.year);

    // OpenAQ non mostra più celle o temperature.
    if(
      !map||
      !['arpa','eea'].includes(pollutantSource)||
      !Number.isInteger(year)
    ){
      clearSide(side);
      if(pollutantSource==='openaq')setLegend(false);
      return
    }

    const bbox=Array.isArray(detail?.bbox)?detail.bbox:null;
    if(!bbox){
      clearSide(side);
      return
    }

    const requestId=(requestIdBySide.get(side)||0)+1;
    requestIdBySide.set(side,requestId);
    clearSide(side);
    setLegend(true,{year});

    try{
      const response=
        await globalThis.QualitaAriaTemperatureProxy?.observed?.({
          pollutantSource,year,bbox
        });

      if(requestIdBySide.get(side)!==requestId)return;

      const rows=Array.isArray(response?.data?.results)
        ?response.data.results
        :[];

      if(!rows.length){
        const meta=response?.data?.meta||{};
        const discovered=Number(meta?.ncei?.stationsDiscovered||0);
        const annual=Number(meta?.ncei?.stationsWithAnnualTemperature||0);
        const status=discovered>0&&annual===0
          ?`Stazioni trovate, ma senza MIN / MEDIA / MAX annuali completi per ${year}`
          :`Nessuna stazione meteorologica con dati annuali disponibili (${year})`;
        markersBySide.set(side,[]);
        setLegend(true,{
          year,
          status
        });
        return
      }

      markersBySide.set(
        side,
        addMarkers(map,rows,{pollutantSource,year,side})
      );
      setLegend(true,{year})
    }catch(err){
      console.warn('Overlay temperatura non disponibile.',err);
      if(requestIdBySide.get(side)!==requestId)return;

      markersBySide.set(side,[]);
      setLegend(true,{
        year,
        status:`Stazioni meteo non disponibili per ${year}`
      })
    }
  }

  window.addEventListener(
    'qualita-aria:temperature-overlay',
    event=>void renderOverlay(event.detail||{})
  );
  window.addEventListener(
    'qualita-aria:temperature-overlay-clear',
    clearAll
  );

  globalThis.QualitaAriaTemperatureOverlay={
    clear:clearAll,
    render:renderOverlay
  }
})();
