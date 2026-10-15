// network-first（数秒で返事がなければキャッシュ）
const CACHE='shisan-nav-v17';
const CORE=['./','index.html','app.js','tx.js','sale.js','data.json','manifest.webmanifest','icon-192.png','apple-touch-icon.png',
 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);if(e.request.method!=='GET')return;
  const mine=u.origin===location.origin||u.host==='cdnjs.cloudflare.com';
  if(!mine)return; // 地図・ハザードのタイルや住所検索はそのまま通信
  e.respondWith(new Promise(res=>{let done=false;
    const t=setTimeout(()=>{caches.match(e.request,{ignoreSearch:true}).then(r=>{if(r&&!done){done=true;res(r)}})},4000);
    fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}if(!done){done=true;clearTimeout(t);res(r)}})
    .catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>{if(!done){done=true;clearTimeout(t);res(r||new Response('offline',{status:503}))}}));
  }));
});
