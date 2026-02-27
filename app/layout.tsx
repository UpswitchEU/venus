import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { ViewTransitions } from 'next-view-transitions'
import './globals.css'
import { defaultLocale, type Locale, locales } from '../i18n'
import { VenusAnalytics } from '../src/components/analytics/VenusAnalytics'
import { Providers } from './providers'

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

export const metadata: Metadata = {
  title: {
    default: 'Upswitch | Bedrijfswaardering',
    template: '%s | Upswitch',
  },
  description: 'Professionele bedrijfswaardering door Upswitch — snel, betrouwbaar en betaalbaar.',
  keywords: [
    'bedrijfswaardering',
    'waardering',
    'EBITDA',
    'KMO',
    'België',
    'waardebepaling',
    'M&A',
    'accountant',
    'financiële analyse',
  ],
  authors: [{ name: 'Upswitch' }],
  creator: 'Upswitch',
  publisher: 'Upswitch',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://valuation.upswitch.app'),
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '32x32' },
      {
        url: '/favicon-dark-square-var1.svg',
        type: 'image/svg+xml',
      },
      {
        url: '/favicon-32x32.png',
        type: 'image/png',
        sizes: '32x32',
      },
      {
        url: '/favicon-16x16.png',
        type: 'image/png',
        sizes: '16x16',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon.png',
        type: 'image/png',
        sizes: '180x180',
      },
    ],
    shortcut: '/favicon.ico',
  },
  openGraph: {
    type: 'website',
    locale: 'nl_BE',
    url: 'https://valuation.upswitch.app',
    siteName: 'Upswitch',
    title: 'Upswitch | Bedrijfswaardering',
    description: 'Het platform waarmee accountants professionele bedrijfswaarderingen uitvoeren.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Upswitch | Bedrijfswaardering',
    description: 'Het platform waarmee accountants professionele bedrijfswaarderingen uitvoeren.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
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
          <script
            dangerouslySetInnerHTML={{
              __html: `
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
`,
            }}
          />
          {/* ✅ FIX: Use manual meta tag for viewport to support Next.js 13.5.6 */}
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
          {/* Manifest: omit on preview to avoid 401 from Vercel Deployment Protection (no path-level bypass on Standard plan) */}
          {process.env.NEXT_PUBLIC_VERCEL_ENV !== 'preview' && (
            <link rel="manifest" href="/manifest.json" />
          )}
        </head>
        <body className="bg-background text-foreground antialiased">
          <VenusAnalytics />
          <Providers>{children}</Providers>
        </body>
      </html>
    </ViewTransitions>
  )
}
