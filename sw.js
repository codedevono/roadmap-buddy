// Network-first: new versions of the app and the plan files show up on the next load.
// The cache is only a fallback for when the phone is offline.
<<<<<<< HEAD
const C = 'buddy-v10';
const SHELL = ['./', 'index.html', 'import.js', 'v21.js', 'manifest.json', 'icon.svg', 'skills.json', 'projects.json', 'events.json', 'path.json'];
=======
const C = 'buddy-v9';
const SHELL = ['./', 'index.html', 'import.js', 'manifest.json', 'icon.svg', 'skills.json', 'projects.json', 'events.json', 'path.json'];
>>>>>>> 993369f82dee247d4b14a388c78c77459087717f
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
