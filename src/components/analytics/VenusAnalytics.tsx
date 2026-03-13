'use client'

import { usePathname } from 'next/navigation'
import { useEffect } from 'react'

const COOKIE_CONSENT_KEY = 'upswitch_cookie_consent'

function getConsentFromCookie(): { analytics?: boolean; functional?: boolean } | null {
  try {
    const match = document.cookie
      .split('; ')
      .find((row) => row.startsWith(`${COOKIE_CONSENT_KEY}=`))
    if (!match) return null
    return JSON.parse(decodeURIComponent(match.split('=').slice(1).join('=')))
  } catch {
    return null
  }
}

/**
 * Venus consent updater.
 * Reads Mercury's cookie consent via a cross-subdomain cookie (.upswitch.app)
 * and updates gtag consent mode accordingly.
 */
export function VenusAnalytics() {
  const pathname = usePathname()

  // SPA page_view: GA4 only sends page_view on initial load; track client-side navigation
  useEffect(() => {
    if (pathname && typeof window !== 'undefined' && typeof window.gtag === 'function') {
      window.gtag('event', 'page_view', {
        page_path: pathname,
        page_title: document.title,
      })
    }
  }, [pathname])

  useEffect(() => {
    const updateConsent = () => {
      const prefs = getConsentFromCookie()
      if (!prefs || typeof window.gtag !== 'function') return

      window.gtag('consent', 'update', {
        analytics_storage: prefs.analytics ? 'granted' : 'denied',
        functionality_storage: prefs.functional ? 'granted' : 'denied',
      })
    }

    updateConsent()

    window.addEventListener('cookie-consent-update', updateConsent)
    return () => window.removeEventListener('cookie-consent-update', updateConsent)
  }, [])

  return null
}
