const CACHE='qualita-aria-v0.5.1';
const CORE=[
  './','./index.html',
  './css/app.css?v=0.2.0','./css/aria-splash.css?v=0.5.1','./css/trees.css?v=0.5.1','./js/aria-splash.js?v=0.5.1','./js/app.js?v=0.5.1','./js/trees.js?v=0.5.1','./data/trees.json?v=0.5.1','./data/tree-coordinates.json?v=0.5.1','./data/tree-paths.json?v=0.5.1','./data/trees-proxy.json?v=0.5.1','./js/eea-utd.js?v=0.2.14',
  './css/station-list.css?v=0.2.2','./css/openaq-world.css?v=0.2.4','./js/station-list.js?v=0.2.11',
  './js/openaq-proxy.js?v=0.2.11','./js/eea-proxy.js?v=0.2.14','./data/eea-proxy.json?v=0.2.14','./js/temperature-proxy.js?v=0.3.8','./js/temperature-overlay.js?v=0.3.8','./data/temperature-proxy.json?v=0.3.8','./css/temperature.css?v=0.3.8','./js/openaq-world.js?v=0.3.8',
  './manifest.json?v=0.2.0','./version.json?v=0.5.1','./data/version.json?v=0.5.1','./data/italian-capitals.json?v=0.5.1',
  './assets/icons/icon.svg','./assets/icons/icon-192.png','./assets/icons/icon-512.png'
];

self.addEventListener('install',event=>{
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)))
});

self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(
      keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))
    )),
    self.clients.claim()
  ]))
});

self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);

  if(
    url.hostname==='discodata.eea.europa.eu' ||
    url.hostname==='dati.lazio.it' ||
    url.hostname==='www.arpalazio.it' ||
    url.hostname==='raw.githubusercontent.com' ||
    url.hostname.endsWith('.workers.dev') ||
    url.pathname.endsWith('/js/openaq-world.js') ||
    url.pathname.endsWith('/js/eea-utd.js') ||
    url.pathname.endsWith('/js/openaq-proxy.js') ||
    url.pathname.endsWith('/js/eea-proxy.js') ||
    url.pathname.endsWith('/data/eea-proxy.json') ||
    url.pathname.endsWith('/js/temperature-proxy.js') ||
    url.pathname.endsWith('/data/temperature-proxy.json')
  ){
    event.respondWith(fetch(event.request,{cache:'no-store'}));
    return
  }

  if(event.request.mode==='navigate'){
    event.respondWith(
      fetch(event.request,{cache:'no-store'})
        .then(response=>{
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put('./index.html',copy));
          return response
        })
        .catch(()=>caches.match('./index.html'))
    );
    return
  }

  event.respondWith(
    fetch(event.request)
      .then(response=>{
        if(response.ok){
          const copy=response.clone();
          caches.open(CACHE).then(cache=>cache.put(event.request,copy))
        }
        return response
      })
      .catch(()=>caches.match(event.request))
  )
});
