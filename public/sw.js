// Network-first: new versions of the app and the plan files show up on the next load.
// The cache is only a fallback for when the phone is offline.
const C = 'buddy-v22';
const SHELL = [
  './',
  'index.html',
  'manifest.json',
  'icon.svg',
  'chakra-petch-500.woff2',
  'chakra-petch-600.woff2',
  'chakra-petch-700.woff2',
  'app/import.js',
  'app/v21.js',
  'app/gcal.js',
  'app/space.js',
  'app/space.css',
  'app/starmap.js',
  'app/pstate.js',
  'app/vault.js',
  'app/ai.js',
  'app/resume.js',
  'app/desk.js',
  'app/buddy.js',
  'data/calendar.json',
  'data/skills.json',
  'data/projects.json',
  'data/events.json',
  'data/path.json'
];
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
