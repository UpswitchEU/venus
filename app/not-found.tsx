'use client'

import { Link } from 'next-view-transitions'
import { Suspense } from 'react'
import { ScrollToTop } from '../src/utils'

// Static strings — not-found is prerendered without NextIntlClientProvider
const FALLBACK = {
  pageNotFound: 'Page Not Found',
  description: "Sorry, the page you're looking for doesn't exist or has been moved.",
  goHome: 'Go to Home',
  startValuation: 'Start Valuation',
}

function NotFoundContent() {
  // Use 'en' as default — when rendered inside [locale], path will have locale
  const locale = typeof window !== 'undefined'
    ? (window.location.pathname.split('/')[1] || 'en')
    : 'en'
  const safeLocale = locale === 'en' || locale === 'nl' ? locale : 'en'
  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4 aurora-theme">
      <ScrollToTop />
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-primary">404</h1>
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-3xl font-bold text-foreground mb-2">{FALLBACK.pageNotFound}</h2>
          <p className="text-muted-foreground mb-8">{FALLBACK.description}</p>
        </div>

        <div className="space-y-4">
          <Link
            href={`/${safeLocale}`}
            className="block w-full px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all duration-200"
          >
            {FALLBACK.goHome}
          </Link>

          <Link
            href={`/${safeLocale}/reports/new`}
            className="block w-full px-6 py-3 bg-background text-primary font-semibold rounded-xl border-2 border-primary hover:bg-primary/5 transition-all duration-200"
          >
            {FALLBACK.startValuation}
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function NotFound() {
  return (
    <Suspense
      fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}
    >
      <NotFoundContent />
    </Suspense>
  )
}
