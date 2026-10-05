// Offline support: app shell + catalogue + models are cached; live data is network-first with cache fallback
const VERSION = 'nightsky-v5-22';
const PREFIX = 'nightsky-'; // all apps share one origin: only ever touch our own caches
const SHELL = [
  './', 'index.html', 'css/app.css',
  'js/app.js', 'js/util.js', 'js/astro.js', 'js/sky.js', 'js/ar3d.js', 'js/sats.js', 'js/tonight.js', 'js/info.js', 'js/feed.js', 'js/radio.js', 'js/livedata.js', 'js/sound.js', 'js/soundviz.js', 'js/lab.js', 'js/overhead.js', 'js/events.js', 'js/earth.js', 'js/calendar.js', 'js/comets.js', 'js/satinfo.js', 'js/spacecomms.js', 'js/darksky.js',
  'vendor/three.module.min.js', 'vendor/astronomy.browser.min.js', 'vendor/satellite.min.js',
  'vendor/jsm/loaders/GLTFLoader.js', 'vendor/jsm/utils/BufferGeometryUtils.js', 'vendor/jsm/controls/OrbitControls.js',
  'data/sky.json', 'data/airports.json',
  'fonts/spacegrotesk.woff2', 'fonts/vt323.woff2', 'fonts/jetbrainsmono.woff2',
  'textures/milkyway.png', 'data/stars8.bin', 'data/comets.json', 'data/transmitters.json', 'data/darksky_places.json', 'textures/earth_day.jpg', 'textures/earth_night.jpg', 'textures/earth_spec.jpg', 'textures/earth_clouds.png', 'textures/galaxy.png', 'textures/nebula.png', 'textures/cluster.png',
  'icons/icon-192.png', 'icons/icon-512.png',
  ...['sun', 'moon', 'mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'iss', 'hubble', 'satellite', 'tiangong', 'gps', 'goes', 'iridium', 'oneweb', 'starlink', 'radarsat', 'eosat', 'cubesat', 'rocketbody', 'debris'].map(m => `models/${m}.glb`),
];
// cache:'reload' so a fresh install never pins files from the browser's 10 minute HTTP cache
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => Promise.all(SHELL.map(u => fetch(new Request(u, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error(u); return c.put(u, r); })))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith(PREFIX) && !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (u.pathname.endsWith('manifest.webmanifest')) return; // always fresh from the network so install identity never goes stale
  if (/somafm|radio-browser|mediacp|stream|icecast|dsn\/data/i.test(u.href) || e.request.destination === 'audio') return; // never cache streams
  if (u.origin === location.origin) {
    e.respondWith(caches.open(VERSION).then(c => c.match(e.request, { ignoreSearch: true })).then(r => r || fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSION).then(c => c.put(e.request, cp)); } return res; })));
  } else if (u.host === 'raw.githubusercontent.com') {
    // data snapshots: network first, last copy offline. Cached under a fixed key so each new snapshot replaces the old one.
    const key = u.origin + u.pathname;
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSION + '-data').then(c => c.put(key, cp)); } return res; }).catch(() => caches.open(VERSION + '-data').then(c => c.match(key)).then(r => r || Response.error())));
  } else if (/open-meteo|celestrak|swpc|wikipedia|thespacedevs|spaceflightnewsapi|nasa\.gov|djlorenz/.test(u.host)) {
    e.respondWith(fetch(e.request).then(res => { if (res.ok) { const cp = res.clone(); caches.open(VERSION + '-data').then(c => c.put(e.request, cp)); } return res; }).catch(() => caches.open(VERSION + '-data').then(c => c.match(e.request))));
  }
});
