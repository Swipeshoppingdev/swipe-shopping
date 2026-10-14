// Service worker: l'app si apre subito anche con rete lenta e funziona offline con l'ultimo catalogo.
// - pagina e catalogo: prima la rete (per avere prezzi aggiornati), se manca si usa la copia salvata
// - file del build (nomi con hash, non cambiano mai): prima la copia salvata
const CACHE = 'swipeshop-v5'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  // Solo i nostri file: immagini Amazon, Supabase ecc. passano senza toccarli.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  const immutable = url.pathname.includes('/assets/') || url.pathname.includes('/icons/')
  if (/\/catalog(-[\w-]+)?\.json$/.test(url.pathname)) event.respondWith(networkWithTimeout(event, req))
  else event.respondWith(immutable ? cacheFirst(req) : networkFirst(req))
})

async function cacheFirst(req) {
  const cached = await caches.match(req)
  if (cached) return cached
  const res = await fetch(req)
  if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
  return res
}

// Catalogo: si usa quello nuovo (filtri e prezzi aggiornati); se la rete non risponde entro
// 2,5 secondi si parte con la copia salvata e intanto si salva quella nuova per la volta dopo.
async function networkWithTimeout(event, req) {
  const cache = await caches.open(CACHE)
  const update = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone())
    return res
  })
  event.waitUntil(update.catch(() => {}))
  const cached = await cache.match(req, { ignoreSearch: true })
  if (!cached) return update
  const timeout = new Promise((resolve) => setTimeout(() => resolve(cached), 2500))
  return Promise.race([update.then((res) => (res.ok ? res : cached)).catch(() => cached), timeout])
}

async function networkFirst(req) {
  try {
    // La pagina sempre ricontrollata col server (senza la cache HTTP di 10 minuti di GitHub Pages):
    // dopo un aggiornamento del sito deve puntare ai file JS nuovi, quelli vecchi non esistono più.
    const res = await fetch(req.mode === 'navigate' ? new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' }) : req)
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
    return res
  } catch (err) {
    const cached = await caches.match(req, { ignoreSearch: true })
    if (cached) return cached
    throw err
  }
}

// Notifiche dal sito (Web Push, vedi scripts/webpush.ts): testo fisso deciso dal server.
self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Swipe Shopping', {
      body: data.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/favicon-64.png',
      tag: data.tag || 'swipe',
      data: { url: typeof data.url === 'string' && data.url.startsWith('#/') ? data.url : '#/scopri' },
    }),
  )
})

// Tocco sulla notifica: si riapre l'app (se è già aperta la si porta davanti) sulla pagina giusta.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = event.notification.data?.url || '#/scopri'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope))
      if (open) {
        open.postMessage({ type: 'open', url })
        return open.focus()
      }
      return self.clients.openWindow(self.registration.scope + url)
    }),
  )
})
