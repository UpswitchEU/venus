/**
 * Real User Monitoring (RUM)
 *
 * Collects real-world performance metrics from actual users.
 * Tracks Core Web Vitals, custom metrics, and user experience.
 *
 * Core Web Vitals:
 * - LCP (Largest Contentful Paint) - Loading performance
 * - FID (First Input Delay) - Interactivity
 * - CLS (Cumulative Layout Shift) - Visual stability
 *
 * Additional Metrics:
 * - TTFB (Time to First Byte) - Server response time
 * - FCP (First Contentful Paint) - Initial render
 * - TTI (Time to Interactive) - Full interactivity
 *
 * @module utils/performance/rum
 */

import { generalLogger } from '../logger'
import { createRandomId } from '../secureRandom'

interface LargestContentfulPaintMetricEntry extends PerformanceEntry {
  loadTime?: number
  renderTime?: number
}

interface FirstInputMetricEntry extends PerformanceEntry {
  processingStart: number
}

interface LayoutShiftMetricEntry extends PerformanceEntry {
  hadRecentInput?: boolean
  value?: number
}

export interface WebVitalsMetric {
  /**
   * Metric name
   */
  name: 'FCP' | 'LCP' | 'FID' | 'CLS' | 'TTFB' | 'INP'

  /**
   * Metric value
   */
  value: number

  /**
   * Metric rating (good, needs-improvement, poor)
   */
  rating: 'good' | 'needs-improvement' | 'poor'

  /**
   * Delta from previous value
   */
  delta: number

  /**
   * Unique metric ID
   */
  id: string

  /**
   * Navigation type
   */
  navigationType: 'navigate' | 'reload' | 'back-forward' | 'prerender'
}

export interface CustomMetric {
  /**
   * Metric name
   */
  name: string

  /**
   * Metric value
   */
  value: number

  /**
   * Timestamp
   */
  timestamp: number

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>
}

export interface RUMConfig {
  /**
   * Enable console logging
   */
  debug?: boolean

  /**
   * Callback for web vitals metrics
   */
  onWebVitalsMetric?: (metric: WebVitalsMetric) => void

  /**
   * Callback for custom metrics
   */
  onCustomMetric?: (metric: CustomMetric) => void

  /**
   * Sample rate (0-1, default: 1 = 100%)
   */
  sampleRate?: number
}

/**
 * Real User Monitoring Manager
 */
export class RUMManager {
  private config: RUMConfig
  private customMetrics: CustomMetric[] = []
  private webVitalsMetrics: WebVitalsMetric[] = []
  private observer: PerformanceObserver | null = null

  constructor(config: RUMConfig = {}) {
    this.config = {
      debug: false,
      sampleRate: 1,
      ...config,
    }

    if (typeof window === 'undefined') {
      return
    }

    // Check if we should sample this user
    const sampleRate = this.config.sampleRate ?? 1
    if (Math.random() > sampleRate) {
      generalLogger.debug('[RUM] User not sampled, skipping RUM collection')
      return
    }

    this.init()
  }

  /**
   * Initialize RUM collection
   */
  private init(): void {
    // Collect web vitals
    this.collectWebVitals()

    // Collect navigation timing
    this.collectNavigationTiming()

    // Collect resource timing
    this.collectResourceTiming()

    generalLogger.debug('[RUM] Initialized successfully')
  }

  /**
   * Collect Core Web Vitals
   * Uses web-vitals library patterns
   */
  private collectWebVitals(): void {
    // FCP - First Contentful Paint
    this.observePaint('first-contentful-paint', 'FCP')

    // LCP - Largest Contentful Paint
    this.observeLCP()

    // FID - First Input Delay (deprecated, replaced by INP)
    this.observeFID()

    // INP - Interaction to Next Paint (new metric)
    this.observeINP()

    // CLS - Cumulative Layout Shift
    this.observeCLS()

    // TTFB - Time to First Byte
    this.observeTTFB()
  }

