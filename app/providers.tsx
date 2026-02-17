'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { LogoutListener } from '../src/components/LogoutListener'
import { ScrollToTop } from '../src/utils'
import { ToastProvider } from '../src/hooks/useToast'
import { registerServiceWorker } from '../src/utils/serviceWorkerRegistration'
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
      <ScrollToTop />
      {children}
      <Toaster
        position="bottom-right"
        theme="dark"
        toastOptions={{
          classNames: {
            toast: 'bg-card border border-foreground/10 shadow-lg',
            title: 'text-foreground',
            description: 'text-foreground/70',
          },
        }}
      />
    </ToastProvider>
  )
}
