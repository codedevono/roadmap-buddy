const C = 'buddy-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon.svg'];
self.addEventListener('install', e => e.waitUntil(caches.open(C).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const isData = e.request.url.includes('roadmap.json');
  e.respondWith(isData
    ? fetch(e.request).then(r => { const x = r.clone(); caches.open(C).then(c => c.put(e.request, x)); return r; }).catch(() => caches.match(e.request))
    : caches.match(e.request).then(r => r || fetch(e.request)));
});
