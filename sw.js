/* LAVÉA Laundry POS - offline support.
   Saves the app on the device so it opens without internet.
   Supabase / any other data requests are never touched: they always go straight to the network. */
const VER = 'lavea-pos-v1';
const SHELL = ['./', 'index.html', 'manifest.json', 'icon-192.png', 'icon-512.png', 'maskable-512.png', 'apple-touch-icon.png'];
const LIBS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com']; // PDF libraries + fonts

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const keep = (req, res) => {
  if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VER).then(c => c.put(req, copy)); }
  return res;
};

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // The app page: use the fresh copy when online (4 s limit), the saved copy when not.
  if (req.mode === 'navigate') {
    e.respondWith(
      new Promise(resolve => {
        const t = setTimeout(() => caches.match('index.html').then(r => r && resolve(r)), 4000);
        fetch(req).then(res => { clearTimeout(t); keep(new Request('index.html'), res.clone()); resolve(res); })
          .catch(() => { clearTimeout(t); caches.match('index.html').then(r => resolve(r || Response.error())); });
      })
    );
    return;
  }

  // Our own files (icons, manifest): saved copy first, refreshed in the background.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(hit => {
        const net = fetch(req).then(res => keep(req, res)).catch(() => hit);
        return hit || net;
      })
    );
    return;
  }

  // PDF libraries and fonts: saved copy first.
  if (LIBS.includes(url.hostname)) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => keep(req, res)))
    );
    return;
  }
  // Everything else (Supabase etc.): not intercepted.
});
