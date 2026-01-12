/**
 * Service Worker - TEMPORARILY DISABLED
 * 
 * This service worker is disabled because it was causing infinite fetch loops
 * and preventing the application from loading properly.
 * 
 * When this version installs, it will:
 * 1. Clear all existing caches
 * 2. Unregister itself
 * 3. Reload all clients to ensure clean state
 * 
 * @module sw
 */

const SW_VERSION = '1.0.9-disabled'

console.log(`[ServiceWorker] Version ${SW_VERSION} - DISABLED MODE`)
console.log('[ServiceWorker] This SW will unregister itself and clear all caches')

// Clear all caches on install
self.addEventListener('install', (event) => {
  console.log('[ServiceWorker] Install - clearing all caches')
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[ServiceWorker] Found caches:', cacheNames)
      return Promise.all(
        cacheNames.map((cacheName) => {
          console.log('[ServiceWorker] Deleting cache:', cacheName)
          return caches.delete(cacheName)
        })
      )
    }).then(() => {
      console.log('[ServiceWorker] All caches cleared successfully')
      // Skip waiting to activate immediately
      return self.skipWaiting()
    })
  )
})

// Unregister on activate
self.addEventListener('activate', (event) => {
  console.log('[ServiceWorker] Activate - unregistering')
  
  event.waitUntil(
    self.clients.claim().then(() => {
      console.log('[ServiceWorker] Claimed all clients')
      return self.registration.unregister()
    }).then((success) => {
      if (success) {
        console.log('[ServiceWorker] Unregistered successfully')
      } else {
        console.warn('[ServiceWorker] Unregister returned false')
      }
      
      // Reload all clients after a short delay
      setTimeout(() => {
        self.clients.matchAll({ type: 'window' }).then((clients) => {
          console.log('[ServiceWorker] Reloading', clients.length, 'clients')
          clients.forEach((client) => {
            console.log('[ServiceWorker] Sending reload message to:', client.url)
            client.postMessage({ type: 'SW_DISABLED', message: 'Service worker disabled, page will reload' })
          })
        })
      }, 100)
    })
  )
})

// Don't intercept any fetch events - let browser handle everything
self.addEventListener('fetch', (event) => {
  // Pass through all requests - no interception
  return
})

console.log('[ServiceWorker] Disabled SW registered - will unregister on next activation')
