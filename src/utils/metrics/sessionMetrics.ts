/**
 * Session Metrics Collection
 *
 * Single Responsibility: Collect and aggregate session-related metrics.
 * Provides insights for monitoring, debugging, and optimization.
 *
 * Framework requirement: Lines 1453-1468 (Performance Monitoring)
 *
 * @module utils/metrics/sessionMetrics
 */

import { storeLogger } from '../logger'
import {
  createManagedInterval,
  type ManagedIntervalStartOptions,
  type ManagedIntervalStopOptions,
} from '../managedInterval'

const SESSION_METRICS_SUMMARY_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

export interface SessionMetrics {
  // Operation counts
  sessionCreations: number
  sessionLoads: number
  viewSwitches: number
  restorations: number

  // Success/failure rates
  successfulOperations: number
  failedOperations: number

  // Error counts by type
  conflictErrors: number
  networkErrors: number
  rateLimitErrors: number
  validationErrors: number

  // Performance metrics
  avgCreationTime_ms: number
  avgRestorationTime_ms: number
  avgSwitchTime_ms: number

  // Retry metrics
  totalRetries: number
  retriesSucceeded: number
  retriesFailed: number

  // Circuit breaker metrics
  circuitOpenCount: number
  circuitHalfOpenCount: number
  fastFailCount: number

  // Deduplication metrics
  deduplicatedRequests: number
  deduplicationRate: number
}

/**
 * Session Metrics Collector
 *
 * Collects metrics for session operations.
 * Provides aggregated statistics and trends.
 */
export class SessionMetricsCollector {
  private metrics: {
    operations: Array<{
      type: 'create' | 'load' | 'switch' | 'restore'
      success: boolean
      duration_ms: number
      retries: number
      timestamp: Date
      error?: string
    }>
    errors: Map<string, number>
    circuitEvents: Array<{
      event: 'open' | 'half-open' | 'closed' | 'fast-fail'
      timestamp: Date
    }>
  } = {
    operations: [],
    errors: new Map(),
    circuitEvents: [],
  }

  /**
   * Record session operation
   */
  recordOperation(
    type: 'create' | 'load' | 'switch' | 'restore',
    success: boolean,
    duration_ms: number,
    retries: number = 0,
    error?: string
  ): void {
    this.metrics.operations.push({
      type,
      success,
      duration_ms,
      retries,
      timestamp: new Date(),
      error,
    })

    // Track errors
    if (error) {
      const count = this.metrics.errors.get(error) || 0
      this.metrics.errors.set(error, count + 1)
    }

    // Log slow operations
    if (duration_ms > 2000) {
      storeLogger.warn('Slow session operation detected', {
        type,
        duration_ms: duration_ms.toFixed(2),
        success,
        retries,
      })
    }
  }

  /**
   * Record circuit breaker event
   */
  recordCircuitEvent(event: 'open' | 'half-open' | 'closed' | 'fast-fail'): void {
    this.metrics.circuitEvents.push({
      event,
      timestamp: new Date(),
    })
  }

  /**
   * Get aggregated metrics
   */
  getMetrics(): SessionMetrics {
    const ops = this.metrics.operations

    const creations = ops.filter((o) => o.type === 'create')
    const loads = ops.filter((o) => o.type === 'load')
    const switches = ops.filter((o) => o.type === 'switch')
    const restorations = ops.filter((o) => o.type === 'restore')

    const successful = ops.filter((o) => o.success)
    const failed = ops.filter((o) => !o.success)

    const totalRetries = ops.reduce((sum, o) => sum + o.retries, 0)
    const retriesSucceeded = ops.filter((o) => o.success && o.retries > 0).length
    const retriesFailed = ops.filter((o) => !o.success && o.retries > 0).length

    const avgCreationTime = this.calculateAvgDuration(creations)
    const avgRestorationTime = this.calculateAvgDuration(restorations)
    const avgSwitchTime = this.calculateAvgDuration(switches)

    const circuitOpenCount = this.metrics.circuitEvents.filter((e) => e.event === 'open').length
    const circuitHalfOpenCount = this.metrics.circuitEvents.filter(
      (e) => e.event === 'half-open'
    ).length
    const fastFailCount = this.metrics.circuitEvents.filter((e) => e.event === 'fast-fail').length

    // Error breakdown
    const conflictErrors = Array.from(this.metrics.errors.entries())
      .filter(([error]) => error.includes('409') || error.includes('conflict'))
      .reduce((sum, [, count]) => sum + count, 0)

    const networkErrors = Array.from(this.metrics.errors.entries())
      .filter(([error]) => error.includes('network') || error.includes('Network'))
      .reduce((sum, [, count]) => sum + count, 0)

    const rateLimitErrors = Array.from(this.metrics.errors.entries())
      .filter(([error]) => error.includes('429') || error.includes('rate limit'))
      .reduce((sum, [, count]) => sum + count, 0)

    const validationErrors = Array.from(this.metrics.errors.entries())
      .filter(([error]) => error.includes('validation') || error.includes('Validation'))
      .reduce((sum, [, count]) => sum + count, 0)

    // Calculate deduplication rate (estimate from retries)
    const deduplicatedRequests = ops.filter((o) => o.retries === 0 && o.success).length
    const deduplicationRate = ops.length > 0 ? deduplicatedRequests / ops.length : 0

    return {
      sessionCreations: creations.length,
      sessionLoads: loads.length,
      viewSwitches: switches.length,
      restorations: restorations.length,

      successfulOperations: successful.length,
      failedOperations: failed.length,

      conflictErrors,
      networkErrors,
      rateLimitErrors,
      validationErrors,

      avgCreationTime_ms: avgCreationTime,
      avgRestorationTime_ms: avgRestorationTime,
      avgSwitchTime_ms: avgSwitchTime,

      totalRetries,
      retriesSucceeded,
      retriesFailed,

      circuitOpenCount,
      circuitHalfOpenCount,
      fastFailCount,

      deduplicatedRequests,
      deduplicationRate,
    }
  }

