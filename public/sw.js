/**
 * Service Worker for Offline Support
 * 
 * Provides offline functionality, background sync, and asset caching.
 * 
 * Features:
 * - Cache static assets for offline access
 * - Background sync for failed requests
 * - Push notifications (future)
 * - Request interception and caching strategies
 * 
 * @module sw
 */

// Version tracking for debugging (increment on each deploy)
const SW_VERSION = '1.0.8'
const CACHE_NAME = `upswitch-valuation-v${SW_VERSION}`
const RUNTIME_CACHE = `upswitch-runtime-v${SW_VERSION}`

// Debug mode: Set to true to enable verbose logging (for debugging only)
// In production, this should be false to reduce console noise
const DEBUG_MODE = false

// Helper function for conditional debug logging
function debugLog(...args) {
  if (DEBUG_MODE) {
    console.log(...args)
  }
}

console.log(`[ServiceWorker] Version ${SW_VERSION} initializing`)

// Assets to cache on install
const PRECACHE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.ico',
]

// Install event - precache critical assets
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install event')

  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Precaching assets')
      
      // Selective precache with error handling per asset
      // Uses Promise.allSettled to allow partial success
      const cachePromises = PRECACHE_ASSETS.map(async (url) => {
        try {
          const response = await fetch(url)
          if (response.ok) {
            await cache.put(url, response)
            console.log('[ServiceWorker] Cached successfully:', url)
            return { success: true, url }
          } else {
            console.warn('[ServiceWorker] Skipping cache (not ok):', url, response.status)
            return { success: false, url, reason: `HTTP ${response.status}` }
          }
        } catch (error) {
          console.warn('[ServiceWorker] Failed to cache:', url, error.message || error)
          return { success: false, url, reason: error.message || 'fetch failed' }
        }
      })
      
      const results = await Promise.allSettled(cachePromises)
      
      // Log summary
      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length
      const failed = results.length - successful
      
      console.log('[ServiceWorker] Precache completed:', {
        total: PRECACHE_ASSETS.length,
        successful,
        failed,
      })
      
      // Don't fail install even if some assets couldn't be cached
        return Promise.resolve()
    })
  )

  // Force activation of new service worker
  self.skipWaiting()
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate event')

  event.waitUntil(
    Promise.all([
      // Clean up old versioned caches
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            // Keep only current version caches
            // Delete old versioned caches (e.g., upswitch-valuation-v1.0.1 when current is v1.0.2)
            if (cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE) {
              console.log('[ServiceWorker] Deleting old cache:', cacheName, 'Current:', CACHE_NAME)
              return caches.delete(cacheName)
            }
          })
        )
      }),
      // ✅ FIX: Clean up any cached 404 responses from runtime cache
      caches.open(RUNTIME_CACHE).then(async (cache) => {
        const requests = await cache.keys()
        const deletePromises = []
        for (const request of requests) {
          const response = await cache.match(request)
          if (response && response.status !== 200) {
            console.log('[ServiceWorker] Removing cached non-200 response:', request.url, response.status)
            deletePromises.push(cache.delete(request))
          }
        }
        if (deletePromises.length > 0) {
          await Promise.all(deletePromises)
          console.log(`[ServiceWorker] Cleaned up ${deletePromises.length} non-200 cached responses`)
        }
      }).catch((error) => {
        // Cache might not exist yet, ignore error
        console.debug('[ServiceWorker] Runtime cache cleanup skipped:', error.message)
      })
    ])
  )

  // Take control of all clients immediately
  return self.clients.claim()
})

// Check if a URL should use network-first strategy
function shouldUseNetworkFirst(url) {
  // Next.js build chunks have hashes and should always be fetched fresh
  // These include webpack chunks, app chunks, and other _next/static files
  if (url.includes('/_next/static/chunks/')) {
    return true
  }
  
  // CSS files from _next/static can change between builds
  if (url.includes('/_next/static/css/')) {
    return true
  }
  
  // Don't cache API routes
  if (url.includes('/api/')) {
    return true
  }
  
  return false
}

// Check if a URL should be cached
function shouldCache(url, response) {
  // Don't cache non-200 responses
  if (!response || response.status !== 200) {
    return false
  }
  
  // Don't cache API routes
  if (url.includes('/api/')) {
    return false
  }
  
  // Don't cache Next.js build chunks (they have content hashes)
  if (url.includes('/_next/static/chunks/')) {
    return false
  }
  
  // Cache static assets: images, fonts, videos, manifest, etc.
  const staticExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.woff', '.woff2', '.ttf', '.mp4', '.webm', '.json']
  const isStaticAsset = staticExtensions.some(ext => url.includes(ext))
  
  // Cache root HTML and manifest
  const isRootOrManifest = url.endsWith('/') || url.includes('/manifest.json')
  
  return isStaticAsset || isRootOrManifest
}

