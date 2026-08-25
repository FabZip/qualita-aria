(function(){
  let catalogPromise=null;
  const markers=[];
  const fmt=n=>Number(n).toLocaleString('it-IT');
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  async function catalog(){
    if(!catalogPromise)catalogPromise=fetch('data/trees.json?v=0.4.0',{cache:'no-store'}).then(response=>{
      if(!response.ok)throw new Error(`Dati arborei: HTTP ${response.status}`);
      return response.json()
    });
    return catalogPromise
  }

  function clear(){while(markers.length)markers.pop().remove()}

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
    clear();
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
        markers.push(marker)
      })
    })
  }

  async function rows(cityId,year){
    const data=await catalog();
    const city=data.cities[cityId];
    if(!city)return{city:null,events:[],aggregate:null,diagnostic:{reason:'Città non configurata'}};
    const source=city.source||{};
    const events=(city.events||[]).filter(event=>String(event.year)===String(year)).map(event=>({...event,source}));
    const aggregate=(city.aggregatePeriods||[]).find(item=>Number(year)>=item.fromYear&&Number(year)<=item.toYear);
    return{city,events,aggregate:aggregate?{...aggregate,source}:null,diagnostic:{schemaVersion:data.schemaVersion,city:city.name,year,available:city.available,events:events.length,aggregatePeriod:aggregate?.period||null}}
  }

  window.TreeStats={rows,show,clear,fmt};
})();
