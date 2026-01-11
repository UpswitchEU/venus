/**
 * Async Architecture Initializer
 *
 * Initializes async architecture utilities on app startup:
 * - Service Worker registration (offline support)
 * - Real User Monitoring (RUM) - auto-initialized on import
 * - Performance monitoring - auto-initialized on import
 *
 * This component should be included in the app root to ensure
 * all async optimizations are active.
 *
 * @module components/AsyncArchitectureInitializer
 */

'use client'

import { useEffect } from 'react'
import { registerServiceWorker } from '../utils/serviceWorkerRegistration'
// RUM and performance monitoring auto-initialize on import
import '../utils/performance/rum'
import '../utils/performance/metrics'

export function AsyncArchitectureInitializer() {
  useEffect(() => {
    // Register service worker for offline support (production only)
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker({
        onUpdate: (registration) => {
          // Silent update notification
        },
        onSuccess: () => {
          // Silent success
        },
        onError: (error) => {
          // Silent error handling - only log in development
          if (process.env.NODE_ENV === 'development') {
            console.error('[AsyncArchitecture] Service worker registration failed:', error)
          }
        },
      }).catch((error) => {
        // Silent error handling - only log in development
        if (process.env.NODE_ENV === 'development') {
          console.error('[AsyncArchitecture] Failed to register service worker:', error)
        }
      })
    }

    // RUM and performance monitoring are automatically initialized on import
    // No additional setup needed
  }, [])

  // This component doesn't render anything
  return null
}
