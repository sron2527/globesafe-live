const CACHE='globesafe-live-v3-5-shell';
const APP_SHELL=['./','./index.html','./style.css?v=35','./app.js?v=35','./manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(APP_SHELL).catch(()=>{})).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);

  if(url.origin!==location.origin){
    event.respondWith(fetch(req));
    return;
  }

  event.respondWith(
    fetch(req).then(resp=>{
      const copy=resp.clone();
      caches.open(CACHE).then(cache=>cache.put(req,copy)).catch(()=>{});
      return resp;
    }).catch(()=>caches.match(req).then(cached=>cached||caches.match('./index.html')))
  );
});
