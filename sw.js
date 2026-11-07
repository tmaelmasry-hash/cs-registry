/* Offline cache — bump VERSION whenever you change any file so phones pick up the update */
var VERSION = 'cs-registry-v1';
var FILES = ['./', './index.html', './css/styles.css', './js/app.js', './manifest.webmanifest',
             './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', function(e){
  e.waitUntil(caches.open(VERSION).then(function(c){ return c.addAll(FILES); }).then(function(){ return self.skipWaiting(); }));
});
self.addEventListener('activate', function(e){
  e.waitUntil(caches.keys().then(function(keys){
    return Promise.all(keys.filter(function(k){ return k !== VERSION; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});
self.addEventListener('fetch', function(e){
  var url = new URL(e.request.url);
  if(e.request.method !== 'GET' || url.origin !== location.origin) return; /* never cache Firestore calls */
  e.respondWith(caches.match(e.request).then(function(hit){ return hit || fetch(e.request); }));
});
