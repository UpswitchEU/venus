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
    // TEMPORARILY DISABLED: Service worker registration
    // The service worker was causing infinite reload loops and fetch failures.
    // Re-enable after fixing the SW implementation.
    
    // if (process.env.NODE_ENV === 'production') {
    //   registerServiceWorker({
    //     onUpdate: (registration) => {
    //       // Silent update notification
    //     },
    //     onSuccess: () => {
    //       // Silent success
    //     },
    //     onError: (error) => {
    //       // Silent error handling - only log in development
    //       if (process.env.NODE_ENV === 'development') {
    //         console.error('[ServiceWorker] Registration failed:', error)
    //       }
    //     },
    //   })
    // }
  }, [])

  return (
    <ToastProvider>
      <LogoutListener />
      {children}
    </ToastProvider>
  )
}
