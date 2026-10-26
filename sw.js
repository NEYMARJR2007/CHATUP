/* SpicyyChat service worker: newest files first, offline fallback, and notifications when the app is closed */
const CACHE='chatup-v11';
const SHELL=['./','./index.html','./config.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL.map(u=>new Request(u,{cache:'reload'})))).catch(()=>{}).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==CACHE).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(r=>{if(r.ok){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}return r}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html'))));
});
self.addEventListener('push',e=>{
  let d={};try{d=e.data?e.data.json():{}}catch(err){d={title:'ChatUP',body:e.data?e.data.text():''}}
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    if(d.t==='msg'&&list.some(c=>c.focused&&c.visibilityState==='visible'))return;
    const call=d.t==='call';
    return self.registration.showNotification(d.title||'SpicyyChat',{
      body:d.body||'',tag:call?String(d.id):String(d.cid||'chatup'),renotify:true,
      icon:'./icon-192.png',badge:'./icon-192.png',lang:'he',dir:'rtl',
      vibrate:call?[600,300,600,300,600,300,600]:[120,60,120],
      requireInteraction:call,data:{cid:d.cid,call:d.id,t:d.t}
    });
  }));
});
self.addEventListener('notificationclick',e=>{
  e.notification.close();const d=e.notification.data||{};
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{
    for(const c of list){c.postMessage({open:d.cid,call:d.call});return c.focus()}
    return self.clients.openWindow('./'+(d.cid?'#open-'+d.cid:''));
  }));
});
