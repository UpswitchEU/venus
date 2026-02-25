/**
 * Analytics Configuration for tester.upswitch.com
 *
 * Separate analytics setup for the valuation tester subdomain
 * to track valuation-specific metrics and user behavior.
 */

import { generalLogger } from '../utils/logger'

export interface AnalyticsConfig {
  googleAnalyticsId?: string
  hotjarId?: string
  mixpanelToken?: string
  environment: 'development' | 'staging' | 'production'
  appName: string
  version: string
}

export const analyticsConfig: AnalyticsConfig = {
  googleAnalyticsId: process.env.NEXT_PUBLIC_ANALYTICS_ID,
  hotjarId: process.env.NEXT_PUBLIC_HOTJAR_ID,
  mixpanelToken: process.env.NEXT_PUBLIC_MIXPANEL_TOKEN,
  environment:
    (process.env.NEXT_PUBLIC_ENVIRONMENT as any) || (process.env.NODE_ENV as any) || 'development',
  appName: 'Upswitch Valuation Tester',
  version: process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0',
}

/**
 * Track valuation-specific events
 */
export const trackEvent = (eventName: string, parameters?: Record<string, any>) => {
  if (typeof window === 'undefined') return

  // Google Analytics 4
  if (window.gtag && analyticsConfig.googleAnalyticsId) {
    window.gtag('event', eventName, {
      event_category: 'valuation_tester',
      ...parameters,
    })
  }

  // Mixpanel
  if (window.mixpanel && analyticsConfig.mixpanelToken) {
    window.mixpanel.track(eventName, {
      app: analyticsConfig.appName,
      version: analyticsConfig.version,
      environment: analyticsConfig.environment,
      ...parameters,
    })
  }

  // Console logging for development
  if (analyticsConfig.environment === 'development') {
    generalLogger.debug('Analytics event', { eventName, parameters })
  }
}

/**
 * Valuation-specific tracking events
 */
export const ValuationEvents = {
  // User Journey Events
  PAGE_VIEW: 'page_view',
  VALUATION_STARTED: 'valuation_started',
  VALUATION_COMPLETED: 'valuation_completed',
  VALUATION_EXPORTED: 'valuation_exported',

  // Form Events
  FORM_STARTED: 'form_started',
  FORM_ABANDONED: 'form_abandoned',
  FORM_COMPLETED: 'form_completed',

  // Feature Usage
  REGISTRY_LOOKUP: 'registry_lookup',
  DOCUMENT_UPLOAD: 'document_upload',
  LIVE_PREVIEW_USED: 'live_preview_used',

  // Error Events
  API_ERROR: 'api_error',
  VALIDATION_ERROR: 'validation_error',

  // Performance Events
  CALCULATION_TIME: 'calculation_time',
  PAGE_LOAD_TIME: 'page_load_time',
} as const

/**
 * Track user journey through valuation process
 */
export const trackValuationJourney = {
  started: (method: 'manual' | 'registry' | 'document') => {
    trackEvent(ValuationEvents.VALUATION_STARTED, {
      method,
      timestamp: new Date().toISOString(),
    })
  },

  completed: (valuationAmount: number, confidence: number, method: string) => {
    trackEvent(ValuationEvents.VALUATION_COMPLETED, {
      valuation_amount: valuationAmount,
      confidence_score: confidence,
      calculation_method: method,
      timestamp: new Date().toISOString(),
    })
  },

  exported: (format: 'pdf' | 'json') => {
    trackEvent(ValuationEvents.VALUATION_EXPORTED, {
      export_format: format,
      timestamp: new Date().toISOString(),
    })
  },

  abandoned: (step: string, reason?: string) => {
    trackEvent(ValuationEvents.FORM_ABANDONED, {
      abandonment_step: step,
      reason,
      timestamp: new Date().toISOString(),
    })
  },
}

/**
 * Track performance metrics
 */
export const trackPerformance = {
  calculationTime: (timeMs: number, method: string) => {
    trackEvent(ValuationEvents.CALCULATION_TIME, {
      calculation_time_ms: timeMs,
      method,
    })
  },

  pageLoadTime: (timeMs: number, page: string) => {
    trackEvent(ValuationEvents.PAGE_LOAD_TIME, {
      load_time_ms: timeMs,
      page,
    })
  },
}

/**
 * Track errors and issues
 */
export const trackError = (error: Error, context: string) => {
  trackEvent('error_occurred', {
    error_message: error.message,
    error_stack: error.stack,
    context,
    timestamp: new Date().toISOString(),
  })
}

// Global type declarations (gtag is declared in src/types/gtag.d.ts)
declare global {
  interface Window {
    mixpanel?: {
      track: (event: string, properties?: Record<string, any>) => void
      identify: (id: string) => void
    }
  }
}
