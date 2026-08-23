(() => {
  'use strict';

  const markersBySide=new Map();
  const requestIdBySide=new Map();

  const SOURCE_LABELS={
    arpa:'ARPA Lazio',
    eea:'EEA',
    openaq:'Globale · OpenAQ'
  };

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

  function setLegend(
    visible,
    {kind='observed',year=null,status=''}={}
  ){
    const root=document.getElementById('temperatureOverlayLegend');
    const icon=document.getElementById('temperatureOverlayLegendIcon');
    const text=document.getElementById('temperatureOverlayLegendText');

    if(!root||!icon||!text)return;

    root.classList.toggle('hidden',!visible);
    if(!visible)return;

    icon.textContent=kind==='observed'?'🌡':'▦';
    icon.classList.toggle(
      'temperature-overlay-dot--cell',
      kind!=='observed'
    );

    if(status){
      text.textContent=status;
      return
    }

    text.textContent=kind==='observed'
      ?'Temperatura misurata · MIN / MEDIA / MAX'
      :'Celle ERA5-Land · MIN / MEDIA / MAX'
  }

  function markerElement(row,kind){
    const element=document.createElement('button');
    element.type='button';
    element.className=
      `qa-temperature-marker qa-temperature-marker--${kind}`;

    element.setAttribute(
      'aria-label',
      `${row.name}: ${fmt(row.min)}, ${fmt(row.mean)}, ${fmt(row.max)} gradi`
    );

    const icon=document.createElement('span');
    icon.className='qa-temperature-marker__icon';
    icon.textContent=kind==='observed'?'🌡':'▦';

    const values=document.createElement('span');
    values.className='qa-temperature-marker__values';
    values.textContent=
      `${fmt(row.min)} · ${fmt(row.mean)} · ${fmt(row.max)}°`;

    element.append(icon,values);
    return element
  }

  function observedPopup(row,context){
    const provider=String(
      row.sourceTemperature||
      row.network||
      'Rete meteorologica osservazionale'
    );

    return(
      `<strong>${row.name} — ${context.year}</strong>`+
      `<br>Minima media annuale: ${fmt(row.min)} °C`+
      `<br>Temperatura media annuale: ${fmt(row.mean)} °C`+
      `<br>Massima media annuale: ${fmt(row.max)} °C`+
      `<br>Tipo: Misurato`+
      `<br>Fonte temperatura: ${provider}`+
      `<br>Fonte inquinante: ${
        SOURCE_LABELS[context.pollutantSource]||
        context.pollutantSource
      }`+
      `${
        Number.isFinite(Number(row.coverage))
          ?`<br>Copertura annuale: ${fmt(row.coverage)}%`
          :''
      }`
    )
  }

  function eraPopup(row,context){
    return(
      `<strong>Cella ERA5-Land — ${context.year}</strong>`+
      `<br>Minima media annuale: ${fmt(row.min)} °C`+
      `<br>Temperatura media annuale: ${fmt(row.mean)} °C`+
      `<br>Massima media annuale: ${fmt(row.max)} °C`+
      `<br>Tipo: Rielaborazione climatica`+
      `<br>Risoluzione: circa 9 km`+
      `<br>Fonte temperatura: Copernicus ERA5-Land`+
      `<br>Fonte inquinante: ${
        SOURCE_LABELS[context.pollutantSource]||
        context.pollutantSource
      }`
    )
  }

  function addMarkers(map,rows,context,kind){
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
      const element=markerElement(normalized,kind);

      const popup=new maplibregl.Popup({offset:18})
        .setHTML(
          kind==='observed'
            ?observedPopup(normalized,context)
            :eraPopup(normalized,context)
        );

      const marker=new maplibregl.Marker({
        element,
        anchor:'bottom'
      })
        .setLngLat([lon,lat])
        .setPopup(popup)
        .addTo(map);

      markers.push(marker)
    });

    return markers
  }

  function visibleBbox(map){
    const bounds=map?.getBounds?.();
    if(!bounds)return null;

    const west=Math.max(-180,Number(bounds.getWest()));
    const east=Math.min(180,Number(bounds.getEast()));
    const south=Math.max(-85,Number(bounds.getSouth()));
    const north=Math.min(85,Number(bounds.getNorth()));

    if(
      ![west,east,south,north].every(Number.isFinite)||
      west>=east||
      south>=north
    )return null;

    return[
      Number(west.toFixed(4)),
      Number(south.toFixed(4)),
      Number(east.toFixed(4)),
      Number(north.toFixed(4))
    ]
  }

  function overlayYear(value){
    const year=Number(value);

    if(Number.isInteger(year)&&year>=1950){
      return year
    }

    return new Date().getUTCFullYear()-1
  }

  async function renderOverlay(detail){
    const map=detail?.map;
    const side=String(detail?.side||'single');
    const pollutantSource=String(detail?.pollutantSource||'');
    const year=overlayYear(detail?.year);

    if(
      !map||
      !['arpa','eea','openaq'].includes(pollutantSource)
    ){
      clearSide(side);
      return
    }

    const bbox=Array.isArray(detail?.bbox)
      ?detail.bbox
      :visibleBbox(map);

    if(!bbox){
      clearSide(side);
      return
    }

    const requestId=(requestIdBySide.get(side)||0)+1;
    requestIdBySide.set(side,requestId);
    clearSide(side);

    const kind=pollutantSource==='openaq'
      ?'era-cell'
      :'observed';

    setLegend(true,{
      kind:kind==='observed'?'observed':'era-cell',
      year
    });

    try{
      const response=kind==='observed'
        ?await globalThis.QualitaAriaTemperatureProxy?.observed?.({
            pollutantSource,
            year,
            bbox
          })
        :await globalThis.QualitaAriaTemperatureProxy?.viewport?.({
            year,
            bbox
          });

      if(requestIdBySide.get(side)!==requestId)return;

      const rows=Array.isArray(response?.data?.results)
        ?response.data.results
        :[];

      if(!rows.length){
        markersBySide.set(side,[]);

        setLegend(true,{
          kind:kind==='observed'?'observed':'era-cell',
          year,
          status:kind==='observed'
            ?`Nessuna stazione meteorologica con dati annuali sufficienti (${year})`
            :`Nessuna cella ERA5-Land disponibile (${year})`
        });

        return
      }

      markersBySide.set(
        side,
        addMarkers(
          map,
          rows,
          {pollutantSource,year,side},
          kind
        )
      );

      setLegend(true,{
        kind:kind==='observed'?'observed':'era-cell',
        year
      })
    }catch(err){
      console.warn('Overlay temperatura non disponibile.',err);

      if(requestIdBySide.get(side)!==requestId)return;

      markersBySide.set(side,[]);

      setLegend(true,{
        kind:kind==='observed'?'observed':'era-cell',
        year,
        status:kind==='observed'
          ?`Stazioni meteo non disponibili per ${year}`
          :`ERA5-Land non disponibile per ${year}`
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
