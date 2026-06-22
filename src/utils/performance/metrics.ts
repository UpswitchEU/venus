/**
 * Performance Metrics Collection
 *
 * Collects and tracks performance metrics for async operations and UI feedback.
 * Ensures all operations meet performance targets (<16ms UI, <2s calculations, etc.)
 *
 * Benefits:
 * - Real-time performance monitoring
 * - Identify bottlenecks
 * - Track performance degradation
 * - Validate async optimization efforts
 *
 * @module utils/performance/metrics
 */

import { generalLogger } from '../logger'
import {
  createManagedInterval,
  type ManagedIntervalStartOptions,
  type ManagedIntervalStopOptions,
} from '../managedInterval'

type PerformanceMetadata = Record<string, unknown>

export interface PerformanceMetric {
  /**
   * Metric name
   */
  name: string

  /**
   * Duration in milliseconds
   */
  duration: number

  /**
   * Start timestamp
   */
  startTime: number

  /**
   * End timestamp
   */
  endTime: number

  /**
   * Metric category
   */
  category: 'ui' | 'api' | 'calculation' | 'render' | 'load'

  /**
   * Additional metadata
   */
  metadata?: PerformanceMetadata
}

export interface PerformanceThresholds {
  /**
   * UI feedback threshold (default: 16ms for 60fps)
   */
  uiFeedback: number

  /**
   * API call threshold (default: 2000ms)
   */
  apiCall: number

  /**
   * Calculation threshold (default: 2000ms)
   */
  calculation: number

  /**
   * Page load threshold (default: 1000ms)
   */
  pageLoad: number

  /**
   * Render threshold (default: 100ms)
   */
  render: number
}

const DEFAULT_THRESHOLDS: PerformanceThresholds = {
  uiFeedback: 16,
  apiCall: 2000,
  calculation: 2000,
  pageLoad: 1000,
  render: 100,
}
const PERFORMANCE_SUMMARY_INTERVAL_MS = 5 * 60 * 1000

