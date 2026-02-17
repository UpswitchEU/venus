import type { Metadata } from 'next'
import { ViewTransitions } from 'next-view-transitions'
import './globals.css'
import { locales } from '../i18n'
import { Providers } from './providers'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    default: 'UpSwitch Valuation Tester',
    template: '%s | UpSwitch Valuation Tester',
  },
  description: 'Professional business valuation platform for testing and demonstration',
  keywords: ['valuation', 'business', 'M&A', 'financial analysis', 'business valuation'],
  authors: [{ name: 'UpSwitch Team' }],
  creator: 'UpSwitch',
  publisher: 'UpSwitch',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3001'),
  icons: {
    icon: [
      {
        url: '/favicon-dark-square-var1.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon-16x16.svg',
        type: 'image/svg+xml',
        sizes: '16x16',
      },
      {
        url: '/favicon-32x32.svg',
        type: 'image/svg+xml',
        sizes: '32x32',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon.svg',
        type: 'image/svg+xml',
        sizes: '180x180',
      },
    ],
    shortcut: '/favicon-dark-square-var1.svg',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'UpSwitch Valuation Tester',
    title: 'UpSwitch Valuation Tester',
    description: 'Professional business valuation platform for testing and demonstration',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'UpSwitch Valuation Tester',
    description: 'Professional business valuation platform',
  },
  robots: {
    index: false, // Tester app should not be indexed
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
      <html suppressHydrationWarning className="aurora-theme dark">
      <head>
        {/* ✅ FIX: Use manual meta tag for viewport to support Next.js 13.5.6 */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        {/* Manifest: omit on preview to avoid 401 from Vercel Deployment Protection (no path-level bypass on Standard plan) */}
        {process.env.NEXT_PUBLIC_VERCEL_ENV !== 'preview' && (
          <link rel="manifest" href="/manifest.json" />
        )}
        {/* Service Worker update check and cache clear (silent) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if ('serviceWorker' in navigator) {
                  // Force update check (silent)
                  navigator.serviceWorker.getRegistration().then(function(reg) {
                    if (reg) {
                      reg.update()
                    }
                  }).catch(function(err) {
                    // Silent error handling
                  })
                  
                  // Clear all caches to ensure fresh content (silent)
                  caches.keys().then(function(names) {
                    return Promise.all(
                      names.map(function(name) {
                        return caches.delete(name)
                      })
                    )
                  }).catch(function(err) {
                    // Silent error handling
                  })
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
    </ViewTransitions>
  )
}
