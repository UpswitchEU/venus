/**
 * Analytics Hook for Upswitch Valuation Tester
 *
 * Provides easy-to-use analytics tracking for valuation-specific events
 * and user journey monitoring on the tester subdomain.
 */

import { usePathname } from 'next/navigation'
import { useCallback, useEffect } from 'react'
import {
  type AnalyticsEventParameters,
  analyticsConfig,
  trackError,
  trackEvent,
  trackPerformance,
  trackValuationJourney,
  ValuationEvents,
} from '../config/analytics'

type AnalyticsPayload = AnalyticsEventParameters

type FirstInputPerformanceEntry = PerformanceEntry & {
  processingStart?: number
}

type LayoutShiftPerformanceEntry = PerformanceEntry & {
  hadRecentInput?: boolean
  value?: number
}

function asPayload(value: unknown): AnalyticsPayload {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AnalyticsPayload)
    : {}
}

function getString(payload: AnalyticsPayload, key: string): string | undefined {
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function getNumber(payload: AnalyticsPayload, key: string): number | undefined {
  const value = payload[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function getValuationMethod(payload: AnalyticsPayload): 'manual' | 'registry' | 'document' {
  const method = getString(payload, 'method')
  return method === 'manual' || method === 'registry' || method === 'document' ? method : 'manual'
}

export const useAnalytics = () => {
  const location = usePathname()

  // Track page views
  useEffect(() => {
    trackEvent(ValuationEvents.PAGE_VIEW, {
      page_path: location,
      page_title: document.title,
      timestamp: new Date().toISOString(),
    })
  }, [location])

  // Track valuation journey
  const trackValuation = useCallback((action: string, data?: AnalyticsPayload) => {
    const payload = asPayload(data)
    switch (action) {
      case 'started':
        trackValuationJourney.started(getValuationMethod(payload))
        break
      case 'completed':
        trackValuationJourney.completed(
          getNumber(payload, 'valuationAmount') ?? 0,
          getNumber(payload, 'confidence') ?? 0,
          getString(payload, 'method') ?? 'unknown'
        )
        break
      case 'exported':
        trackValuationJourney.exported(getString(payload, 'format') === 'pdf' ? 'pdf' : 'json')
        break
      case 'abandoned':
        trackValuationJourney.abandoned(
          getString(payload, 'step') ?? 'unknown',
          getString(payload, 'reason')
        )
        break
      default:
        trackEvent(action, payload)
    }
  }, [])

  // Track performance metrics
  const trackPerformanceMetric = useCallback(
    (metric: string, value: number, context?: AnalyticsPayload) => {
      const payload = asPayload(context)
      switch (metric) {
        case 'calculation_time':
          trackPerformance.calculationTime(value, getString(payload, 'method') ?? 'unknown')
          break
        case 'page_load_time':
          trackPerformance.pageLoadTime(value, getString(payload, 'page') ?? location)
          break
        default:
          trackEvent(metric, { value, ...payload })
      }
    },
    [location]
  )

  // Track errors
  const trackErrorEvent = useCallback((error: Error, context: string) => {
    trackError(error, context)
  }, [])

  // Track form interactions
  const trackFormInteraction = useCallback((action: string, field?: string, value?: unknown) => {
    trackEvent('form_interaction', {
      action,
      field,
      value: typeof value === 'string' ? value.substring(0, 100) : value, // Truncate long values
      timestamp: new Date().toISOString(),
    })
  }, [])

  // Track API calls
  const trackApiCall = useCallback(
    (endpoint: string, method: string, success: boolean, duration?: number) => {
      trackEvent('api_call', {
        endpoint,
        method,
        success,
        duration_ms: duration,
        timestamp: new Date().toISOString(),
      })
    },
    []
  )

  // Track user engagement
  const trackEngagement = useCallback((action: string, data?: AnalyticsPayload) => {
    trackEvent('user_engagement', {
      action,
      ...asPayload(data),
      timestamp: new Date().toISOString(),
    })
  }, [])

  return {
    trackValuation,
    trackPerformanceMetric,
    trackErrorEvent,
    trackFormInteraction,
    trackApiCall,
    trackEngagement,
    config: analyticsConfig,
  }
}

/**
 * Hook for tracking valuation-specific metrics
 */
export const useValuationAnalytics = () => {
  const analytics = useAnalytics()

  // Track when user starts a valuation
  const trackValuationStart = useCallback(
    (method: 'manual' | 'registry' | 'document') => {
      analytics.trackValuation('started', { method })
    },
    [analytics]
  )

  // Track when valuation is completed
  const trackValuationComplete = useCallback(
    (valuationAmount: number, confidence: number, method: string, calculationTime: number) => {
      analytics.trackValuation('completed', {
        valuationAmount,
        confidence,
        method,
      })

      analytics.trackPerformanceMetric('calculation_time', calculationTime, { method })
    },
    [analytics]
  )

  // Track when user exports results
  const trackValuationExport = useCallback(
    (format: 'pdf' | 'json') => {
      analytics.trackValuation('exported', { format })
    },
    [analytics]
  )

  // Track form abandonment
  const trackFormAbandonment = useCallback(
    (step: string, reason?: string) => {
      analytics.trackValuation('abandoned', { step, reason })
    },
    [analytics]
  )

  return {
    trackValuationStart,
    trackValuationComplete,
    trackValuationExport,
    trackFormAbandonment,
  }
}

/**
 * Hook for tracking performance metrics
 */
export const usePerformanceAnalytics = () => {
  const analytics = useAnalytics()
  const location = usePathname()

  // Track page load performance
  useEffect(() => {
    const startTime = performance.now()

    const trackLoadTime = () => {
      const loadTime = performance.now() - startTime
      analytics.trackPerformanceMetric('page_load_time', loadTime, {
        page: location,
      })
    }

    if (document.readyState === 'complete') {
      trackLoadTime()
    } else {
      window.addEventListener('load', trackLoadTime)
      return () => window.removeEventListener('load', trackLoadTime)
    }
  }, [analytics, location])

  // Track Core Web Vitals
  useEffect(() => {
    const trackWebVitals = () => {
      // Track Largest Contentful Paint (LCP)
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1]
        analytics.trackPerformanceMetric('lcp', lastEntry.startTime)
      }).observe({ entryTypes: ['largest-contentful-paint'] })

      // Track First Input Delay (FID)
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          const firstInputEntry = entry as FirstInputPerformanceEntry
          analytics.trackPerformanceMetric(
            'fid',
            (firstInputEntry.processingStart ?? firstInputEntry.startTime) -
              firstInputEntry.startTime
          )
        })
      }).observe({ entryTypes: ['first-input'] })

      // Track Cumulative Layout Shift (CLS)
      let clsValue = 0
      new PerformanceObserver((list) => {
        const entries = list.getEntries()
        entries.forEach((entry) => {
          const layoutShiftEntry = entry as LayoutShiftPerformanceEntry
          if (!layoutShiftEntry.hadRecentInput) {
            clsValue += layoutShiftEntry.value ?? 0
          }
        })
        analytics.trackPerformanceMetric('cls', clsValue)
      }).observe({ entryTypes: ['layout-shift'] })
    }

    trackWebVitals()
  }, [analytics])

  return analytics
}