/**
 * Performance Monitor
 * Tracks and validates performance metrics
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = []
  private thresholds: PerformanceThresholds
  private maxMetrics = 1000 // Keep last 1000 metrics

  constructor(thresholds: Partial<PerformanceThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds }
  }

  /**
   * Track an async operation
   * Automatically validates against thresholds
   *
   * Usage:
   * ```ts
   * const duration = await performanceMonitor.trackAsync('loadSession', async () => {
   *   return await sessionService.getSession(reportId)
   * })
   * ```
   */
  async trackAsync<T>(
    name: string,
    fn: () => Promise<T>,
    category: PerformanceMetric['category'] = 'api',
    metadata?: PerformanceMetadata
  ): Promise<T> {
    const startTime = performance.now()

    try {
      const result = await fn()
      const endTime = performance.now()
      const duration = endTime - startTime

      this.addMetric({
        name,
        duration,
        startTime,
        endTime,
        category,
        metadata,
      })

      return result
    } catch (error) {
      const endTime = performance.now()
      const duration = endTime - startTime

      this.addMetric({
        name: `${name}_error`,
        duration,
        startTime,
        endTime,
        category,
        metadata: {
          ...metadata,
          error: error instanceof Error ? error.message : String(error),
        },
      })

      throw error
    }
  }

  /**
   * Compatibility wrapper for legacy callers that pass an optional threshold
   * before metadata. The canonical monitor owns recording and threshold logging.
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    thresholdOrMetadata?: number | PerformanceMetadata,
    metadata?: PerformanceMetadata
  ): Promise<T> {
    const actualMetadata = typeof thresholdOrMetadata === 'object' ? thresholdOrMetadata : metadata

    return this.trackAsync(name, fn, 'api', actualMetadata)
  }

  /**
   * Track a synchronous operation
   *
   * Usage:
   * ```ts
   * const result = performanceMonitor.trackSync('renderComponent', () => {
   *   return expensiveRenderLogic()
   * })
   * ```
   */
  trackSync<T>(
    name: string,
    fn: () => T,
    category: PerformanceMetric['category'] = 'render',
    metadata?: PerformanceMetadata
  ): T {
    const startTime = performance.now()

    try {
      const result = fn()
      const endTime = performance.now()
      const duration = endTime - startTime

      this.addMetric({
        name,
        duration,
        startTime,
        endTime,
        category,
        metadata,
      })

      return result
    } catch (error) {
      const endTime = performance.now()
      const duration = endTime - startTime

      this.addMetric({
        name: `${name}_error`,
        duration,
        startTime,
        endTime,
        category,
        metadata: {
          ...metadata,
          error: error instanceof Error ? error.message : String(error),
        },
      })

      throw error
    }
  }

  /**
   * Track UI feedback time
   * Ensures < 16ms for 60fps
   */
  trackUIFeedback(action: string, feedbackDelay: number, metadata?: PerformanceMetadata): void {
    this.addMetric({
      name: `ui_feedback_${action}`,
      duration: feedbackDelay,
      startTime: performance.now() - feedbackDelay,
      endTime: performance.now(),
      category: 'ui',
      metadata,
    })

    if (feedbackDelay > this.thresholds.uiFeedback) {
      generalLogger.error('[PerformanceMonitor] UI feedback too slow!', {
        action,
        feedbackDelay_ms: feedbackDelay,
        threshold_ms: this.thresholds.uiFeedback,
        exceeded_by_ms: feedbackDelay - this.thresholds.uiFeedback,
      })
    }
  }

  /**
   * Add metric manually
   */
  addMetric(metric: PerformanceMetric): void {
    this.metrics.push(metric)

    // Keep only last N metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift()
    }

    // Validate against thresholds
    this.validateMetric(metric)

    // Log slow operations
    if (this.isSlowOperation(metric)) {
      generalLogger.warn('[PerformanceMonitor] Slow operation detected', {
        name: metric.name,
        duration_ms: Math.round(metric.duration),
        category: metric.category,
        threshold_ms: this.getThreshold(metric.category),
        metadata: metric.metadata,
      })
    }
  }

  /**
   * Validate metric against thresholds
   */
  private validateMetric(metric: PerformanceMetric): void {
    const threshold = this.getThreshold(metric.category)

    if (metric.duration > threshold) {
      generalLogger.debug('[PerformanceMonitor] Threshold exceeded', {
        name: metric.name,
        duration_ms: Math.round(metric.duration),
        threshold_ms: threshold,
        exceeded_by_ms: Math.round(metric.duration - threshold),
      })
    }
  }

  /**
   * Check if operation is slow
   */
  private isSlowOperation(metric: PerformanceMetric): boolean {
    const threshold = this.getThreshold(metric.category)
    return metric.duration > threshold
  }

  /**
   * Get threshold for category
   */
  private getThreshold(category: PerformanceMetric['category']): number {
    switch (category) {
      case 'ui':
        return this.thresholds.uiFeedback
      case 'api':
        return this.thresholds.apiCall
      case 'calculation':
        return this.thresholds.calculation
      case 'load':
        return this.thresholds.pageLoad
      case 'render':
        return this.thresholds.render
      default:
        return 1000
    }
  }

  /**
   * Get all metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics]
  }

  /**
   * Get metrics by category
   */
  getMetricsByCategory(category: PerformanceMetric['category']): PerformanceMetric[] {
    return this.metrics.filter((m) => m.category === category)
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter((m) => m.name === name)
  }

  /**
   * Get statistics for a metric name
   */
  getStats(name: string): {
    count: number
    min: number
    max: number
    avg: number
    median: number
    p95: number
    p99: number
  } | null {
    const metrics = this.getMetricsByName(name)

    if (metrics.length === 0) {
      return null
    }

    const durations = metrics.map((m) => m.duration).sort((a, b) => a - b)

    const sum = durations.reduce((acc, d) => acc + d, 0)
    const avg = sum / durations.length

    return {
      count: durations.length,
      min: durations[0],
      max: durations[durations.length - 1],
      avg,
      median: durations[Math.floor(durations.length / 2)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)],
    }
  }

  /**
   * Get overall statistics by category
   */
  getCategoryStats(category: PerformanceMetric['category']): {
    count: number
    avgDuration: number
    slowCount: number
    slowPercentage: number
  } {
    const metrics = this.getMetricsByCategory(category)
    const threshold = this.getThreshold(category)

    const slowMetrics = metrics.filter((m) => m.duration > threshold)
    const avgDuration =
      metrics.length > 0 ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length : 0

    return {
      count: metrics.length,
      avgDuration: Math.round(avgDuration),
      slowCount: slowMetrics.length,
      slowPercentage:
        metrics.length > 0 ? Math.round((slowMetrics.length / metrics.length) * 100) : 0,
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = []
    generalLogger.info('[PerformanceMonitor] Metrics cleared')
  }

  /**
   * Export metrics for analysis
   */
  export(): PerformanceMetric[] {
    return this.getMetrics()
  }

  /**
   * Get summary report
   */
  getSummary(): {
    totalMetrics: number
    categories: Record<
      PerformanceMetric['category'],
      ReturnType<PerformanceMonitor['getCategoryStats']>
    >
    thresholds: PerformanceThresholds
  } {
    const categories = {} as Record<
      PerformanceMetric['category'],
      ReturnType<PerformanceMonitor['getCategoryStats']>
    >

    const allCategories: PerformanceMetric['category'][] = [
      'ui',
      'api',
      'calculation',
      'load',
      'render',
    ]

    allCategories.forEach((category) => {
      categories[category] = this.getCategoryStats(category)
    })

    return {
      totalMetrics: this.metrics.length,
      categories,
      thresholds: this.thresholds,
    }
  }
}

// Export singleton instance
export const performanceMonitor = new PerformanceMonitor()
export const globalPerformanceMonitor = performanceMonitor

export const performanceThresholds = {
  slow: 1000,
  warning: 500,
  fast: 100,
  sessionCreate: 3000,
  sessionLoad: 2000,
  sessionSave: 1000,
  apiCall: 5000,
}

function logPerformanceSummary(): void {
  const summary = performanceMonitor.getSummary()

  if (summary.totalMetrics > 0) {
    generalLogger.info('[PerformanceMonitor] Performance summary', summary)
  }
}

const performanceSummaryInterval = createManagedInterval(
  logPerformanceSummary,
  PERFORMANCE_SUMMARY_INTERVAL_MS
)

export function startPerformanceSummaryLogging(options?: ManagedIntervalStartOptions): void {
  performanceSummaryInterval.start(options)
}

export function stopPerformanceSummaryLogging(options?: ManagedIntervalStopOptions): void {
  performanceSummaryInterval.stop(options)
}

// Auto-log summary every 5 minutes in development
if (process.env.NODE_ENV === 'development' && typeof window !== 'undefined') {
  startPerformanceSummaryLogging()
}
