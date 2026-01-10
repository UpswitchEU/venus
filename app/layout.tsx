import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import { locales } from '../i18n'
import { ClientContextBanner } from '../src/components/ClientContextBanner'

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
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
    <html suppressHydrationWarning>
      <head>
        {/* ✅ FIX: Use manual meta tag for viewport to support Next.js 13.5.6 */}
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        {/* Manifest is still referenced here as it's not part of metadata API */}
        <link rel="manifest" href="/manifest.json" />
        {/* CRITICAL: Force Service Worker update check and cache clear */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if ('serviceWorker' in navigator) {
                  // Force update check
                  navigator.serviceWorker.getRegistration().then(function(reg) {
                    if (reg) {
                      console.log('[SW Force Update] Checking for updates...')
                      reg.update()
                    }
                  }).catch(function(err) {
                    console.error('[SW Force Update] Error:', err)
                  })
                  
                  // Clear all caches to ensure fresh content
                  caches.keys().then(function(names) {
                    console.log('[Cache Clear] Found caches:', names)
                    return Promise.all(
                      names.map(function(name) {
                        console.log('[Cache Clear] Deleting cache:', name)
                        return caches.delete(name)
                      })
                    )
                  }).then(function() {
                    console.log('[Cache Clear] All caches cleared')
                  }).catch(function(err) {
                    console.error('[Cache Clear] Error:', err)
                  })
                }
              })();
            `,
          }}
        />
      </head>
      <body className="bg-zinc-950 text-white antialiased">
        <Providers>
          <ClientContextBanner />
          {children}
        </Providers>
      </body>
    </html>
  )
}
