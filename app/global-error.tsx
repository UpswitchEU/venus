'use client'

import { useEffect } from 'react'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // LAUNCH READY: Log error for debugging (global-error replaces root layout, use console)
  useEffect(() => {
    console.error('[GlobalError] Uncaught error', {
      message: error.message,
      stack: error.stack,
      digest: error.digest,
      name: error.name,
    })
  }, [error])

  return (
    <html suppressHydrationWarning>
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
            background: '#0f1219',
            color: '#fff',
            flexDirection: 'column',
            gap: 16,
            textAlign: 'center',
          }}
        >
          <h2 style={{ margin: 0, fontSize: '1.25rem' }}>Something went wrong</h2>
          <p style={{ margin: 0, opacity: 0.8, maxWidth: 400 }}>
            We encountered an unexpected error. Please try again or return to the homepage.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                padding: '8px 16px',
                background: '#0d9488',
                color: '#fff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Try Again
            </button>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              style={{
                padding: '8px 16px',
                background: 'transparent',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.3)',
                borderRadius: 8,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Return Home
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
