/* O app saiu de /vs/ para /vs/app/: este serviço antigo se desliga e recarrega a página */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{e.waitUntil((async()=>{const ks=await caches.keys();await Promise.all(ks.filter(k=>k.startsWith("ddsmt-")).map(k=>caches.delete(k)));
  await self.registration.unregister();const cs=await self.clients.matchAll({type:"window"});cs.forEach(c=>{try{c.navigate(c.url)}catch(e){}})})())});
