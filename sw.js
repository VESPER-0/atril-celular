// Guarda la app en el celular para que abra sin internet.
const VERSION = 'atril-prueba-1';
const ARCHIVOS = ['./', 'index.html', 'estilo.css', 'prueba.js', 'manifest.webmanifest', 'iconos/icono-192.png', 'iconos/icono-512.png'];

self.addEventListener('install', (evento) => {
  evento.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nombres) => Promise.all(nombres.filter((nombre) => nombre !== VERSION).map((nombre) => caches.delete(nombre))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (evento) => {
  const { request } = evento;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  evento.respondWith(caches.match(request).then((guardado) => guardado ?? fetch(request)));
});
