/**
 * Service Worker - COMPLETELY DISABLED
 * 
 * This is an empty service worker that does nothing.
 * It will be automatically unregistered by the browser.
 * 
 * @module sw
 */

const SW_VERSION = '1.0.10-empty'

console.log(`[ServiceWorker] Version ${SW_VERSION} - EMPTY/NO-OP`)

// Immediately skip waiting and activate
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install - immediately skipping waiting')
  self.skipWaiting()
})

// Claim all clients and clear caches
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate - claiming clients and clearing caches')
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        )
      })
    ]).then(() => {
      console.log('[ServiceWorker] Activated, caches cleared')
    })
  )
})

// No fetch interception - let all requests pass through
console.log('[ServiceWorker] Empty service worker loaded - no fetch interception')
