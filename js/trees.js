(function(){
  let catalogPromise=null;
  let coordinatesPromise=null;
  let pathsPromise=null;
  let proxyConfigPromise=null;
  const markerGroups=new Map();
  const eventMarkerGroups=new Map();
  const scopeMaps=new Set();
  const fmt=n=>Number(n).toLocaleString('it-IT');
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  async function catalog(){
    if(!catalogPromise)catalogPromise=fetch('data/trees.json?v=0.5.11',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`Dati arborei: HTTP ${response.status}`);
      return response.json()
    });
    return catalogPromise
  }

  async function proxyConfig(){
    if(!proxyConfigPromise)proxyConfigPromise=fetch('data/trees-proxy.json?v=0.5.11',{cache:'no-store'})
      .then(response=>response.ok?response.json():null)
      .catch(()=>null);
    return proxyConfigPromise
  }

  async function coordinatesCatalog(){
    if(!coordinatesPromise)coordinatesPromise=fetch('data/tree-coordinates.json?v=0.5.11',{cache:'no-store'})
      .then(response=>response.ok?response.json():{events:{}})
      .catch(()=>({events:{}}));
    return coordinatesPromise
  }

  async function pathsCatalog(){
    if(!pathsPromise)pathsPromise=fetch('data/tree-paths.json?v=0.5.11',{cache:'no-store'})
      .then(response=>response.ok?response.json():{events:{}})
      .catch(()=>({events:{}}));
    return pathsPromise
  }

  async function dynamicEvents(cityId,year){
    const config=await proxyConfig();
    const baseUrl=String(config?.base_url||'').replace(/\/+$/,'');
    if(!config?.enabled||!baseUrl)return{events:[],lastSync:null,available:false};
    try{
      const url=new URL(`${baseUrl}/v1/trees/events`);
      url.searchParams.set('city',cityId);
      url.searchParams.set('year',String(year));
      const response=await fetch(url,{mode:'cors',cache:'no-store',headers:{Accept:'application/json'}});
      if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const payload=await response.json();
      return{events:Array.isArray(payload.events)?payload.events:[],lastSync:payload.lastSync||null,available:true}
    }catch(error){
      return{events:[],lastSync:null,available:false,error:String(error?.message||error)}
    }
  }

  function clear(targetMap=null){
    const maps=targetMap?[targetMap]:[...scopeMaps];
    maps.forEach(map=>{
      const markers=markerGroups.get(map)||[];
      while(markers.length)markers.pop().remove();
      markerGroups.delete(map);
      eventMarkerGroups.delete(map);
      map.getSource('tree-active-path')?.setData({type:'FeatureCollection',features:[]});
      ['tree-scope-fill','tree-scope-line'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility','none'));
    })
  }

  function balanceOf(event){
    return Number(event?.plantings||0)-Number(event?.decrements||0)
  }

  function addScopeLayers(map){
    if(map.getSource('tree-scope-source'))return;
    map.addSource('tree-scope-source',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    const beforeId=map.getStyle()?.layers?.find(layer=>layer.type==='symbol'&&layer.layout?.['text-field'])?.id;
    map.addLayer({
      id:'tree-scope-fill',type:'fill',source:'tree-scope-source',layout:{visibility:'none'},
      paint:{
        'fill-color':['case',['>=',['get','balance'],0],'#22c55e','#ef4444'],
        'fill-opacity':['interpolate',['linear'],['get','balanceIntensity'],0,.06,1,.14]
      }
    },beforeId);
    map.addLayer({
      id:'tree-scope-line',type:'line',source:'tree-scope-source',layout:{visibility:'none'},
      paint:{'line-color':['case',['>=',['get','balance'],0],'#15803d','#b91c1c'],'line-width':1.5,'line-opacity':.72}
    },beforeId);
    map.on('click','tree-scope-fill',event=>{
      const feature=event.features?.[0];
      if(!feature)return;
      const p=feature.properties||{};
      if(p.popupEnabled===false||p.popupEnabled===0||p.popupEnabled==='false')return;
      const balance=Number(p.balance||0);
      if(p.viewKind==='difference'){
        const partial=p.dataKind==='documented_partial';
        new maplibregl.Popup({offset:12})
          .setLngLat(event.lngLat)
          .setHTML(`<div class="tree-popup"><strong>${escapeHtml(p.locationName)} — ${escapeHtml(p.period)}</strong><br>${partial?'Saldo minimo':'Saldo'} iniziale: ${Number(p.balanceA)>0?'+':''}${fmt(p.balanceA)}<br>${partial?'Saldo minimo':'Saldo'} finale: ${Number(p.balanceB)>0?'+':''}${fmt(p.balanceB)}<br><strong>Variazione${partial?' del minimo documentato':''}: ${balance>0?'+':''}${fmt(balance)}</strong><br>${partial?'Copertura parziale.<br>':''}Ambito: intero Comune</div>`)
          .addTo(map);
        return
      }
      new maplibregl.Popup({offset:12})
        .setLngLat(event.lngLat)
        .setHTML(`<div class="tree-popup"><strong>${escapeHtml(p.locationName)} — ${escapeHtml(p.period)}</strong><br>${p.dataKind==='documented_partial'?'Piantati documentati':'Piantati'}: ${fmt(p.plantings)}<br>${escapeHtml(p.decrementLabel)}: ${fmt(p.decrements)}<br><strong>${p.dataKind==='documented_partial'?'Saldo minimo documentato':'Saldo'}: ${balance>0?'+':''}${fmt(balance)}</strong><br>${p.dataKind==='documented_partial'?'Copertura parziale: non è un totale annuale completo.<br>':''}Ambito: intero Comune<br>Localizzazione puntuale non disponibile<br><a href="${escapeHtml(p.sourceUrl)}" target="_blank" rel="noopener noreferrer">Documento ufficiale</a></div>`)
        .addTo(map)
    });
    map.on('mousemove','tree-scope-fill',event=>{
      const p=event.features?.[0]?.properties||{};
      map.getCanvas().style.cursor=(p.popupEnabled===false||p.popupEnabled===0||p.popupEnabled==='false')?'':'pointer'
    });
    map.on('mouseleave','tree-scope-fill',()=>map.getCanvas().style.cursor='');
  }

  function showScope(map,event,boundary,popupEnabled=true){
    clear(map);
    addScopeLayers(map);
    scopeMaps.add(map);
    if(!event||!boundary?.features?.length){
      ['tree-scope-fill','tree-scope-line'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility','none'));
      map.getSource('tree-scope-source')?.setData({type:'FeatureCollection',features:[]});
      return
    }

    const balance=balanceOf(event);
    const total=Number(event.plantings||0)+Number(event.decrements||0);
    const balanceIntensity=total?Math.min(1,Math.abs(balance)/total):0;
    const scoped={
      ...boundary,
      features:boundary.features.map(feature=>({...feature,properties:{
        ...(feature.properties||{}),balance,balanceIntensity,popupEnabled,
        locationName:event.locationName,period:event.period,
        plantings:Number(event.plantings||0),decrements:Number(event.decrements||0),
        decrementLabel:event.decrementLabel||'Decrementi',sourceUrl:event.source?.url||'',dataKind:event.dataKind||'official_period'
      }}))
    };
    map.getSource('tree-scope-source').setData(scoped);
    ['tree-scope-fill','tree-scope-line'].forEach(id=>map.setLayoutProperty(id,'visibility','visible'));

  }

  function showDifferenceScope(map,recordA,recordB,boundary,yearA,yearB){
    clear(map);
    addScopeLayers(map);
    scopeMaps.add(map);
    if(!recordA||!recordB||!boundary?.features?.length){
      map.getSource('tree-scope-source')?.setData({type:'FeatureCollection',features:[]});
      return null
    }
    if(recordA.dataKind!==recordB.dataKind)return null;
    const balanceA=balanceOf(recordA);
    const balanceB=balanceOf(recordB);
    const difference=balanceB-balanceA;
    const balanceIntensity=Math.min(1,Math.abs(difference)/Math.max(1,Math.abs(balanceA),Math.abs(balanceB)));
    const scoped={...boundary,features:boundary.features.map(feature=>({...feature,properties:{
      ...(feature.properties||{}),viewKind:'difference',balance:difference,balanceIntensity,popupEnabled:true,
      balanceA,balanceB,dataKind:recordA.dataKind,locationName:recordB.locationName,period:`${yearA} → ${yearB}`
    }}))};
    map.getSource('tree-scope-source').setData(scoped);
    ['tree-scope-fill','tree-scope-line'].forEach(id=>map.setLayoutProperty(id,'visibility','visible'));

    const el=document.createElement('button');
    el.type='button';
    el.className=`tree-difference-marker ${difference>=0?'is-positive':'is-negative'}`;
    const partial=recordA.dataKind==='documented_partial';
    el.innerHTML=`<span>${difference>0?'+':''}${fmt(difference)}</span><small>${partial?'Δ minimo':'Δ saldo'}</small>`;
    el.setAttribute('aria-label',`Variazione del saldo arboreo da ${yearA} a ${yearB}: ${difference>0?'+':''}${fmt(difference)}`);
    const marker=new maplibregl.Marker({element:el,anchor:'center'})
      .setLngLat(recordB.coordinates)
      .setPopup(new maplibregl.Popup({offset:44}).setHTML(`<div class="tree-popup"><strong>${escapeHtml(recordB.locationName)} — ${yearA} → ${yearB}</strong><br>${partial?'Saldo minimo':'Saldo'} iniziale: ${balanceA>0?'+':''}${fmt(balanceA)}<br>${partial?'Saldo minimo':'Saldo'} finale: ${balanceB>0?'+':''}${fmt(balanceB)}<br><strong>Variazione${partial?' del minimo documentato':''}: ${difference>0?'+':''}${fmt(difference)}</strong><br>${partial?'Copertura parziale.<br>':''}Ambito: intero Comune</div>`))
      .addTo(map);
    markerGroups.set(map,[marker]);
    return{balanceA,balanceB,difference,dataKind:recordA.dataKind}
  }

  function eventMarkers(event){
    const result=[];
    if(Number.isFinite(event.plantings))result.push({kind:'planting',color:'#22c55e',quantity:event.plantings,label:'Piantumazioni'});
    if(Number.isFinite(event.decrements))result.push({kind:'decrement',color:'#ef4444',quantity:event.decrements,label:event.decrementLabel||'Decrementi'});
    return result
  }

  function popupHtml(event,item){
    const source=event.source;
    const precision=event.locationPrecision==='point'?'Posizione precisa fornita dalla fonte':event.locationPrecision==='address'?'Posizione approssimata dall’indirizzo':'Localizzazione puntuale non disponibile';
    const extra=event.falls?`<br>Di cui schianti: ${fmt(event.falls)}`:'';
    const forests=event.forestations?`<br>Forestazioni separate: ${fmt(event.forestations)}`:'';
    return `<div class="tree-popup"><strong>${escapeHtml(event.locationName)} — ${escapeHtml(event.period)}</strong><br>Tipo: ${escapeHtml(item.label)}<br>Stato: Eseguito<br>Quantità: ${fmt(item.quantity)} alberi${extra}${forests}<br>Posizione: ${precision}<br>Fonte: ${escapeHtml(source.publisher)}<br><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Documento ufficiale</a></div>`
  }

  function show(map,events){
    clear(map);
    events.forEach((event,eventIndex)=>{
      eventMarkers(event).forEach((item,itemIndex)=>{
        const el=document.createElement('button');
        el.type='button';
        el.className='tree-marker';
        el.style.color=item.color;
        el.innerHTML='<svg viewBox="0 0 32 38" width="28" height="34" aria-hidden="true"><path fill="currentColor" d="M16 1 9 11h4L6 21h6L4 32h10v5h4v-5h10l-8-11h6l-7-10h4z"/><path fill="#6b4423" d="M14 31h4v7h-4z"/></svg>';
        el.title=`${item.label}: ${fmt(item.quantity)}`;
        el.setAttribute('aria-label',el.title);
        const offset=(itemIndex-(eventMarkers(event).length-1)/2)*34;
        const marker=new maplibregl.Marker({element:el,anchor:'bottom',offset:[offset,0]})
          .setLngLat(event.coordinates)
          .setPopup(new maplibregl.Popup({offset:26}).setHTML(popupHtml(event,item)))
          .addTo(map);
        markerGroups.set(map,[...(markerGroups.get(map)||[]),marker])
      })
    })
  }

  function treeIconSvg(variant){
    const crown=variant===1
      ?'<circle cx="22" cy="15" r="10"/><circle cx="14" cy="21" r="9"/><circle cx="29" cy="23" r="10"/>'
      :variant===2
        ?'<path d="M22 2 10 19h7L7 31h30L27 19h7z"/>'
        :'<path d="M22 3c-7 0-11 6-9 12-7 2-8 12-1 15h21c7-4 5-14-2-15 1-7-3-12-9-12z"/>';
    return`<svg viewBox="0 0 44 52" aria-hidden="true"><g fill="currentColor">${crown}</g><path fill="#6b4423" d="M19 29h6v18h-6z"/><path fill="rgba(255,255,255,.34)" d="M13 18c3-6 8-8 13-7-5 2-8 5-9 10z"/></svg>`
  }

  function iconSvg(event){
    const variant=Math.abs([...String(event?.id||'tree')].reduce((sum,char)=>sum+char.charCodeAt(0),0))%3;
    return treeIconSvg(variant)
  }

  function documentedPopupHtml(event){
    const type=event.eventType==='planting'?'Piantumazione':event.eventType==='decrement'?'Abbattimento':'Evento arboreo';
    const multilocation=Array.isArray(event.markerCoordinates)&&event.markerCoordinates.length>1;
    const quantity=Number.isFinite(event.quantity)?`${fmt(event.quantity)} alberi`:'quantità non specificata';
    const precision=event.locationPrecision==='district'?'Posizione indicativa nell’area di competenza':'Posizione ricavata dall’indirizzo documentato';
    return`<div class="tree-popup"><strong>${escapeHtml(event.locationName)}</strong><br>${escapeHtml(event.date||event.year)}<br>Tipo: ${type}<br>${multilocation?'Quantità complessiva':'Quantità'}: ${quantity}${multilocation?`<br>Punti visualizzati: ${event.markerCoordinates.length}<br>Ripartizione per luogo non specificata.`:''}<br>${precision}<br><a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noopener noreferrer">Fonte ufficiale</a></div>`
  }

  function showDocumentedEvents(map,events=[]){
    const byId=new Map();
    events.filter(event=>Array.isArray(event.coordinates)&&event.coordinates.length===2).forEach((event,index)=>{
      const quantity=Number.isFinite(event.quantity)?event.quantity:1;
      const size=Math.round(Math.max(28,Math.min(54,27+Math.log10(Math.max(1,quantity))*10)));
      const markerCoordinates=Array.isArray(event.markerCoordinates)&&event.markerCoordinates.length
        ?event.markerCoordinates
        :[event.coordinates];
      const entry={markers:[],elements:[],event};
      markerCoordinates.forEach((coordinates,locationIndex)=>{
        if(!Array.isArray(coordinates)||coordinates.length!==2)return;
        const el=document.createElement('button');
        el.type='button';
        el.className=`tree-event-marker ${event.eventType==='planting'?'is-planted':'is-cut'} ${event.status==='planned'?'is-planned':''}`;
        el.dataset.treeMarkerId=String(event.id);
        el.style.width=`${size}px`;
        el.style.height=`${Math.round(size*1.18)}px`;
        el.innerHTML=iconSvg({...event,id:`${event.id}-${locationIndex}`});
        el.setAttribute('aria-label',`${event.eventType==='planting'?'Piantumazione':'Abbattimento'}: ${event.locationName}, località ${locationIndex+1} di ${markerCoordinates.length}, ${Number.isFinite(event.quantity)?fmt(event.quantity):'quantità non specificata'} alberi complessivi`);
        const marker=new maplibregl.Marker({element:el,anchor:'bottom'})
          .setLngLat(coordinates)
          .setPopup(new maplibregl.Popup({offset:Math.ceil(size*.65)}).setHTML(documentedPopupHtml(event)))
          .addTo(map);
        el.addEventListener('click',()=>focusEvent(map,event.id,marker));
        markerGroups.set(map,[...(markerGroups.get(map)||[]),marker]);
        entry.markers.push(marker);
        entry.elements.push(el)
      });
      if(entry.markers.length)byId.set(String(event.id),entry)
    });
    eventMarkerGroups.set(map,byId)
  }

  function addActivePathLayers(map){
    if(map.getSource('tree-active-path'))return;
    map.addSource('tree-active-path',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    const beforeId=map.getStyle()?.layers?.find(layer=>layer.type==='symbol'&&layer.layout?.['text-field'])?.id;
    map.addLayer({
      id:'tree-active-path-casing',type:'line',source:'tree-active-path',
      layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'rgba(255,255,255,.92)','line-width':['interpolate',['linear'],['zoom'],10,7,14,11,17,15],'line-opacity':.95}
    },beforeId);
    map.addLayer({
      id:'tree-active-path-line',type:'line',source:'tree-active-path',
      layout:{'line-cap':'round','line-join':'round'},
      paint:{'line-color':'#38bdf8','line-width':['interpolate',['linear'],['zoom'],10,4,14,7,17,10],'line-opacity':.92}
    },beforeId)
  }

  function pathCoordinates(path){
    return(path?.features||[]).flatMap(feature=>feature.geometry?.type==='LineString'?feature.geometry.coordinates:[])
  }

  function resolveEventPath(pathData,eventId){
    const value=pathData.events?.[eventId];
    return value?.ref?pathData.shared?.[value.ref]||null:value||null
  }

  function distanceKm(a,b){
    const rad=value=>value*Math.PI/180;
    const dLat=rad(b[1]-a[1]),dLon=rad(b[0]-a[0]);
    const h=Math.sin(dLat/2)**2+Math.cos(rad(a[1]))*Math.cos(rad(b[1]))*Math.sin(dLon/2)**2;
    return 12742*Math.asin(Math.sqrt(h))
  }

  function nearestPathPoint(coordinates,path){
    let nearest=null;
    (path?.features||[]).forEach(feature=>{
      const points=feature.geometry?.type==='LineString'?feature.geometry.coordinates:[];
      for(let index=1;index<points.length;index+=1){
        const start=points[index-1],end=points[index];
        const scale=Math.cos((coordinates[1]+start[1]+end[1])/3*Math.PI/180);
        const dx=(end[0]-start[0])*scale,dy=end[1]-start[1];
        const px=(coordinates[0]-start[0])*scale,py=coordinates[1]-start[1];
        const length=dx*dx+dy*dy;
        const ratio=length?Math.max(0,Math.min(1,(px*dx+py*dy)/length)):0;
        const point=[start[0]+(end[0]-start[0])*ratio,start[1]+(end[1]-start[1])*ratio];
        const distance=distanceKm(coordinates,point);
        if(!nearest||distance<nearest.distance)nearest={point,distance}
      }
    });
    return nearest
  }

  function alignedCoordinates(coordinates,path){
    const points=pathCoordinates(path);
    if(!Array.isArray(coordinates)||coordinates.length!==2||!points.length)return coordinates;
    const bounds=points.reduce((result,point)=>({
      west:Math.min(result.west,point[0]),east:Math.max(result.east,point[0]),
      south:Math.min(result.south,point[1]),north:Math.max(result.north,point[1])
    }),{west:points[0][0],east:points[0][0],south:points[0][1],north:points[0][1]});
    const isArea=path.features.some(feature=>feature.properties?.precision==='area-outline');
    if(isArea&&coordinates[0]>=bounds.west&&coordinates[0]<=bounds.east&&coordinates[1]>=bounds.south&&coordinates[1]<=bounds.north)return coordinates;
    const current=nearestPathPoint(coordinates,path);
    if(current?.distance<=.15)return coordinates;
    const center=[(bounds.west+bounds.east)/2,(bounds.south+bounds.north)/2];
    return nearestPathPoint(center,path)?.point||center
  }

  function prepareDocumentedPaths(events){
    return events.map(event=>({...event,path:event.ownPath||event.path||null}))
  }

  function focusEvent(map,eventId,preferredMarker=null){
    const selected=eventMarkerGroups.get(map)?.get(String(eventId));
    if(!selected)return false;
    const {markers,event}=selected;
    const marker=preferredMarker||markers[0];
    eventMarkerGroups.get(map)?.forEach((item,id)=>{
      item.markers.forEach(itemMarker=>{
        if(itemMarker!==marker)itemMarker.getPopup()?.remove()
      });
      item.elements.forEach(element=>{
        element.classList.toggle('is-muted',id!==String(eventId));
        element.classList.toggle('is-selected',id===String(eventId))
      })
    });
    addActivePathLayers(map);
    const path=event.path?.features?.length?event.path:{type:'FeatureCollection',features:[]};
    map.getSource('tree-active-path').setData(path);
    const coordinates=pathCoordinates(path);
    if(coordinates.length>1){
      const bounds=coordinates.reduce((box,coordinate)=>box.extend(coordinate),new maplibregl.LngLatBounds(coordinates[0],coordinates[0]));
      map.fitBounds(bounds,{padding:{top:64,bottom:64,left:48,right:48},maxZoom:16.5,duration:900,essential:true})
    }else map.flyTo({center:marker.getLngLat(),zoom:15.2,duration:900,essential:true});
    window.setTimeout(()=>{
      const popup=marker.getPopup();
      if(popup&&!popup.isOpen())marker.togglePopup()
    },650);
    return true
  }

  async function rows(cityId,selection){
    const [data,coordinateData,pathData]=await Promise.all([catalog(),coordinatesCatalog(),pathsCatalog()]);
    const city=data.cities[cityId];
    if(!city)return{city:null,events:[],aggregate:null,diagnostic:{reason:'Città non configurata'}};
    const source=city.source||{};
    const events=(city.events||[])
      .filter(event=>String(event.year)===String(selection))
      .map(event=>({...event,dataKind:'official_annual',coverageLabel:'Bilancio ufficiale',source}));
    const aggregate=(city.aggregatePeriods||[]).find(item=>item.selectorValue===selection);
    const localDocumented=(city.documentedEvents||[])
      .filter(event=>String(event.year)===String(selection))
      .map(event=>{
        const location=coordinateData.events?.[event.id];
        const ownPath=resolveEventPath(pathData,event.id);
        const markerCoordinates=Array.isArray(ownPath?.properties?.markerCoordinates)?ownPath.properties.markerCoordinates:null;
        const coordinates=markerCoordinates?.[0]||alignedCoordinates(location?.coordinates||event.coordinates,ownPath);
        return{...event,coordinates,markerCoordinates,locationPrecision:location?.precision||event.locationPrecision,ownPath,path:ownPath,source:{publisher:'Roma Capitale',url:event.sourceUrl}}
      });
    const dynamic=await dynamicEvents(cityId,selection);
    const localSourceUrls=new Set(localDocumented.map(event=>event.sourceUrl));
    const remoteDocumented=dynamic.events
      .filter(event=>!localSourceUrls.has(event.sourceUrl))
      .map(event=>({...event,source:{publisher:'Roma Capitale · aggiornamento automatico',url:event.sourceUrl}}));
    const documentedEvents=prepareDocumentedPaths([...localDocumented,...remoteDocumented]);
    const completed=documentedEvents.filter(event=>
      ['completed','emergency_completed'].includes(event.status)&&Number.isFinite(event.quantity)
    );
    const plantings=completed
      .filter(event=>event.eventType==='planting')
      .reduce((sum,event)=>sum+event.quantity,0);
    const decrements=completed
      .filter(event=>event.eventType==='decrement')
      .reduce((sum,event)=>sum+event.quantity,0);
    const documentedSummary=completed.length?{
      id:`${cityId}-${selection}-documented-minimum`,year:String(selection),period:String(selection),
      locationName:city.name,locationPrecision:'city',coordinates:city.center,status:'reported',
      plantings,decrements,decrementLabel:'Abbattimenti documentati',
      dataKind:'documented_partial',coverageLabel:'Totale minimo documentato',
      notes:'Somma dei soli eventi pubblici raccolti con quantità nota e stato eseguito. Non rappresenta il totale annuale completo.',
      source:{publisher:'Roma Capitale · avvisi e notizie ufficiali',url:'https://www.comune.roma.it/web/it/informazioni-di-servizio.page?tem=verde_urbano'}
    }:null;
    const aggregateRecord=aggregate?{
      ...aggregate,
      source:aggregate.sourceUrl?{publisher:'Roma Capitale',url:aggregate.sourceUrl}:source
    }:null;
    const record=events[0]||documentedSummary||aggregateRecord||null;
    return{
      city,events,aggregate:aggregateRecord,documentedEvents,documentedSummary,record,
      diagnostic:{schemaVersion:data.schemaVersion,city:city.name,selection,available:city.available,officialAnnual:events.length,documentedEvents:documentedEvents.length,dynamicEvents:remoteDocumented.length,dynamicAvailable:dynamic.available,lastSync:dynamic.lastSync,aggregatePeriod:aggregate?.period||null,dataKind:record?.dataKind||null}
    }
  }

  window.TreeStats={rows,show,showScope,showDifferenceScope,showDocumentedEvents,focusEvent,iconSvg,clear,fmt,balanceOf};
})();
