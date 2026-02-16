'use client'

import { Link } from 'next-view-transitions'
import { Suspense } from 'react'
import { ScrollToTop } from '../src/utils'

function NotFoundContent() {
  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center px-4">
      <ScrollToTop />
      <div className="max-w-md w-full text-center">
        <div className="mb-8">
          <h1 className="text-9xl font-bold text-primary-600">404</h1>
          <div className="text-6xl mb-4">🔍</div>
          <h2 className="text-3xl font-bold text-gray-900 mb-2">Page Not Found</h2>
          <p className="text-gray-600 mb-8">
            Sorry, the page you're looking for doesn't exist or has been moved.
          </p>
        </div>

        <div className="space-y-4">
          <Link
            href="/"
            className="block w-full px-6 py-3 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 transition-colors"
          >
            Go to Home
          </Link>

          <Link
            href="/reports/new"
            className="block w-full px-6 py-3 bg-white text-primary-600 font-semibold rounded-lg border-2 border-primary-600 hover:bg-primary-50 transition-colors"
          >
            Start Valuation
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
