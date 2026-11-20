/* Punto Fadey · service worker (modo sin conexión).
 *
 * - App (HTML + JS/CSS de Vite): se guarda al usarla; sin red abre la última versión guardada.
 * - API de lectura (catálogo, caja, sesión, panel): primero la red; sin red responde la última copia.
 * - Fotos e íconos: se muestran desde la copia y se actualizan en segundo plano.
 * - Las operaciones (POST) nunca se guardan aquí: la venta sin conexión la maneja la app con su cola.
 */
const VERSION = "pf-v3"
const SHELL = `${VERSION}-shell`
const ASSETS = `${VERSION}-assets`
const API = `${VERSION}-api`
const MEDIA = `${VERSION}-media`

const API_READS = [
  "/api/version",
  "/api/auth/bootstrap",
  "/api/auth/me",
  "/api/panel/bootstrap",
  "/api/panel/dashboard",
  "/api/sales/status",
  "/api/sales/products",
  "/api/cash/status",
  "/api/catalog",
  "/api/customers",
]

const OFFLINE_HTML =
  '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Sin conexión</title>' +
  '<body style="font-family:system-ui,sans-serif;padding:2rem;color:#0f172a;background:#f3f6fb"><h1>Sin conexión</h1>' +
  "<p>Abre Punto Fadey al menos una vez con internet en este equipo para poder vender sin conexión.</p>" +
  '<button onclick="location.reload()" style="padding:.7rem 1rem;border-radius:.7rem;border:0;background:#0d9488;color:#fff;font-weight:600">Reintentar</button></body>'

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(["/", "/app.webmanifest", "/icons/icon-192.png?v=3", "/brand/punto-fadey.jpg"]).catch(() => undefined))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "clear-api-cache") {
    event.waitUntil(caches.delete(API))
  }
})

function isApiRead(url) {
  return API_READS.some((path) => url.pathname === path || url.pathname.startsWith(`${path}?`))
}

async function networkFirst(request, cacheName, fallbackKey) {
  const cache = await caches.open(cacheName)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(fallbackKey || request, response.clone())
    return response
  } catch (error) {
    const cached = await cache.match(fallbackKey || request)
    if (cached) {
      // Marca la copia para que la app sepa que el servidor no respondió.
      const headers = new Headers(cached.headers)
      headers.set("X-PF-Offline", "1")
      return new Response(cached.body, { status: cached.status, statusText: cached.statusText, headers })
    }
    throw error
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => undefined)
  return cached || (await network) || Response.error()
}

self.addEventListener("fetch", (event) => {
  const request = event.request
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Páginas de la app (SPA): siempre el mismo index.html.
  if (request.mode === "navigate") {
    event.respondWith(
      networkFirst(request, SHELL, "/").catch(
        () => new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
      ),
    )
    return
  }

  // JS/CSS con hash de Vite: no cambian nunca.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSETS))
    return
  }

  // Lecturas del API que la app necesita para abrir y vender sin conexión.
  if (url.pathname.startsWith("/api/")) {
    if (isApiRead(url)) event.respondWith(networkFirst(request, API))
    return
  }

  // Fotos de productos, íconos y logos.
  if (
    url.pathname.startsWith("/uploads/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname === "/app.webmanifest"
  ) {
    event.respondWith(staleWhileRevalidate(request, MEDIA))
  }
})
