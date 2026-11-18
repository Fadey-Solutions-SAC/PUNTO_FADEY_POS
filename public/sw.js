self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(
          "<!doctype html><meta charset=utf-8><title>Sin conexión</title><body style=\"font-family:sans-serif;padding:2rem\"><h1>Sin conexión</h1><p>Punto Fadey no guarda ventas sin internet. Cuando vuelva la conexión, continúa desde el último comprobante confirmado.</p></body>",
          { headers: { "Content-Type": "text/html; charset=utf-8" } },
        ),
    ),
  );
});
