// sw.js - Service Worker PRO para PediFlash

const CACHE_NAME = 'pediflash-v2';

// Archivos esenciales (precarga)
const ARCHIVOS_ESTATICOS = [
    '/',
    '/index.html',
    '/cliente.html',
    '/styles.css',
    '/app.js',
    '/icon.png'
];

// ==========================
// INSTALACIÓN
// ==========================
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                // Precargar archivos sin que uno falle a todos
                return Promise.allSettled(
                    ARCHIVOS_ESTATICOS.map(url =>
                        cache.add(url).catch(err =>
                            console.warn('❌ Error precargando:', url, err)
                        )
                    )
                );
            })
            .then(() => {
                console.log('✅ Service Worker instalado');
            })
    );
    self.skipWaiting();
});

// ==========================
// ACTIVACIÓN
// ==========================
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('🗑️ Eliminando caché antigua:', name);
                        return caches.delete(name);
                    })
            );
        })
    );
    self.clients.claim();
});

// ==========================
// FETCH (peticiones)
// ==========================
self.addEventListener('fetch', event => {

    const url = event.request.url;

    // 🚫 APIs externas: pasar directo a red sin interferir
    if (
        url.includes('supabase.co') ||
        url.includes('vercel.app') ||
        url.includes('openstreetmap.org') ||
        url.includes('nominatim')
    ) {
        event.respondWith(fetch(event.request));
        return;
    }

    // ==========================
    // ESTRATEGIA: CACHE FIRST
    // (con actualización en segundo plano)
    // ==========================
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {

                // Iniciar fetch en segundo plano para actualizar caché
                const fetchPromise = fetch(event.request)
                    .then(networkResponse => {

                        // Solo cachear respuestas exitosas
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();

                            caches.open(CACHE_NAME)
                                .then(cache => {
                                    cache.put(event.request, responseClone);
                                });
                        }

                        return networkResponse;
                    })
                    .catch(err => {
                        console.warn('⚠️ Error de red:', url, err);
                        // No devolvemos nada, usaremos el caché si existe
                    });

                // Si hay caché, devolverlo inmediatamente
                if (cachedResponse) {
                    return cachedResponse;
                }

                // Si no hay caché, esperar respuesta de red
                return fetchPromise;
            })
            .catch(() => {
                // 🔌 SIN CONEXIÓN Y SIN CACHÉ

                // Si es navegación (HTML)
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }

                // Fallback genérico
                return new Response('Sin conexión', {
                    status: 503,
                    statusText: 'Sin conexión'
                });
            })
    );
});
