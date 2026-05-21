/**
 * Service Worker Registration
 *
 * Handles service worker registration, updates, and lifecycle management.
 *
 * @module utils/serviceWorkerRegistration
 */

import { generalLogger } from './logger'

export interface ServiceWorkerConfig {
  /**
   * Callback when service worker is registered
   */
  onRegister?: (registration: ServiceWorkerRegistration) => void

  /**
   * Callback when service worker update is available
   */
  onUpdate?: (registration: ServiceWorkerRegistration) => void

  /**
   * Callback when service worker update is successful
   */
  onSuccess?: (registration: ServiceWorkerRegistration) => void

  /**
   * Callback when service worker registration fails
   */
  onError?: (error: Error) => void
}

/**
 * Register service worker
 *
 * Usage:
 * ```tsx
 * // In app initialization (e.g., _app.tsx or main.tsx)
 * useEffect(() => {
 *   registerServiceWorker({
 *     onUpdate: (registration) => {
 *       // Show update notification
 *       toast('New version available! Refresh to update.')
 *     },
 *     onSuccess: () => {
 *       console.log('App is ready for offline use')
 *     },
 *   })
 * }, [])
 * ```
 */
export async function registerServiceWorker(config: ServiceWorkerConfig = {}): Promise<void> {
  // Only register in production and if supported
  if (
    typeof window === 'undefined' ||
    !('serviceWorker' in navigator) ||
    process.env.NODE_ENV !== 'production'
  ) {
    generalLogger.debug('[ServiceWorker] Registration skipped', {
      reason:
        typeof window === 'undefined'
          ? 'SSR'
          : !('serviceWorker' in navigator)
            ? 'Not supported'
            : 'Not production',
    })
    return
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    })

    generalLogger.info('[ServiceWorker] Registered successfully', {
      scope: registration.scope,
    })

    config.onRegister?.(registration)

    // Check for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing

      if (!newWorker) {
        return
      }

      generalLogger.info('[ServiceWorker] Update found')

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // New service worker installed, update available
            generalLogger.info('[ServiceWorker] Update available')
            config.onUpdate?.(registration)
          } else {
            // First install
            generalLogger.info('[ServiceWorker] Content cached for offline use')
            config.onSuccess?.(registration)
          }
        }
      })
    })

    // Check for updates every hour
    setInterval(
      () => {
        registration.update().catch((error) => {
          generalLogger.error('[ServiceWorker] Update check failed', {
            error: error.message,
          })
        })
      },
      60 * 60 * 1000
    )
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error))

    generalLogger.error('[ServiceWorker] Registration failed', {
      error: err.message,
    })

    config.onError?.(err)
  }
}

/**
 * Unregister service worker
 * Useful for development or troubleshooting
 */
export async function unregisterServiceWorker(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations()

    for (const registration of registrations) {
      await registration.unregister()
      generalLogger.info('[ServiceWorker] Unregistered', {
        scope: registration.scope,
      })
    }
  } catch (error) {
    generalLogger.error('[ServiceWorker] Unregister failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

/**
 * Check if service worker is supported
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Get active service worker registration
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null
  }

  try {
    const registration = await navigator.serviceWorker.getRegistration()
    return registration ?? null
  } catch (error) {
    generalLogger.error('[ServiceWorker] Failed to get registration', {
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

/**
 * Request background sync
 * Queues failed requests to retry when online
 */
type ServiceWorkerRegistrationWithSync = ServiceWorkerRegistration & {
  sync?: {
    register: (tag: string) => Promise<void>
  }
}

export async function requestBackgroundSync(tag: string = 'sync-valuation-data'): Promise<void> {
  if (!isServiceWorkerSupported()) {
    generalLogger.warn('[ServiceWorker] Background sync not supported')
    return
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const registrationWithSync = registration as ServiceWorkerRegistrationWithSync

    if (registrationWithSync.sync) {
      await registrationWithSync.sync.register(tag)
      generalLogger.info('[ServiceWorker] Background sync requested', { tag })
    } else {
      generalLogger.warn('[ServiceWorker] Background Sync API not supported')
    }
  } catch (error) {
    generalLogger.error('[ServiceWorker] Background sync request failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
