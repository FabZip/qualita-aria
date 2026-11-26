(()=>{
  'use strict';
  const pages={nearby:{label:'Dashboard · Intorno a me',icon:'nearby'},alerts:{label:'Allerte',icon:'alerts'},snow:{label:'Neve',icon:'snow'},weather:{label:'Meteo',icon:'weather'},forecast:{label:'Previsioni qualità dell’aria',icon:'air'},eea:{label:'Qualità dell’aria · EEA',icon:'air'},openaq:{label:'Qualità dell’aria · OpenAQ',icon:'air'},trees:{label:'Alberi',icon:'trees'},fires:{label:'Incendi',icon:'fires'},earthquakes:{label:'Terremoti',icon:'earthquakes'},diary:{label:'Diario ambientale',icon:'diary'}};
  const nextPages={alerts:'snow',snow:'weather',weather:'forecast',forecast:'trees',eea:'trees',openaq:'trees',trees:'fires',fires:'earthquakes',earthquakes:'diary'};
  const nextLabels={snow:'Neve',weather:'Meteo',forecast:'Qualità dell’aria',trees:'Alberi',fires:'Incendi',earthquakes:'Terremoti',diary:'Diario ambientale'};
  const nextDescriptions={snow:'Nevicate previste e avvisi ufficiali per neve e ghiaccio.',weather:'Previsioni, temperature e radar per la località scelta.',forecast:'Previsioni degli inquinanti per i prossimi giorni.',trees:'Piantumazioni e abbattimenti documentati dalle fonti comunali.',fires:'Aree bruciate e ultimi incendi segnalati.',earthquakes:'Ultimi terremoti registrati, magnitudo e posizione sulla mappa.',diary:'Eventi ambientali filtrabili per periodo, distanza e categoria.'};
  const route=hash=>{const key=String(hash||'').replace(/^#/,'');return Object.hasOwn(pages,key)?key:null};
  globalThis.AppNavigation={pages,route,nextPages};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),menu=$('appMenu'),toggle=$('appMenuToggle'),nav=$('appNavigation');
  const icon=name=>name==='nearby'?'<span class="app-special-icon" aria-hidden="true">⌂</span>':name==='diary'?'<span class="app-special-icon" aria-hidden="true">▤</span>':globalThis.Environment.icon(name);
  menu.innerHTML=Object.entries(pages).map(([name,page])=>`<a href="#${name}" data-page="${name}"><span class="app-nav-icon">${icon(page.icon)}</span><span>${page.label}</span></a>`).join('');
  let restoring=false;
  function close(focus=false){menu.hidden=true;toggle.setAttribute('aria-expanded','false');if(focus)toggle.focus()}
  function sync(){
    const name=source();document.documentElement?.setAttribute('data-app-page',name);
    const next=$('pageNext'),target=nextPages[name];
    if(next){next.hidden=!target;next.innerHTML=target?`${icon(pages[target].icon)}<div><strong>${nextLabels[target]}</strong><p>${nextDescriptions[target]}</p></div><a class="page-next-button" href="#${target}">Consulta ${nextLabels[target]}</a>`:''}
    const heading=$('sectionHeading');
    if(heading){const info={weather:['Meteo','Previsioni e radar per la località scelta.'],eea:['Qualità dell’aria','Misure delle stazioni EEA.'],openaq:['Qualità dell’aria','Stazioni e misure dal catalogo OpenAQ.'],forecast:['Previsioni qualità dell’aria','L’evoluzione degli inquinanti nei prossimi giorni.'],trees:['Alberi','Interventi documentati e bilanci delle fonti comunali.']}[name];heading.hidden=!info;if(info)heading.innerHTML=`${globalThis.Environment.icon(pages[name].icon)}<div><h1>${info[0]}</h1><p>${info[1]}</p></div>`}
    $('appCurrentPage').textContent=name==='nearby'?'':pages[name]?.label||'';
    nav.querySelectorAll('[data-page]').forEach(link=>{if(link.dataset.page===name)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current')});close()
  }
  const baseChange=changeSource;
  changeSource=function(){const result=baseChange();sync();if(!restoring&&route(location.hash)!==source())history.pushState({ariaPage:source()},'',`#${source()}`);return result};
  function navigate(name){if(!Object.hasOwn(pages,name))return;if(source()===name){close();return}$('sourceSelect').value=name;changeSource();window.scrollTo({top:0,behavior:'auto'});$('appCurrentPage').textContent=name==='nearby'?'':pages[name].label}
  toggle.addEventListener('click',()=>{const open=menu.hidden;menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open))});
  nav.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.button>0)return;const link=event.target.closest('a[data-page]');if(!link)return;event.preventDefault();navigate(link.dataset.page);if(event.detail===0)toggle.focus()});
  document.addEventListener('click',event=>{if(!nav.contains(event.target))close()});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close(true)}});
  nav.addEventListener('focusout',event=>{if(event.relatedTarget&&!nav.contains(event.relatedTarget))close()});
  window.addEventListener('popstate',()=>{const name=route(location.hash)||'nearby';restoring=true;try{navigate(name);sync()}finally{restoring=false}});
  window.addEventListener('hashchange',()=>{const name=route(location.hash);if(!name||name===source())return;restoring=true;try{navigate(name)}finally{restoring=false}});
  const initial=route(location.hash)||'nearby';$('sourceSelect').value=initial;history.replaceState({ariaPage:initial},'',`#${initial}`);sync();
  Object.assign(globalThis.AppNavigation,{navigate,sync});
})();
