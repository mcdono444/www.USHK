//USHK Service Worker com suporte offline e preload

importScripts('https://storage.googleapis.com/workbox-cdn/releases/5.1.2/workbox-sw.js');

const CACHE = "ushk-cache-v1";
const offlineFallbackPage = "offline.html";

// ─── Mensagem para ativar imediatamente ───
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── Instala e adiciona a página offline ao cache ───
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => {
      return cache.addAll([
        offlineFallbackPage,
        '/index.html',
        '/register.html',
        '/login.html',
        '/profile.html',
        '/vip.html',
        '/manifest.json',
        '/css/styles.css',
        '/js/app.js'
      ]).catch(() => cache.add(offlineFallbackPage));
    })
  );
  self.skipWaiting();
});

// ─── Ativa e assume controle dos clientes ───
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// ─── Habilita navigation preload se suportado ───
if (workbox.navigationPreload.isSupported()) {
  workbox.navigationPreload.enable();
}

// ─── Intercepta navegações ───
self.addEventListener('fetch', (event) => {
  if (event.request.mode === 'navigate') {
    const url = new URL(event.request.url);

    // ⚠️ Não intercepta login, registro nem chamadas externas
    if (
      url.pathname.includes('/login.html') ||
      url.pathname.includes('/register.html') ||
      url.pathname.includes('/auth') ||
      url.hostname.includes('firebaseapp.com') ||
      url.hostname.includes('googleapis.com') ||
      url.hostname.includes('gstatic.com') ||
      url.hostname.includes('onrender.com')
    ) {
      return; // deixa o navegador lidar normalmente
    }

    event.respondWith((async () => {
      try {
        const preloadResp = await event.preloadResponse;
        if (preloadResp) return preloadResp;

        const response = await fetch(event.request);
        
        // Cacheia apenas respostas válidas
        if (response && response.status === 200) {
          const cache = await caches.open(CACHE);
          cache.put(event.request, response.clone());
        }
        
        return response;
      } catch (error) {
        const cache = await caches.open(CACHE);
        const cachedResp = await cache.match(event.request);
        
        if (cachedResp) return cachedResp;
        
        return cache.match(offlineFallbackPage);
      }
    })());
  }
});

// ─── Intercepta requisições de recursos (CSS, JS, imagens) ───
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  
  // Estratégia: Stale-While-Revalidate para recursos
  if (
    event.request.destination === 'style' ||
    event.request.destination === 'script' ||
    event.request.destination === 'image'
  ) {
    event.respondWith(
      caches.open(CACHE).then((cache) => {
        return cache.match(event.request).then((response) => {
          const fetchPromise = fetch(event.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          }).catch(() => response);

          return response || fetchPromise;
        });
      })
    );
  }
});

// ─── Listener para atualizações ───
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CLIENTS_CLAIM') {
    self.clients.claim();
  }
});