'use client'

import { useEffect } from 'react'
import { ToastProvider } from '../src/hooks/useToast'
import { registerServiceWorker } from '../src/utils/serviceWorkerRegistration'
import { LogoutListener } from '../src/components/LogoutListener'
// RUM is auto-initialized on import
import '../src/utils/performance/rum'
// Auth is auto-initialized on import
import '../src/lib/auth'

/**
 * Root Providers Component
 *
 * Essential providers:
 * - ToastProvider for notifications
 * - Auth initialized on module import
 * - LogoutListener for cross-subdomain sync
 * - Service Worker registration
 * - RUM for performance monitoring
 */
export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // Register service worker for offline support (production only)
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker({
        onUpdate: (registration) => {
          console.log('[ServiceWorker] New version available! Please refresh.')
        },
        onSuccess: () => {
          console.log('[ServiceWorker] App is ready for offline use')
        },
        onError: (error) => {
          console.error('[ServiceWorker] Registration failed:', error)
        },
      })
    }
  }, [])

  return (
    <ToastProvider>
      <LogoutListener />
      {children}
    </ToastProvider>
  )
}
