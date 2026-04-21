'use client'

/**
 * Venus consent + SPA `page_view` emitter.
 *
 * Single source of truth for `page_view` on Venus. The base gtag config in
 * `app/layout.tsx <head>` is loaded with `send_page_view: false`, so without
 * this component no view events would fire — and with it, exactly one view
 * fires per real navigation. Auto page_view + an effect-based emitter would
 * have double-counted every initial paint (the same regression Mercury hit
 * on `/nl/calculator`).
 *
 * Every event is consent-gated, deduplicated against the last-fired URL, and
 * enriched with `traffic_type` + `locale` so the Venus GA4 property has the
 * same dimensions Mercury's streams do (cross-app cohort analysis works out
 * of the box).
 */

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { getCookiePreferences, isAnalyticsConsentGranted } from '@/lib/analytics-consent'
import { classifyTrafficType, detectLocaleFromPath } from '@/lib/analytics-context'

const VENUS_MEASUREMENT_ID = 'G-0RW0LNCVBG'

export function VenusAnalytics() {
  const pathname = usePathname()

  // Suppress duplicate `page_view` from React 18 Strict Mode double-mount,
  // consent flips that re-run the effect, or any non-path re-render.
  const lastFiredPathRef = useRef<string | null>(null)

  useEffect(() => {
    if (!pathname) return
    if (lastFiredPathRef.current === pathname) return
    if (typeof window === 'undefined' || typeof window.gtag !== 'function') return
    if (!isAnalyticsConsentGranted()) return

    try {
      const trafficType = classifyTrafficType(pathname)
      const locale = detectLocaleFromPath(pathname)
      const referrer =
        typeof document !== 'undefined' && document.referrer
          ? document.referrer.slice(0, 500)
          : undefined

      const params: Record<string, string | number | boolean> = {
        page_path: pathname,
        send_to: VENUS_MEASUREMENT_ID,
        traffic_type: trafficType,
        locale,
      }
      if (typeof document !== 'undefined' && document.title) {
        params.page_title = document.title.slice(0, 300)
      }
      if (referrer) params.page_referrer = referrer

      window.gtag('event', 'page_view', params)

      // Dev counter: confirms in DevTools that exactly one `page_view`
      // fires per real navigation post-deploy. Mirrors the Mercury hook
      // so QA can use the same verification step on both apps.
      if (process.env.NODE_ENV !== 'production') {
        const w = window as unknown as { __upswitch_pageview_seq?: number }
        w.__upswitch_pageview_seq = (w.__upswitch_pageview_seq ?? 0) + 1
      }

      lastFiredPathRef.current = pathname
    } catch {
      // analytics must never throw into product code
    }
  }, [pathname])

  useEffect(() => {
    const updateConsent = () => {
      const prefs = getCookiePreferences()
      if (!prefs || typeof window.gtag !== 'function') return

      window.gtag('consent', 'update', {
        analytics_storage: prefs.analytics ? 'granted' : 'denied',
        functionality_storage: prefs.functional ? 'granted' : 'denied',
      })

      if (!prefs.analytics) {
        try {
          window.gtag('set', { user_id: undefined })
        } catch {
          /* ignore */
        }
      }
    }

    updateConsent()

    window.addEventListener('cookie-consent-update', updateConsent)
    return () => window.removeEventListener('cookie-consent-update', updateConsent)
  }, [])

  return null
}
