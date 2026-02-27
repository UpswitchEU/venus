// No-op service worker — replaces any previously registered SW.
// Does NOT clear caches (that can force JS re-fetches mid-session).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()))
