(function(){
  let catalogPromise=null;
  let proxyConfigPromise=null;
  const markerGroups=new Map();
  const scopeMaps=new Set();
  const fmt=n=>Number(n).toLocaleString('it-IT');
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  async function catalog(){
    if(!catalogPromise)catalogPromise=fetch('data/trees.json?v=0.4.6',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`Dati arborei: HTTP ${response.status}`);
      return response.json()
    });
    return catalogPromise
  }

  async function proxyConfig(){
    if(!proxyConfigPromise)proxyConfigPromise=fetch('data/trees-proxy.json?v=0.4.6',{cache:'no-store'})
      .then(response=>response.ok?response.json():null)
      .catch(()=>null);
    return proxyConfigPromise
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
      ['tree-scope-fill','tree-scope-line'].forEach(id=>map.getLayer(id)&&map.setLayoutProperty(id,'visibility','none'));
    })
  }

  function balanceOf(event){
    return Number(event?.plantings||0)-Number(event?.decrements||0)
  }

  function scopePopupHtml(event){
    const source=event.source||{};
    const balance=balanceOf(event);
    const extra=event.falls?`<br>Di cui schianti: ${fmt(event.falls)}`:'';
    const forests=event.forestations?`<br>Forestazioni separate: ${fmt(event.forestations)}`:'';
    const partial=event.dataKind==='documented_partial';
    return `<div class="tree-popup"><strong>${escapeHtml(event.locationName)} — ${escapeHtml(event.period)}</strong><br>${partial?'Piantati documentati':'Piantati'}: ${fmt(event.plantings)}<br>${escapeHtml(event.decrementLabel||'Decrementi')}: ${fmt(event.decrements)}${extra}${forests}<br><strong>${partial?'Saldo minimo documentato':'Saldo'}: ${balance>0?'+':''}${fmt(balance)}</strong><br>${partial?'Copertura parziale: non è un totale annuale completo.<br>':''}Ambito: intero Comune<br>Localizzazione puntuale non disponibile<br>Fonte: ${escapeHtml(source.publisher)}<br><a href="${escapeHtml(source.url)}" target="_blank" rel="noopener noreferrer">Documento ufficiale</a></div>`
  }

  function addScopeLayers(map){
    if(map.getSource('tree-scope-source'))return;
    map.addSource('tree-scope-source',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
    map.addLayer({
      id:'tree-scope-fill',type:'fill',source:'tree-scope-source',layout:{visibility:'none'},
      paint:{
        'fill-color':['case',['>=',['get','balance'],0],'#22c55e','#ef4444'],
        'fill-opacity':['interpolate',['linear'],['get','balanceIntensity'],0,.16,1,.42]
      }
    });
    map.addLayer({
      id:'tree-scope-line',type:'line',source:'tree-scope-source',layout:{visibility:'none'},
      paint:{'line-color':['case',['>=',['get','balance'],0],'#15803d','#b91c1c'],'line-width':2}
    });
    map.on('click','tree-scope-fill',event=>{
      const feature=event.features?.[0];
      if(!feature)return;
      const p=feature.properties||{};
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
    map.on('mouseenter','tree-scope-fill',()=>map.getCanvas().style.cursor='pointer');
    map.on('mouseleave','tree-scope-fill',()=>map.getCanvas().style.cursor='')
  }

  function showScope(map,event,boundary){
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
        ...(feature.properties||{}),balance,balanceIntensity,
        locationName:event.locationName,period:event.period,
        plantings:Number(event.plantings||0),decrements:Number(event.decrements||0),
        decrementLabel:event.decrementLabel||'Decrementi',sourceUrl:event.source?.url||'',dataKind:event.dataKind||'official_period'
      }}))
    };
    map.getSource('tree-scope-source').setData(scoped);
    ['tree-scope-fill','tree-scope-line'].forEach(id=>map.setLayoutProperty(id,'visibility','visible'));

    const planted=Number(event.plantings||0);
    const decrements=Number(event.decrements||0);
    const plantedPct=total?planted/total*100:50;
    const size=Math.round(Math.max(58,Math.min(86,46+Math.log10(Math.max(10,total))*10)));
    const el=document.createElement('button');
    el.type='button';
    el.className='tree-balance-marker';
    el.style.width=`${size}px`;
    el.style.height=`${size}px`;
    el.style.setProperty('--planted-angle',`${plantedPct*3.6}deg`);
    el.innerHTML=`<span>${fmt(total)}</span><small>${event.dataKind==='documented_partial'?'minimo':'totale'}</small>`;
    el.setAttribute('aria-label',`Intero Comune: ${fmt(planted)} piantati, ${fmt(decrements)} ${event.decrementLabel||'decrementi'}, saldo ${balance>0?'+':''}${fmt(balance)}`);
    const marker=new maplibregl.Marker({element:el,anchor:'center'})
      .setLngLat(event.coordinates)
      .setPopup(new maplibregl.Popup({offset:Math.ceil(size/2)+8}).setHTML(scopePopupHtml(event)))
      .addTo(map);
    markerGroups.set(map,[...(markerGroups.get(map)||[]),marker])
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
      ...(feature.properties||{}),viewKind:'difference',balance:difference,balanceIntensity,
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

  async function rows(cityId,selection){
    const data=await catalog();
    const city=data.cities[cityId];
    if(!city)return{city:null,events:[],aggregate:null,diagnostic:{reason:'Città non configurata'}};
    const source=city.source||{};
    const events=(city.events||[])
      .filter(event=>String(event.year)===String(selection))
      .map(event=>({...event,dataKind:'official_annual',coverageLabel:'Bilancio ufficiale',source}));
    const aggregate=(city.aggregatePeriods||[]).find(item=>item.selectorValue===selection);
    const localDocumented=(city.documentedEvents||[])
      .filter(event=>String(event.year)===String(selection))
      .map(event=>({...event,source:{publisher:'Roma Capitale',url:event.sourceUrl}}));
    const dynamic=await dynamicEvents(cityId,selection);
    const localSourceUrls=new Set(localDocumented.map(event=>event.sourceUrl));
    const remoteDocumented=dynamic.events
      .filter(event=>!localSourceUrls.has(event.sourceUrl))
      .map(event=>({...event,source:{publisher:'Roma Capitale · aggiornamento automatico',url:event.sourceUrl}}));
    const documentedEvents=[...localDocumented,...remoteDocumented];
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
    const aggregateRecord=aggregate?{...aggregate,source}:null;
    const record=events[0]||documentedSummary||aggregateRecord||null;
    return{
      city,events,aggregate:aggregateRecord,documentedEvents,documentedSummary,record,
      diagnostic:{schemaVersion:data.schemaVersion,city:city.name,selection,available:city.available,officialAnnual:events.length,documentedEvents:documentedEvents.length,dynamicEvents:remoteDocumented.length,dynamicAvailable:dynamic.available,lastSync:dynamic.lastSync,aggregatePeriod:aggregate?.period||null,dataKind:record?.dataKind||null}
    }
  }

  window.TreeStats={rows,show,showScope,showDifferenceScope,clear,fmt,balanceOf};
})();
