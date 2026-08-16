const CACHE='qualita-aria-v0.1.2';
const CORE=[
  './','./index.html','./css/app.css?v=0.1.2','./js/app.js?v=0.1.2','./manifest.json?v=0.1.2',
  './version.json?v=0.1.2','./data/version.json?v=0.1.2','./data/rome-demo.json?v=0.1.2',
  './assets/icons/icon.svg','./assets/icons/icon-192.png','./assets/icons/icon-512.png'
];
self.addEventListener('install',event=>{
  self.skipWaiting();event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)))
});
self.addEventListener('activate',event=>{
  event.waitUntil(Promise.all([
    caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))),
    self.clients.claim()
  ]))
});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET')return;
  const url=new URL(event.request.url);
  if(url.hostname==='air.discomap.eea.europa.eu'){
    event.respondWith(fetch(event.request,{cache:'no-store'}));return
  }
  if(event.request.mode==='navigate'){
    event.respondWith(fetch(event.request,{cache:'no-store'}).then(response=>{
      const copy=response.clone();caches.open(CACHE).then(cache=>cache.put('./index.html',copy));return response
    }).catch(()=>caches.match('./index.html')));return
  }
  event.respondWith(fetch(event.request).then(response=>{
    if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy))}
    return response
  }).catch(()=>caches.match(event.request)))
});
