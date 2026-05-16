'use client'

import { useEffect } from 'react'
import { Toaster } from 'sonner'
import { ErrorBoundary } from '../src/components/ErrorBoundary'
import { LogoutListener } from '../src/components/LogoutListener'
import { ToastProvider } from '../src/hooks/useToast'
import { ScrollToTop } from '../src/utils'
import { generalLogger } from '../src/utils/logger'
import { registerServiceWorker } from '../src/utils/serviceWorkerRegistration'
// RUM is auto-initialized on import
import '../src/utils/performance/rum'
// Auth is auto-initialized on import
import '../src/lib/auth'
import { installMercuryAuthBootstrapListener } from '../src/utils/auth/mercury-auth-bootstrap'

// Install the Mercury → Engine auth bootstrap listener as early as possible
// (before bootstrap resolvers run). When Venus loads inside the Mercury
// embedded modal, Mercury posts the authenticated user as soon as the iframe
// `load` event fires; capturing that here lets `AuthResolver` skip its own
// `/api/auth/me` round-trip on the warm path.
if (typeof window !== 'undefined') {
  installMercuryAuthBootstrapListener()
}

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
  // LAUNCH READY: Global unhandled rejection handler - log for debugging, prevent silent failures
  useEffect(() => {
    const handler = (event: PromiseRejectionEvent) => {
      generalLogger.error('[UnhandledRejection] Promise rejection', {
        reason: event.reason,
        message: event.reason?.message ?? String(event.reason),
        stack: event.reason?.stack,
      })
      // Don't preventDefault - let the error propagate for dev tools, but we've logged it
    }
    window.addEventListener('unhandledrejection', handler)
    return () => window.removeEventListener('unhandledrejection', handler)
  }, [])

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
      <ErrorBoundary>
        <>
          <LogoutListener />
          <ScrollToTop />
          {children}
        </>
      </ErrorBoundary>
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        duration={4000}
        toastOptions={{
          classNames: {
            toast: 'bg-card border border-foreground/10 shadow-lg rounded-xl',
            title: 'text-foreground',
            description: 'text-muted-foreground',
            actionButton: 'bg-primary text-primary-foreground',
            cancelButton: 'bg-muted text-muted-foreground',
          },
        }}
      />
    </ToastProvider>
  )
}
