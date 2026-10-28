/* SpicyyChat service worker: newest files first, offline fallback, and notifications when the app is closed */
const CACHE='chatup-v22';
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
/* the phone sometimes replaces the push address while the app is closed: save the new one by ourselves */
const kvGet=k=>new Promise(res=>{try{const o=indexedDB.open('spicyy-sw',1);o.onupgradeneeded=()=>o.result.createObjectStore('kv');o.onsuccess=()=>{try{const g=o.result.transaction('kv').objectStore('kv').get(k);g.onsuccess=()=>res(g.result||null);g.onerror=()=>res(null)}catch(e){res(null)}};o.onerror=()=>res(null)}catch(e){res(null)}});
const kvSet=(k,v)=>new Promise(res=>{try{const o=indexedDB.open('spicyy-sw',1);o.onupgradeneeded=()=>o.result.createObjectStore('kv');o.onsuccess=()=>{try{const t=o.result.transaction('kv','readwrite');t.objectStore('kv').put(v,k);t.oncomplete=()=>res(true);t.onerror=()=>res(false)}catch(e){res(false)}};o.onerror=()=>res(false)}catch(e){res(false)}});
const u8=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0))};
const subId=async ep=>{const h=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ep));return [...new Uint8Array(h)].slice(0,8).map(b=>b.toString(16).padStart(2,'0')).join('')};
async function swIdToken(a){
  const r=await fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(a.apiKey),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(a.refresh)});
  if(!r.ok)throw new Error('token '+r.status);const j=await r.json();if(j.refresh_token&&j.refresh_token!==a.refresh){a.refresh=j.refresh_token;await kvSet('auth',a)}return j.id_token;
}
self.addEventListener('pushsubscriptionchange',e=>{e.waitUntil((async()=>{
  const a=await kvGet('auth');if(!a||!a.uid||!a.refresh)return;
  let sub=e.newSubscription;if(!sub)sub=await self.registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(a.vapid)});
  const j=sub.toJSON(),id=await subId(j.endpoint),old=e.oldSubscription?await subId(e.oldSubscription.endpoint):null;
  const tok=await swIdToken(a);
  const qs=['subs.`'+id+'`',...(old&&old!==id?['subs.`'+old+'`']:[])].map(f=>'updateMask.fieldPaths='+encodeURIComponent(f)).join('&');
  const body={fields:{subs:{mapValue:{fields:{[id]:{mapValue:{fields:{endpoint:{stringValue:j.endpoint},p256dh:{stringValue:j.keys.p256dh},auth:{stringValue:j.keys.auth},t:{integerValue:String(Date.now())},ua:{stringValue:'sw-renew'}}}}}}}}};
  await fetch(`https://firestore.googleapis.com/v1/projects/${a.project}/databases/(default)/documents/pushsubs/${a.uid}?${qs}`,{method:'PATCH',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tok},body:JSON.stringify(body)});
})().catch(()=>{}))});
