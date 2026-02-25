import type { Metadata } from 'next'
import { ViewTransitions } from 'next-view-transitions'
import { getLocale } from 'next-intl/server'
import './globals.css'
import { locales, defaultLocale, type Locale } from '../i18n'
import { Providers } from './providers'
import { VenusAnalytics } from '../src/components/analytics/VenusAnalytics'

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
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://valuation.upswitch.app'),
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let locale: Locale = defaultLocale
  try {
    const resolved = await getLocale()
    locale = locales.includes(resolved as Locale) ? (resolved as Locale) : defaultLocale
  } catch {
    // getLocale can fail outside request context; use default
  }

  return (
    <ViewTransitions>
      <html lang={locale} suppressHydrationWarning className="aurora-theme dark">
      <head>
        {/* Google tag (gtag.js) - Venus G-0RW0LNCVBG */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-0RW0LNCVBG" />
        <script dangerouslySetInnerHTML={{ __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('consent', 'default', {
  analytics_storage: 'denied',
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  functionality_storage: 'denied',
  wait_for_update: 500
});
gtag('config', 'G-0RW0LNCVBG', {
  anonymize_ip: true,
  linker: { domains: ['upswitch.app', 'valuation.upswitch.app'], accept_incoming: true }
});
` }} />
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
        <VenusAnalytics />
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
    </ViewTransitions>
  )
}
