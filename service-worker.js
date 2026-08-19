const CACHE='qualita-aria-v0.1.16';
const CORE=[
  './','./index.html',
  './css/app.css?v=0.1.16','./js/app.js?v=0.1.16',
  './manifest.json?v=0.1.16','./version.json?v=0.1.16','./data/version.json?v=0.1.16',
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

  // Real external data: always network.
  if(
    url.hostname==='discodata.eea.europa.eu' ||
    url.hostname==='dati.lazio.it' ||
    url.hostname==='www.arpalazio.it' ||
    url.hostname==='raw.githubusercontent.com'
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
