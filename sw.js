// Service worker: stores the player itself (the "shell") and serves saved songs with no network.
const SHELL='shell-v6', SONGS='songs-v1';   // change SHELL (and APP_VERSION in player.js) whenever the player files change
const SHELL_FILES=['./','./index.html','./player.js','./manifest.json','./icon.svg'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(SHELL).then(c=>c.addAll(SHELL_FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil((async()=>{
  for(const k of await caches.keys()) if(k!==SHELL&&k!==SONGS) await caches.delete(k);
  await self.clients.claim();})());});
self.addEventListener('fetch',e=>{
  const req=e.request, url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==location.origin) return;
  if(url.pathname.includes('/audio/')){              // saved songs first, then network
    e.respondWith(caches.open(SONGS).then(c=>c.match(req)).then(r=>r||fetch(req)));return;
  }
  e.respondWith((async()=>{                          // shell: cache first, network fallback
    const c=await caches.open(SHELL);
    const hit=await c.match(req,{ignoreSearch:true});
    if(hit) return hit;
    try{return await fetch(req);}catch(err){
      if(req.mode==='navigate') return c.match(new URL('./index.html',self.registration.scope).href);
      throw err;}
  })());
});
