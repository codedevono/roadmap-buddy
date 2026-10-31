// Network-first: new versions of the app and the plan files show up on the next load.
// The cache is only a fallback for when the phone is offline.
<<<<<<< HEAD
const C = 'buddy-v5';
=======
const C = 'buddy-v4';
>>>>>>> 517e341cb15f3c8a44fbc420d77e0a7af44e2f12
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg', 'skills.json', 'projects.json', 'events.json', 'path.json'];
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request, { cache: 'no-cache' })
      .then(r => { if (r.ok) { const x = r.clone(); caches.open(C).then(c => c.put(e.request, x)); } return r; })
      .catch(() => caches.match(e.request))
  );
});