// CRITICAL: Auth endpoints that must NEVER be cached
const AUTH_ENDPOINTS = [
  '/api/auth/me',
  '/api/auth/login',
  '/api/auth/logout',
  '/api/auth/refresh',
  '/api/reports',
  '/api/reports/',
  '/api/auth/exchange-token',
  '/api/auth/register',
  '/api/reports' // Also bypass SW for reports to ensure fresh data
]

// Fetch event - network first for dynamic content, cache first for static assets
self.addEventListener('fetch', (event) => {
  const { request } = event

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip chrome-extension and other non-http(s) requests
  if (!request.url.startsWith('http')) {
    return
  }

  const url = request.url
  
  // CRITICAL: Skip ALL cross-origin requests (only handle same-origin)
  // Cross-origin requests to api.upswitch.app should be handled directly by the browser
  // Service worker intercepting them causes CORS and network errors
  try {
    const parsedUrl = new URL(url)
    // Get current origin from service worker registration scope
    const currentOrigin = new URL(self.registration.scope).origin
    const requestOrigin = parsedUrl.origin
    
    // If request is to a different origin, skip service worker entirely
    if (requestOrigin !== currentOrigin) {
      return // Let browser handle cross-origin requests directly
    }
  } catch (e) {
    // Invalid URL or scope, skip
    return
  }
  
  // CRITICAL: ALWAYS bypass service worker for auth endpoints
  // Never cache authentication requests - they must always be fresh
  try {
    const parsedUrl = new URL(url)
    if (AUTH_ENDPOINTS.some(endpoint => parsedUrl.pathname.includes(endpoint))) {
      console.log('[ServiceWorker] Bypassing SW for auth endpoint:', parsedUrl.pathname)
      return // Let browser handle directly
    }
  } catch (e) {
    // Invalid URL, continue with normal flow
  }
  
  // ✅ FIX: Completely bypass service worker for Next.js chunks
  // This prevents service worker from interfering with missing chunks
  // Let the browser handle chunks directly - it will show proper errors
  if (url.includes('/_next/static/chunks/') && url.includes('?dpl=')) {
    // Don't intercept - let browser handle it naturally
    return
  }
  
  const useNetworkFirst = shouldUseNetworkFirst(url)

  event.respondWith(
    (async () => {
      if (useNetworkFirst) {
        // Network-first strategy for Next.js chunks and dynamic content
        try {
          debugLog(`[ServiceWorker v${SW_VERSION}] Fetching from network (network-first):`, url)
          const response = await fetch(request)
          
          if (response.ok) {
            debugLog(`[ServiceWorker v${SW_VERSION}] Fetch finished loading:`, request.method, JSON.stringify(url))
            return response
          } else {
            // ✅ FIX: For Next.js chunks, if network returns 404, don't try cache - let browser handle it
            // This prevents serving stale/broken chunks that don't exist anymore
            if (url.includes('/_next/static/chunks/')) {
              console.warn(`[ServiceWorker v${SW_VERSION}] Chunk not found (404), bypassing cache:`, url)
              return response // Return 404 directly, don't try cache
            }
            
            // For other assets, try cache (but don't serve 404s from cache)
            console.warn(`[ServiceWorker v${SW_VERSION}] Network returned ${response.status}, trying cache:`, url)
            const cachedResponse = await caches.match(request)
            // ✅ FIX: Don't serve cached 404 responses - they break the app
            if (cachedResponse && cachedResponse.status === 200) {
              debugLog(`[ServiceWorker v${SW_VERSION}] Serving from cache (fallback):`, url)
              return cachedResponse
            }
            // If cached response is 404 or doesn't exist, return the network response
            return response
          }
        } catch (error) {
          // ✅ FIX: For Next.js chunks, if network fails, don't try cache - let browser handle it
          if (url.includes('/_next/static/chunks/')) {
            console.warn(`[ServiceWorker v${SW_VERSION}] Chunk fetch failed, bypassing cache:`, url, error.message)
            throw error // Let browser handle the error
          }
          
          // Network failed, try cache (but don't serve 404s from cache)
          console.warn(`[ServiceWorker v${SW_VERSION}] Network failed, trying cache:`, url, error.message)
          const cachedResponse = await caches.match(request)
          // ✅ FIX: Don't serve cached 404 responses - they break the app
          if (cachedResponse && cachedResponse.status === 200) {
            debugLog(`[ServiceWorker v${SW_VERSION}] Serving from cache (fallback):`, url)
            return cachedResponse
          }
          throw error
        }
      } else {
        // Cache-first strategy for static assets
        const cachedResponse = await caches.match(request)
        // ✅ FIX: Don't serve cached 404 responses - they break the app
        if (cachedResponse && cachedResponse.status === 200) {
          debugLog(`[ServiceWorker v${SW_VERSION}] Serving from cache:`, url)
          return cachedResponse
        }

        // Not in cache, fetch from network
        try {
          debugLog(`[ServiceWorker v${SW_VERSION}] Fetching from network:`, url)
          const response = await fetch(request)
          
          // Log successful network fetch (only in debug mode)
          if (response.ok) {
            debugLog(`[ServiceWorker v${SW_VERSION}] Fetch finished loading:`, request.method, JSON.stringify(url))
          }
          
          // Cache successful static assets
          if (shouldCache(url, response)) {
            const responseToCache = response.clone()
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(request, responseToCache)
            })
          }

          return response
        } catch (error) {
          console.error(`[ServiceWorker v${SW_VERSION}] Fetch failed:`, url, error)

          // Return offline page for navigation requests
          if (request.mode === 'navigate') {
            return new Response(
              `
              <!DOCTYPE html>
              <html>
                <head>
                  <meta charset="UTF-8">
                  <meta name="viewport" content="width=device-width, initial-scale=1.0">
                  <title>Offline - Upswitch Valuation</title>
                  <style>
                    body {
                      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      height: 100vh;
                      margin: 0;
                      background: #f9fafb;
                      color: #111827;
                    }
                    .container {
                      text-align: center;
                      padding: 2rem;
                      max-width: 500px;
                    }
                    h1 {
                      font-size: 2rem;
                      margin-bottom: 1rem;
                      color: #1f2937;
                    }
                    p {
                      font-size: 1rem;
                      line-height: 1.6;
                      color: #6b7280;
                      margin-bottom: 2rem;
                    }
                    button {
                      background: #2563eb;
                      color: white;
                      border: none;
                      padding: 0.75rem 1.5rem;
                      font-size: 1rem;
                      border-radius: 0.5rem;
                      cursor: pointer;
                      transition: background 0.2s;
                    }
                    button:hover {
                      background: #1d4ed8;
                    }
                  </style>
                </head>
                <body>
                  <div class="container">
                    <h1>📡 You're Offline</h1>
                    <p>
                      It looks like you've lost your internet connection.
                      Don't worry—your work is saved locally.
                      We'll sync your data when you're back online.
                    </p>
                    <button onclick="location.reload()">Try Again</button>
                  </div>
                </body>
              </html>
              `,
              {
                headers: {
                  'Content-Type': 'text/html',
                },
              }
            )
          }

          throw error
        }
      }
    })()
  )
})

