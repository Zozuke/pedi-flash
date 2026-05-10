// Service Worker de PediFlash - Versión 1.0.0
const CACHE_NAME = 'pediflash-cache-v1.0.0';
const DYNAMIC_CACHE = 'pediflash-dynamic-v1.0.0';

// Recursos que se cachean al instalar
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/cliente.html',
    '/repartidor.html',
    '/logo.png',
    '/manifest.json',
    '/offline.html',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        (async () => {
            console.log('📦 Instalando Service Worker...');
            const cache = await caches.open(CACHE_NAME);
            
            // Cachear recursos estáticos uno por uno para mejor control de errores
            const cachePromises = STATIC_ASSETS.map(async asset => {
                try {
                    const response = await fetch(asset);
                    if (response.ok) {
                        await cache.put(asset, response);
                        console.log(`✅ Cacheado: ${asset}`);
                    }
                } catch (error) {
                    console.warn(`⚠️ No se pudo cachear: ${asset}`, error);
                }
            });
            
            await Promise.allSettled(cachePromises);
            console.log('✅ Service Worker instalado correctamente');
            
            // Activar inmediatamente
            await self.skipWaiting();
        })()
    );
});

// Activación
self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            console.log('🔄 Activando Service Worker...');
            
            // Limpiar caches viejos
            const cacheNames = await caches.keys();
            const deletePromises = cacheNames
                .filter(name => name !== CACHE_NAME && name !== DYNAMIC_CACHE)
                .map(name => {
                    console.log(`🗑️ Eliminando cache antiguo: ${name}`);
                    return caches.delete(name);
                });
            
            await Promise.all(deletePromises);
            
            // Tomar control de todos los clientes
            await clients.claim();
            console.log('✅ Service Worker activado y en control');
        })()
    );
});

// Estrategia de cache: Network First con fallback a cache
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // No interceptar requests a Supabase (API calls)
    if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
        return; // Dejar que la solicitud pase normalmente
    }
    
    // Para navegaciones (HTML), usar Network First
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    const networkResponse = await fetch(request);
                    
                    // Guardar en cache dinámico
                    const cache = await caches.open(DYNAMIC_CACHE);
                    await cache.put(request, networkResponse.clone());
                    
                    return networkResponse;
                } catch (error) {
                    console.log('📡 Usando cache offline para:', request.url);
                    
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        return cachedResponse;
                    }
                    
                    // Si no hay cache, mostrar página offline
                    const offlineCache = await caches.match('/offline.html');
                    if (offlineCache) {
                        return offlineCache;
                    }
                    
                    return new Response('Sin conexión a internet', {
                        status: 503,
                        statusText: 'Servicio no disponible'
                    });
                }
            })()
        );
        return;
    }
    
    // Para recursos estáticos (CSS, JS, imágenes, fuentes)
    event.respondWith(
        (async () => {
            // Intentar obtener de la red primero
            try {
                const networkResponse = await fetch(request);
                
                // Cachear recursos exitosos
                if (networkResponse.ok) {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    await cache.put(request, networkResponse.clone());
                }
                
                return networkResponse;
            } catch (error) {
                // Si falla la red, usar cache
                const cachedResponse = await caches.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Para imágenes y fuentes, devolver placeholder
                if (request.destination === 'image') {
                    return new Response(
                        '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect fill="#f0f0f0" width="200" height="200"/><text fill="#999" x="50%" y="50%" text-anchor="middle" dy=".3em">📦</text></svg>',
                        { headers: { 'Content-Type': 'image/svg+xml' } }
                    );
                }
                
                return new Response('Recurso no disponible offline', {
                    status: 404,
                    statusText: 'No encontrado'
                });
            }
        })()
    );
});

// Manejar mensajes desde la página
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data === 'CLEAR_CACHE') {
        caches.delete(CACHE_NAME);
        caches.delete(DYNAMIC_CACHE);
        console.log('🗑️ Caches limpiados');
    }
});

// Notificaciones push (para futura implementación)
self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'Tienes una nueva actualización de tu pedido',
        icon: '/logo.png',
        badge: '/logo.png',
        vibrate: [200, 100, 200],
        tag: 'pedido-update',
        renotify: true,
        data: {
            url: '/cliente.html'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification('📦 PediFlash', options)
    );
});

// Click en notificación
self.addEventListener('notificationclick', event => {
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow(event.notification.data.url || '/')
    );
});

console.log('🛵 Service Worker de PediFlash inicializado');
