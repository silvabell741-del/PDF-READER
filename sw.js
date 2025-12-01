// Nome do cache
const CACHE_NAME = 'pdf-annotator-v1';

// Arquivos para cachear imediatamente (App Shell)
// Nota: Em produção com Vite, idealmente você usaria um plugin para gerar essa lista com hashes.
const urlsToCache = [
  '/',
  '/index.html',
  'https://cdn.tailwindcss.com', // Cacheando dependências externas
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.449/web/pdf_viewer.css'
];

// Instalação do SW
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
  self.skipWaiting();
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Estratégia de Fetch: Stale-While-Revalidate para a maioria dos requests,
// mas Network-First para a API do Google e Firebase para garantir dados frescos.
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Não cachear chamadas de API (Google Drive, Firebase, Firestore)
  if (url.hostname.includes('googleapis.com') || 
      url.hostname.includes('firebase') || 
      url.hostname.includes('firestore')) {
    return; // Deixa o navegador lidar com a rede normalmente
  }

  // Para outros arquivos (JS, CSS, Imagens), tenta servir do cache primeiro
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - retorna a resposta
        if (response) {
          return response;
        }
        return fetch(event.request).then(
          (response) => {
            // Verifica se recebemos uma resposta válida
            if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clona a resposta
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
  );
});