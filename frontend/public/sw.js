/* Somente a interface pública entra no Cache Storage. Dados privados usam o cofre por conta. */
const ASSETS = /*__ASSETS__*/[];
const CACHE = 'techtask-shell-/*__VERSION__*/';
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys()) if(name.startsWith('techtask-shell-')&&name!==CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE') void self.skipWaiting();});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin||req.headers.has('Authorization')
    ||url.pathname.startsWith('/api/')||url.search) return;
  if(req.mode==='navigate') {
    event.respondWith(fetch(req).catch(async()=>{
      const cached=await (await caches.open(CACHE)).match('/index.html');
      return cached||new Response('Abra o TechTask com conexão uma vez antes de usar offline.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
    })); return;
  }
  if(ASSETS.includes(url.pathname)) event.respondWith((async()=>{
    const cached=await (await caches.open(CACHE)).match(url.pathname);
    return cached||fetch(req);
  })());
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  event.waitUntil((async()=>{
    const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows) if(new URL(client.url).origin===self.location.origin) return client.focus();
    return self.clients.openWindow('/');
  })());
});