// Background sync event - retry failed requests
self.addEventListener('sync', (event) => {
  console.log('[ServiceWorker] Sync event:', event.tag)

  if (event.tag === 'sync-valuation-data') {
    event.waitUntil(syncValuationData())
  }
})

/**
 * Sync valuation data when back online
 */
async function syncValuationData() {
  console.log('[ServiceWorker] Syncing valuation data...')

  try {
    // Get pending sync queue from IndexedDB
    const db = await openIndexedDB()
    const pendingRequests = await getPendingRequests(db)

    console.log('[ServiceWorker] Found pending requests:', pendingRequests.length)

    // Retry each pending request
    for (const request of pendingRequests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        })

        if (response.ok) {
          console.log('[ServiceWorker] Request synced:', request.url)
          await removePendingRequest(db, request.id)
        } else {
          console.error('[ServiceWorker] Request sync failed:', response.status)
        }
      } catch (error) {
        console.error('[ServiceWorker] Request sync error:', error)
      }
    }

    console.log('[ServiceWorker] Sync complete')
  } catch (error) {
    console.error('[ServiceWorker] Sync failed:', error)
    throw error
  }
}

/**
 * Open IndexedDB for sync queue
 */
function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('UpswitchSyncDB', 1)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = event.target.result

      if (!db.objectStoreNames.contains('pendingRequests')) {
        const store = db.createObjectStore('pendingRequests', { keyPath: 'id', autoIncrement: true })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
  })
}

/**
 * Get all pending requests from IndexedDB
 */
function getPendingRequests(db) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingRequests'], 'readonly')
    const store = transaction.objectStore('pendingRequests')
    const request = store.getAll()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

/**
 * Remove a pending request from IndexedDB
 */
function removePendingRequest(db, id) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['pendingRequests'], 'readwrite')
    const store = transaction.objectStore('pendingRequests')
    const request = store.delete(id)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// Push notification event (future feature)
self.addEventListener('push', (event) => {
  console.log('[ServiceWorker] Push received:', event)

  const options = {
    body: 'Your valuation is ready!',
    icon: '/icon-192.png',
    badge: '/icon-72.png',
  }

  event.waitUntil(
    self.registration.showNotification('Upswitch Valuation', options)
  )
})

// Notification click event
self.addEventListener('notificationclick', (event) => {
  console.log('[ServiceWorker] Notification clicked')

  event.notification.close()

  event.waitUntil(
    clients.openWindow('/')
  )
})

console.log('[ServiceWorker] Loaded')

