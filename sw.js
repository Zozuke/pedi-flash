// Service Worker de PediFlash - Versión 1.0.1
const CACHE_NAME = 'pediflash-cache-v1.0.1';
const DYNAMIC_CACHE = 'pediflash-dynamic-v1.0.1';

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

// Página offline de respaldo (por si falla la carga del archivo)
const FALLBACK_OFFLINE_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PediFlash - Sin Conexión</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Segoe UI', system-ui, sans-serif;
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            color: white;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            text-align: center;
            padding: 20px;
        }
        .container { max-width: 400px; }
        .icon { font-size: 80px; margin-bottom: 20px; animation: bounce 1s infinite; }
        @keyframes bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(-20px); }
        }
        h1 { font-size: 28px; margin-bottom: 15px; color: white; }
        p { color: rgba(255,255,255,0.7); margin-bottom: 25px; line-height: 1.6; }
        .btn {
            background: #FF6B35;
            color: white;
            border: none;
            padding: 15px 30px;
            border-radius: 50px;
            font-size: 16px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s;
            text-decoration: none;
            display: inline-block;
        }
        .btn:hover { background: #E55A2B; transform: translateY(-2px); }
        .status {
            margin-top: 20px;
            padding: 10px;
            background: rgba(255,255,255,0.1);
            border-radius: 10px;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon">🛵</div>
        <h1>¡Sin conexión!</h1>
        <p>
            Parece que no tienes internet en este momento.<br>
            <strong>PediFlash</strong> necesita conexión para procesar envíos en tiempo real.
        </p>
        <button class="btn" onclick="location.reload()">
            🔄 Reintentar Conexión
        </button>
        <div class="status">
            <small>Verifica tu conexión WiFi o datos móviles</small>
        </div>
    </div>
    
    <script>
        // Verificar conexión periódicamente
        setInterval(() => {
            if (navigator.onLine) {
                location.reload();
            }
        }, 3000);
        
        // También verificar cuando la página recupera el foco
        window.addEventListener('focus', () => {
            if (navigator.onLine) {
                location.reload();
            }
        });
    </script>
</body>
</html>`;

// Instalación del Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        (async () => {
            console.log('📦 Instalando Service Worker v1.0.1...');
            const cache = await caches.open(CACHE_NAME);
            
            // Cachear recursos estáticos
            const cachePromises = STATIC_ASSETS.map(async asset => {
                try {
                    const response = await fetch(asset, { cache: 'no-cache' });
                    if (response.ok) {
                        await cache.put(asset, response);
                        console.log(`✅ Cacheado: ${asset}`);
                        return true;
                    } else {
                        console.warn(`⚠️ Respuesta no ok para ${asset}: ${response.status}`);
                        return false;
                    }
                } catch (error) {
                    console.warn(`⚠️ No se pudo cachear: ${asset}`, error.message);
                    
                    // Si falla offline.html, crear versión de respaldo
                    if (asset === '/offline.html') {
                        console.log('📝 Creando página offline de respaldo...');
                        const fallbackResponse = new Response(FALLBACK_OFFLINE_HTML, {
                            status: 200,
                            statusText: 'OK',
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        });
                        await cache.put('/offline.html', fallbackResponse);
                        console.log('✅ Página offline de respaldo creada');
                    }
                    return false;
                }
            });
            
            await Promise.allSettled(cachePromises);
            
            // Verificar que offline.html esté en cache
            const offlineCached = await cache.match('/offline.html');
            if (offlineCached) {
                console.log('✅ Verificado: offline.html está en cache');
            } else {
                console.warn('⚠️ ALERTA: offline.html NO está en cache');
                // Último intento de guardarlo
                const fallbackResponse = new Response(FALLBACK_OFFLINE_HTML, {
                    status: 200,
                    headers: { 'Content-Type': 'text/html; charset=utf-8' }
                });
                await cache.put('/offline.html', fallbackResponse);
            }
            
            console.log('✅ Service Worker instalado correctamente');
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
            await clients.claim();
            console.log('✅ Service Worker activado y en control');
        })()
    );
});

// Estrategia de cache: Network First con fallback a cache
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // No interceptar requests a Supabase
    if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
        return;
    }
    
    // Para navegaciones (HTML)
    if (request.mode === 'navigate') {
        event.respondWith(
            (async () => {
                try {
                    // Intentar red primero
                    const networkResponse = await fetch(request);
                    
                    // Guardar en cache dinámico si es exitoso
                    if (networkResponse.ok) {
                        const cache = await caches.open(DYNAMIC_CACHE);
                        await cache.put(request, networkResponse.clone());
                    }
                    
                    return networkResponse;
                } catch (error) {
                    console.log('📡 Sin conexión, buscando en cache:', request.url);
                    
                    // Buscar la página exacta en cache
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) {
                        console.log('✅ Página encontrada en cache');
                        return cachedResponse;
                    }
                    
                    // Buscar página offline en cache estático
                    const staticCache = await caches.open(CACHE_NAME);
                    const offlineResponse = await staticCache.match('/offline.html');
                    
                    if (offlineResponse) {
                        console.log('📴 Mostrando página offline desde cache');
                        return offlineResponse;
                    }
                    
                    // Buscar en cache dinámico
                    const dynamicCache = await caches.open(DYNAMIC_CACHE);
                    const dynamicOffline = await dynamicCache.match('/offline.html');
                    
                    if (dynamicOffline) {
                        console.log('📴 Mostrando página offline desde cache dinámico');
                        return dynamicOffline;
                    }
                    
                    // Último recurso: página offline inline
                    console.log('⚠️ Usando página offline de emergencia');
                    return new Response(FALLBACK_OFFLINE_HTML, {
                        status: 200,
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    });
                }
            })()
        );
        return;
    }
    
    // Para recursos estáticos (CSS, JS, imágenes, fuentes)
    event.respondWith(
        (async () => {
            try {
                const networkResponse = await fetch(request);
                
                if (networkResponse.ok && request.method === 'GET') {
                    const cache = await caches.open(DYNAMIC_CACHE);
                    await cache.put(request, networkResponse.clone());
                }
                
                return networkResponse;
            } catch (error) {
                // Buscar en cachés
                const staticCache = await caches.open(CACHE_NAME);
                const staticMatch = await staticCache.match(request);
                if (staticMatch) return staticMatch;
                
                const dynamicCache = await caches.open(DYNAMIC_CACHE);
                const dynamicMatch = await dynamicCache.match(request);
                if (dynamicMatch) return dynamicMatch;
                
                // Placeholder para imágenes
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
    
    if (event.data === 'CHECK_CACHE') {
        // Verificar qué está cacheado
        (async () => {
            const cache = await caches.open(CACHE_NAME);
            const keys = await cache.keys();
            console.log('📦 CACHE_NAME contiene:', keys.map(r => r.url));
            
            const offlineCheck = await cache.match('/offline.html');
            console.log('📴 offline.html en CACHE_NAME:', offlineCheck ? '✅ SÍ' : '❌ NO');
            
            const dynamicCache = await caches.open(DYNAMIC_CACHE);
            const dynamicKeys = await dynamicCache.keys();
            console.log('📦 DYNAMIC_CACHE contiene:', dynamicKeys.map(r => r.url));
        })();
    }
});

console.log('🛵 Service Worker de PediFlash v1.0.1 inicializado');
