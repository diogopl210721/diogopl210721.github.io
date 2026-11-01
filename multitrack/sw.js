/* Endereço antigo: desliga o app guardado aqui e manda para /vs/ */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith("ddsmt-")).map(k=>caches.delete(k)));
  await self.registration.unregister();const cs=await self.clients.matchAll({type:"window"});cs.forEach(c=>{try{const u=new URL(c.url);c.navigate(u.origin+"/vs/"+u.search+u.hash)}catch(e){}})})())});
