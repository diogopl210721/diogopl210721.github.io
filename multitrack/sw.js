/* DDS MultiTrack: funciona sem internet depois da primeira abertura */
const VER="202610310136",CACHE="ddsmt-"+VER;
const SHELL=["./", "index.html", "app.js?v=202610310136", "mixer-worklet.js?v=202610310136", "manifest.webmanifest", "vendor/jszip.min.js", "vendor/supabase.js", "vendor/soundtouch.js", "icons/logo.svg", "icons/icon-32.png", "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png", "icons/maskable-192.png", "icons/maskable-512.png", "icons/pix-qr.svg", "fonts/bricolage-grotesque-latin-500-normal.woff2", "fonts/bricolage-grotesque-latin-600-normal.woff2", "fonts/bricolage-grotesque-latin-700-normal.woff2", "fonts/bricolage-grotesque-latin-800-normal.woff2", "fonts/jetbrains-mono-latin-500-normal.woff2", "fonts/jetbrains-mono-latin-600-normal.woff2", "fonts/manrope-latin-400-normal.woff2", "fonts/manrope-latin-500-normal.woff2", "fonts/manrope-latin-600-normal.woff2", "fonts/manrope-latin-700-normal.woff2"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith("ddsmt-")&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{const r=e.request;if(r.method!=="GET")return;const u=new URL(r.url);if(u.origin!==location.origin)return;
  if(r.mode==="navigate"){e.respondWith((async()=>{const c=await caches.open(CACHE);
      try{const net=await Promise.race([fetch(r),new Promise((_,rej)=>setTimeout(()=>rej(new Error("lento")),3500))]);if(net&&net.ok)c.put("index.html",net.clone());return net}
      catch(err){return(await c.match("index.html"))||(await c.match("./"))||Response.error()}})());return}
  e.respondWith((async()=>{const c=await caches.open(CACHE);const hit=await c.match(r);if(hit)return hit;
    try{const net=await fetch(r);if(net&&net.ok&&u.pathname.includes("/multitrack/"))c.put(r,net.clone());return net}catch(err){return Response.error()}})())});