  /**
   * Calculate average duration for operations
   */
  private calculateAvgDuration(operations: Array<{ duration_ms: number }>): number {
    if (operations.length === 0) return 0

    const sum = operations.reduce((acc, o) => acc + o.duration_ms, 0)
    return sum / operations.length
  }

  /**
   * Get metrics summary (human-readable)
   */
  getSummary(): string {
    const metrics = this.getMetrics()

    const successRate =
      metrics.successfulOperations + metrics.failedOperations > 0
        ? (
            (metrics.successfulOperations /
              (metrics.successfulOperations + metrics.failedOperations)) *
            100
          ).toFixed(1)
        : '0'

    return `
Session Metrics Summary
-----------------------
Operations:
  - Creates: ${metrics.sessionCreations}
  - Loads: ${metrics.sessionLoads}
  - View Switches: ${metrics.viewSwitches}
  - Restorations: ${metrics.restorations}
  
Success Rate: ${successRate}% (${metrics.successfulOperations}/${metrics.successfulOperations + metrics.failedOperations})

Performance (avg):
  - Creation: ${metrics.avgCreationTime_ms.toFixed(0)}ms
  - Restoration: ${metrics.avgRestorationTime_ms.toFixed(0)}ms
  - View Switch: ${metrics.avgSwitchTime_ms.toFixed(0)}ms

Errors:
  - 409 Conflicts: ${metrics.conflictErrors}
  - Network: ${metrics.networkErrors}
  - Rate Limit: ${metrics.rateLimitErrors}
  - Validation: ${metrics.validationErrors}

Retries:
  - Total: ${metrics.totalRetries}
  - Succeeded: ${metrics.retriesSucceeded}
  - Failed: ${metrics.retriesFailed}

Circuit Breaker:
  - Opens: ${metrics.circuitOpenCount}
  - Half-Opens: ${metrics.circuitHalfOpenCount}
  - Fast Fails: ${metrics.fastFailCount}

Deduplication Rate: ${(metrics.deduplicationRate * 100).toFixed(1)}%
    `.trim()
  }

  /**
   * Export metrics for external monitoring
   */
  export(): Record<string, unknown> {
    return {
      metrics: this.getMetrics(),
      operations: this.metrics.operations.slice(-100), // Last 100
      errors: Object.fromEntries(this.metrics.errors),
      circuitEvents: this.metrics.circuitEvents.slice(-50), // Last 50
      exportedAt: new Date().toISOString(),
    }
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = {
      operations: [],
      errors: new Map(),
      circuitEvents: [],
    }
    storeLogger.info('Session metrics cleared')
  }

  /**
   * Log current metrics summary
   */
  logSummary(): void {
    storeLogger.info('Session metrics summary', {
      summary: this.getSummary(),
      detailed: this.getMetrics(),
    })
  }
}

// Global metrics collector
export const globalSessionMetrics = new SessionMetricsCollector()

function logGlobalSessionMetricsSummary(): void {
  globalSessionMetrics.logSummary()
}

const sessionMetricsSummaryInterval = createManagedInterval(
  logGlobalSessionMetricsSummary,
  SESSION_METRICS_SUMMARY_INTERVAL_MS
)

export function startSessionMetricsSummaryLogging(options?: ManagedIntervalStartOptions): void {
  sessionMetricsSummaryInterval.start(options)
}

export function stopSessionMetricsSummaryLogging(options?: ManagedIntervalStopOptions): void {
  sessionMetricsSummaryInterval.stop(options)
}

// Auto-log summary every 5 minutes in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  startSessionMetricsSummaryLogging()
}
