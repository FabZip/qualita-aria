const state={mode:'map',dataset:null,map:null,mapBefore:null,mapAfter:null,deferredPrompt:null,swipe:50,syncing:false,toastTimer:null};
const $=id=>document.getElementById(id);
const years=['2015','2020','2025'];
const monthNames=['Intero anno','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const MAP_STYLE='https://tiles.openfreemap.org/styles/liberty';
const ROME={center:[12.4964,41.9028],zoom:10.2};

function fillYears(){for(const id of ['yearSelect','compareYearA','compareYearB']){$(id).innerHTML=years.map(y=>`<option value="${y}">${y}</option>`).join('')} $('yearSelect').value='2025';$('compareYearA').value='2015';$('compareYearB').value='2025'}
function colorFor(v){if(v<15)return'#35d07f';if(v<20)return'#e6cf43';if(v<25)return'#ff914d';return'#ff5864'}
function avg(rows){return rows.length?rows.reduce((s,r)=>s+r.value,0)/rows.length:0}
function rowsForYear(y){return state.dataset?.years?.[y]||[]}
function toGeoJSON(rows){return{type:'FeatureCollection',features:rows.map(r=>({type:'Feature',properties:{id:r.id,name:r.name,value:r.value},geometry:{type:'Point',coordinates:[r.lon,r.lat]}}))}}
function differenceRows(){const a=rowsForYear($('compareYearA').value),b=rowsForYear($('compareYearB').value);const index=new Map(a.map(r=>[r.id,r]));return b.filter(r=>index.has(r.id)).map(r=>({...r,value:+(r.value-index.get(r.id).value).toFixed(1)}))}
function toDifferenceGeoJSON(rows){return{type:'FeatureCollection',features:rows.map(r=>({type:'Feature',properties:{id:r.id,name:r.name,delta:r.value,absDelta:Math.abs(r.value)},geometry:{type:'Point',coordinates:[r.lon,r.lat]}}))}}

function addAirLayers(map,prefix='air'){
  if(map.getSource(`${prefix}-source`))return;
  map.addSource(`${prefix}-source`,{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  map.addLayer({id:`${prefix}-heat`,type:'heatmap',source:`${prefix}-source`,maxzoom:15,paint:{
    'heatmap-weight':['interpolate',['linear'],['get','value'],0,0,50,1],
    'heatmap-intensity':['interpolate',['linear'],['zoom'],8,.75,12,1.35],
    'heatmap-radius':['interpolate',['linear'],['zoom'],8,38,10,68,12,105],
    'heatmap-opacity':['interpolate',['linear'],['zoom'],8,.58,12,.72,15,.25],
    'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(53,208,127,0)',.12,'rgba(53,208,127,.7)',.35,'rgba(230,207,67,.75)',.58,'rgba(255,145,77,.8)',.82,'rgba(255,88,100,.88)',1,'rgba(174,22,31,.92)']
  }});
  map.addLayer({id:`${prefix}-points`,type:'circle',source:`${prefix}-source`,paint:{
    'circle-radius':['interpolate',['linear'],['zoom'],8,4,11,7,14,10],
    'circle-color':['step',['get','value'],'#35d07f',15,'#e6cf43',20,'#ff914d',25,'#ff5864'],
    'circle-stroke-width':2,'circle-stroke-color':'#fff','circle-opacity':.95
  }});
  map.on('click',`${prefix}-points`,e=>{const f=e.features?.[0];if(!f)return;new maplibregl.Popup({offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<strong>${f.properties.name}</strong><br>${Number(f.properties.value).toFixed(1)} µg/m³`).addTo(map)});
  map.on('mouseenter',`${prefix}-points`,()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave',`${prefix}-points`,()=>map.getCanvas().style.cursor='');
}
function addDifferenceLayers(map){
  if(map.getSource('diff-source'))return;
  map.addSource('diff-source',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  const heatBase={type:'heatmap',source:'diff-source',maxzoom:15,paint:{'heatmap-weight':['interpolate',['linear'],['get','absDelta'],0,0,15,1],'heatmap-intensity':1.2,'heatmap-radius':['interpolate',['linear'],['zoom'],8,42,10,75,12,110],'heatmap-opacity':.68}};
  map.addLayer({...heatBase,id:'diff-good',filter:['<=',['get','delta'],0],paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(24,165,91,0)',.18,'rgba(24,165,91,.35)',.5,'rgba(24,165,91,.62)',1,'rgba(0,117,58,.88)']}});
  map.addLayer({...heatBase,id:'diff-bad',filter:['>',['get','delta'],0],paint:{...heatBase.paint,'heatmap-color':['interpolate',['linear'],['heatmap-density'],0,'rgba(229,71,71,0)',.18,'rgba(229,71,71,.35)',.5,'rgba(229,71,71,.62)',1,'rgba(183,22,22,.9)']}});
  map.addLayer({id:'diff-points',type:'circle',source:'diff-source',paint:{'circle-radius':6,'circle-color':['case',['<=',['get','delta'],0],'#21b866','#ef4f4f'],'circle-stroke-width':2,'circle-stroke-color':'#fff'}});
  map.on('click','diff-points',e=>{const f=e.features?.[0];if(!f)return;const d=Number(f.properties.delta);new maplibregl.Popup({offset:12}).setLngLat(f.geometry.coordinates).setHTML(`<strong>${f.properties.name}</strong><br>Δ ${d>0?'+':''}${d.toFixed(1)} µg/m³`).addTo(map)});
}
function setAirData(map,rows,prefix='air'){const src=map?.getSource(`${prefix}-source`);if(src)src.setData(toGeoJSON(rows))}
function setDifferenceData(map,rows){const src=map?.getSource('diff-source');if(src)src.setData(toDifferenceGeoJSON(rows))}
function setLayerVisibility(map,ids,visible){ids.forEach(id=>{if(map?.getLayer(id))map.setLayoutProperty(id,'visibility',visible?'visible':'none')})}
function showAirOnSingle(rows){setAirData(state.map,rows);setLayerVisibility(state.map,['air-heat','air-points'],true);setLayerVisibility(state.map,['diff-good','diff-bad','diff-points'],false)}
function showDifferenceOnSingle(rows){setDifferenceData(state.map,rows);setLayerVisibility(state.map,['air-heat','air-points'],false);setLayerVisibility(state.map,['diff-good','diff-bad','diff-points'],true)}

function renderStationList(rows,isDiff=false){$('stations').innerHTML=rows.map(r=>`<div class="station-row"><i style="background:${isDiff?(r.value<=0?'#35d07f':'#ff5864'):colorFor(r.value)}"></i><div><strong>${r.name}</strong><small>${r.id}</small></div><b>${isDiff&&r.value>0?'+':''}${r.value.toFixed(1)}</b></div>`).join('')}
function updateCompareMaps(){if(!state.mapBefore||!state.mapAfter)return;const a=rowsForYear($('compareYearA').value),b=rowsForYear($('compareYearB').value);setAirData(state.mapBefore,a,'before');setAirData(state.mapAfter,b,'after');$('beforeBadge').textContent=$('compareYearA').value;$('afterBadge').textContent=$('compareYearB').value;return{a,b}}
function updateSwipe(percent){const p=Math.max(2,Math.min(98,percent));state.swipe=p;$('afterClip').style.clipPath=`inset(0 0 0 ${p}%)`;$('swipeDivider').style.left=`${p}%`;$('swipeDivider').setAttribute('aria-valuenow',String(Math.round(p)))}

function render(){
  if(!state.dataset||!state.map)return;
  const year=$('yearSelect').value,month=+$('monthSelect').value,source=$('sourceSelect').value,sourceName=$('sourceSelect').selectedOptions[0].textContent;
  $('comparePanel').classList.toggle('hidden',state.mode==='map');$('singleYearField').classList.toggle('hidden',state.mode!=='map');
  $('singleMapWrap').classList.toggle('hidden',state.mode==='compare');$('compareMapWrap').classList.toggle('hidden',state.mode!=='compare');
  $('standardLegend').classList.toggle('hidden',state.mode==='difference');$('differenceLegend').classList.toggle('hidden',state.mode!=='difference');
  $('mapBadge').classList.toggle('hidden',state.mode==='compare');
  $('dataNotice').textContent=source==='demo'?'Dati dimostrativi':'Fonte non ancora connessa · fallback demo';
  let rows;
  if(state.mode==='difference'){
    rows=differenceRows();showDifferenceOnSingle(rows);renderStationList(rows,true);$('mapBadge').textContent=`Δ ${$('compareYearB').value} − ${$('compareYearA').value}`;$('avgLabel').textContent='Differenza media';const a=avg(rows);$('avgValue').textContent=`${a>0?'+':''}${a.toFixed(1)}`;$('periodValue').textContent=`${$('compareYearA').value}→${$('compareYearB').value}`;
  }else if(state.mode==='compare'){
    const pair=updateCompareMaps();rows=pair?.b||[];renderStationList(rows);$('avgLabel').textContent=`Media ${$('compareYearB').value}`;$('avgValue').textContent=avg(rows).toFixed(1);$('periodValue').textContent=`${$('compareYearA').value}↔${$('compareYearB').value}`;requestAnimationFrame(()=>{state.mapBefore.resize();state.mapAfter.resize()});
  }else{
    rows=rowsForYear(year);showAirOnSingle(rows);renderStationList(rows);$('mapBadge').textContent=`${$('pollutantSelect').value} · ${year}`;$('avgLabel').textContent='Media';$('avgValue').textContent=avg(rows).toFixed(1);$('periodValue').textContent=month?monthNames[month]:year;
  }
  $('stationCount').textContent=rows.length;$('sourceValue').textContent=sourceName;
}

async function loadData(){const [data,appVersion,dataVersion]=await Promise.all([fetch('data/rome-demo.json',{cache:'no-store'}).then(r=>r.json()),fetch('version.json',{cache:'no-store'}).then(r=>r.json()),fetch('data/version.json',{cache:'no-store'}).then(r=>r.json())]);state.dataset=data;$('appVersion').textContent=appVersion.version;$('dataVersion').textContent=dataVersion.version}
function baseMap(container){return new maplibregl.Map({container,style:MAP_STYLE,center:ROME.center,zoom:ROME.zoom,attributionControl:true})}
function initMaps(){
  state.map=baseMap('map');state.map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');state.map.on('load',()=>{addAirLayers(state.map);addDifferenceLayers(state.map);render()});
  state.mapBefore=baseMap('mapBefore');state.mapAfter=baseMap('mapAfter');
  state.mapBefore.on('load',()=>{addAirLayers(state.mapBefore,'before');if(state.mapAfter.loaded())render()});state.mapAfter.on('load',()=>{addAirLayers(state.mapAfter,'after');if(state.mapBefore.loaded())render()});
  const sync=(from,to)=>{if(state.syncing||!to)return;state.syncing=true;to.jumpTo({center:from.getCenter(),zoom:from.getZoom(),bearing:from.getBearing(),pitch:from.getPitch()});state.syncing=false};
  state.mapBefore.on('move',()=>sync(state.mapBefore,state.mapAfter));state.mapAfter.on('move',()=>sync(state.mapAfter,state.mapBefore));
}
function bindSwipe(){
  const wrap=$('compareMapWrap');let dragging=false;
  const apply=e=>{const r=wrap.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*100;updateSwipe(x)};
  $('swipeDivider').addEventListener('pointerdown',e=>{dragging=true;$('swipeDivider').setPointerCapture(e.pointerId);e.preventDefault()});
  $('swipeDivider').addEventListener('pointermove',e=>{if(dragging)apply(e)});$('swipeDivider').addEventListener('pointerup',()=>dragging=false);$('swipeDivider').addEventListener('pointercancel',()=>dragging=false);
  $('swipeDivider').addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){updateSwipe(state.swipe-3);e.preventDefault()}if(e.key==='ArrowRight'){updateSwipe(state.swipe+3);e.preventDefault()}});
}
function showToast(text){clearTimeout(state.toastTimer);$('toast').textContent=text;$('toast').classList.remove('hidden');state.toastTimer=setTimeout(()=>$('toast').classList.add('hidden'),4800)}
async function installApp(){
  if(window.matchMedia('(display-mode: standalone)').matches){showToast('L’app è già installata sul dispositivo.');return}
  if(state.deferredPrompt){state.deferredPrompt.prompt();await state.deferredPrompt.userChoice;state.deferredPrompt=null;return}
  const isiOS=/iphone|ipad|ipod/i.test(navigator.userAgent);showToast(isiOS?'Su iPhone/iPad: apri Condividi e scegli “Aggiungi alla schermata Home”.':'Apri il menu del browser e scegli “Installa app” o “Aggiungi alla schermata Home”.');
}
function bind(){
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');state.mode=btn.dataset.mode;render()}));
  ['sourceSelect','pollutantSelect','yearSelect','monthSelect','compareYearA','compareYearB'].forEach(id=>$(id).addEventListener('change',render));
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();state.deferredPrompt=e});$('installBtn').addEventListener('click',installApp);bindSwipe();
}
async function boot(){fillYears();bind();await loadData();initMaps();if('serviceWorker'in navigator)navigator.serviceWorker.register('./service-worker.js').then(reg=>reg.update()).catch(console.error)}
boot().catch(err=>{console.error(err);$('dataNotice').textContent='Errore di inizializzazione'})
