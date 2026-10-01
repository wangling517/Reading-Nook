const CACHE='reading-house-shell-v2.2.0';
const ASSETS=['./pets-model.js','./pets-ui.js','./pet-art.js','./pets.css','./vendor/three.js',...['bunny','cat','dog','monkey','phoenix'].flatMap(id=>[0,1,2].map(stage=>'./pets/'+id+'-'+stage+'.png')),'./','./index.html','./styles.css','./island.css','./account.css','./reading.css','./reading-ui.js','./island.js','./app.js','./account-ui.js','./cloud-api.js','./cloud-config.js','./sync.js','./sync-model.js','./vendor/supabase.js','./core.js','./store.js','./backup.js','./recorder.js','./art.svg','./manifest.webmanifest','./icons/icon-192.png','./icons/icon-512.png','./icons/maskable-512.png'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const key of await caches.keys())if(key.startsWith('reading-house-shell-')&&key!==CACHE)await caches.delete(key);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.href.startsWith(self.registration.scope))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),hit=await cache.match(event.request,{ignoreSearch:true});
    if(hit)return hit;
    if(event.request.mode==='navigate')return await cache.match('./index.html')||fetch(event.request);
    return fetch(event.request);
  })());
});