  /**
   * Observe paint metrics
   */
  private observePaint(name: string, metricName: 'FCP'): void {
    if (!('PerformanceObserver' in window)) {
      return
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === name) {
            const metric: WebVitalsMetric = {
              name: metricName,
              value: entry.startTime,
              rating: this.getRating(metricName, entry.startTime),
              delta: entry.startTime,
              id: this.generateId(),
              navigationType: this.getNavigationType(),
            }

            this.reportWebVitalsMetric(metric)
            observer.disconnect()
          }
        }
      })

      observer.observe({ type: 'paint', buffered: true })
    } catch (error) {
      generalLogger.error('[RUM] Failed to observe paint', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Observe LCP
   */
  private observeLCP(): void {
    if (!('PerformanceObserver' in window)) {
      return
    }

    try {
      const observer = new PerformanceObserver((list) => {
        const entries = list.getEntries()
        const lastEntry = entries[entries.length - 1] as
          | LargestContentfulPaintMetricEntry
          | undefined
        if (!lastEntry) return
        const value = lastEntry.renderTime || lastEntry.loadTime || lastEntry.startTime

        const metric: WebVitalsMetric = {
          name: 'LCP',
          value,
          rating: this.getRating('LCP', value),
          delta: value,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
        }

        this.reportWebVitalsMetric(metric)
      })

      observer.observe({ type: 'largest-contentful-paint', buffered: true })
    } catch (error) {
      generalLogger.error('[RUM] Failed to observe LCP', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Observe FID
   */
  private observeFID(): void {
    if (!('PerformanceObserver' in window)) {
      return
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as FirstInputMetricEntry[]) {
          const value = entry.processingStart - entry.startTime
          const metric: WebVitalsMetric = {
            name: 'FID',
            value,
            rating: this.getRating('FID', value),
            delta: value,
            id: this.generateId(),
            navigationType: this.getNavigationType(),
          }

          this.reportWebVitalsMetric(metric)
          observer.disconnect()
        }
      })

      observer.observe({ type: 'first-input', buffered: true })
    } catch (error) {
      generalLogger.error('[RUM] Failed to observe FID', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Observe INP (Interaction to Next Paint)
   */
  private observeINP(): void {
    // INP is a new metric, implementation would use event timing API
    // For now, we'll skip detailed implementation
    if (this.config.debug) {
      generalLogger.debug('[RUM] INP observation not yet implemented')
    }
  }

  /**
   * Observe CLS
   */
  private observeCLS(): void {
    if (!('PerformanceObserver' in window)) {
      return
    }

    try {
      let clsValue = 0

      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as LayoutShiftMetricEntry[]) {
          if (!entry.hadRecentInput) {
            clsValue += entry.value ?? 0
          }
        }

        const metric: WebVitalsMetric = {
          name: 'CLS',
          value: clsValue,
          rating: this.getRating('CLS', clsValue),
          delta: clsValue,
          id: this.generateId(),
          navigationType: this.getNavigationType(),
        }

        this.reportWebVitalsMetric(metric)
      })

      observer.observe({ type: 'layout-shift', buffered: true })
    } catch (error) {
      generalLogger.error('[RUM] Failed to observe CLS', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Observe TTFB
   */
  private observeTTFB(): void {
    if (!('PerformanceObserver' in window)) {
      return
    }

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as PerformanceNavigationTiming[]) {
          if (entry.entryType === 'navigation') {
            const ttfb = entry.responseStart - entry.requestStart

            const metric: WebVitalsMetric = {
              name: 'TTFB',
              value: ttfb,
              rating: this.getRating('TTFB', ttfb),
              delta: ttfb,
              id: this.generateId(),
              navigationType: this.getNavigationType(),
            }

            this.reportWebVitalsMetric(metric)
            observer.disconnect()
          }
        }
      })

      observer.observe({ type: 'navigation', buffered: true })
    } catch (error) {
      generalLogger.error('[RUM] Failed to observe TTFB', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Collect navigation timing metrics
   */
  private collectNavigationTiming(): void {
    if (typeof window === 'undefined' || !window.performance?.timing) {
      return
    }

    window.addEventListener('load', () => {
      const timing = window.performance.timing
      const navigationStart = timing.navigationStart

      // Page load time
      this.trackCustomMetric('page_load_time', timing.loadEventEnd - navigationStart)

      // DNS lookup time
      this.trackCustomMetric('dns_lookup_time', timing.domainLookupEnd - timing.domainLookupStart)

      // TCP connection time
      this.trackCustomMetric('tcp_connection_time', timing.connectEnd - timing.connectStart)

      // Server response time
      this.trackCustomMetric('server_response_time', timing.responseEnd - timing.requestStart)

      // DOM processing time
      this.trackCustomMetric('dom_processing_time', timing.domComplete - timing.domLoading)

      // DOM content loaded
      this.trackCustomMetric(
        'dom_content_loaded',
        timing.domContentLoadedEventEnd - navigationStart
      )
    })
  }

  /**
   * Collect resource timing metrics
   */
  private collectResourceTiming(): void {
    if (typeof window === 'undefined' || !window.performance?.getEntriesByType) {
      return
    }

    window.addEventListener('load', () => {
      const resources = window.performance.getEntriesByType(
        'resource'
      ) as PerformanceResourceTiming[]

      const summary = {
        totalResources: resources.length,
        totalDuration: resources.reduce((sum, r) => sum + r.duration, 0),
        avgDuration: 0,
      }

      summary.avgDuration =
        summary.totalResources > 0 ? summary.totalDuration / summary.totalResources : 0

      this.trackCustomMetric('resource_count', summary.totalResources)
      this.trackCustomMetric('resource_total_duration', summary.totalDuration)
      this.trackCustomMetric('resource_avg_duration', summary.avgDuration)
    })
  }

  /**
   * Track custom metric
   */
  trackCustomMetric(name: string, value: number, metadata?: Record<string, unknown>): void {
    const metric: CustomMetric = {
      name,
      value,
      timestamp: Date.now(),
      metadata,
    }

    this.customMetrics.push(metric)

    if (this.config.onCustomMetric) {
      this.config.onCustomMetric(metric)
    }

    if (this.config.debug) {
      generalLogger.debug('[RUM] Custom metric tracked', {
        name,
        value: Math.round(value),
        metadata,
      })
    }
  }

  /**
   * Report web vitals metric
   */
  private reportWebVitalsMetric(metric: WebVitalsMetric): void {
    this.webVitalsMetrics.push(metric)

    if (this.config.onWebVitalsMetric) {
      this.config.onWebVitalsMetric(metric)
    }

    generalLogger.debug('[RUM] Web Vitals metric collected', {
      name: metric.name,
      value: Math.round(metric.value),
      rating: metric.rating,
    })
  }

  /**
   * Get rating for metric
   */
  private getRating(
    name: WebVitalsMetric['name'],
    value: number
  ): 'good' | 'needs-improvement' | 'poor' {
    const thresholds: Record<WebVitalsMetric['name'], { good: number; poor: number }> = {
      FCP: { good: 1800, poor: 3000 },
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      INP: { good: 200, poor: 500 },
      CLS: { good: 0.1, poor: 0.25 },
      TTFB: { good: 800, poor: 1800 },
    }

    const threshold = thresholds[name]

    if (value <= threshold.good) {
      return 'good'
    } else if (value <= threshold.poor) {
      return 'needs-improvement'
    } else {
      return 'poor'
    }
  }

  /**
   * Generate unique metric ID
   */
  private generateId(): string {
    return createRandomId('rum', 12)
  }

  /**
   * Get navigation type
   */
  private getNavigationType(): WebVitalsMetric['navigationType'] {
    if (typeof window === 'undefined') {
      return 'navigate'
    }

    const navEntry = window.performance?.getEntriesByType('navigation')[0] as
      | PerformanceNavigationTiming
      | undefined

    if (navEntry?.type === 'back_forward') return 'back-forward'
    if (navEntry?.type === 'reload' || navEntry?.type === 'prerender') return navEntry.type
    return 'navigate'
  }

  /**
   * Get all collected metrics
   */
  getMetrics(): {
    webVitals: WebVitalsMetric[]
    custom: CustomMetric[]
  } {
    return {
      webVitals: [...this.webVitalsMetrics],
      custom: [...this.customMetrics],
    }
  }

  /**
   * Export metrics for analytics
   */
  export(): string {
    return JSON.stringify(this.getMetrics(), null, 2)
  }

  /**
   * Get summary of web vitals
   */
  getWebVitalsSummary(): Record<string, { value: number; rating: string }> {
    const summary: Record<string, { value: number; rating: string }> = {}

    this.webVitalsMetrics.forEach((metric) => {
      summary[metric.name] = {
        value: Math.round(metric.value),
        rating: metric.rating,
      }
    })

    return summary
  }
}

/**
 * No-op RUM Manager for SSR
 * Prevents hydration mismatches by providing a safe instance during server-side rendering
 */
class NoOpRUMManager extends RUMManager {
  constructor() {
    // Call parent constructor with disabled config
    super({ debug: false, sampleRate: 0 })
  }

  trackCustomMetric(): void {
    // No-op
  }

  getMetrics() {
    return { webVitals: [], custom: [] }
  }

  export(): string {
    return JSON.stringify({ webVitals: [], custom: [] }, null, 2)
  }

  getWebVitalsSummary(): Record<string, { value: number; rating: string }> {
    return {}
  }
}

// Lazy initialization to prevent SSR hydration issues
// Only instantiate on client side (when window is available)
let rumManagerInstance: RUMManager | null = null

function getRUMManager(): RUMManager {
  // Return no-op instance for SSR to prevent hydration mismatches
  if (typeof window === 'undefined') {
    return new NoOpRUMManager()
  }

  // Lazy initialize on client side
  if (!rumManagerInstance) {
    rumManagerInstance = new RUMManager({
      debug: process.env.NODE_ENV === 'development',
      onWebVitalsMetric: (metric) => {
        // Send to analytics service (e.g., Google Analytics, Datadog)
        // analytics.track('web_vitals', { ...metric })
      },
      onCustomMetric: (metric) => {
        // Send to analytics service
        // analytics.track('custom_metric', { ...metric })
      },
    })
  }

  return rumManagerInstance
}

// Export singleton instance (lazy initialized)
// This will return a no-op instance during SSR and a real instance on the client
export const rumManager = getRUMManager()
