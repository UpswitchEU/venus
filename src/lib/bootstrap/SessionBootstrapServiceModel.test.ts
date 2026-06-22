import { describe, expect, it } from 'vitest'
import { getBootstrapContextCacheKey } from './contextCacheKey'
import {
  buildBootstrapCircuitBreakerMessage,
  buildTitanBootstrapCacheKey,
  buildTitanBootstrapFailureError,
  getScopedBootstrapCachedResult,
  getTitanBootstrapFailureDiagnostic,
  hasCompletedBootstrapFor,
  pruneBootstrapCallTimestamps,
  shouldTripBootstrapCircuitBreaker,
} from './SessionBootstrapServiceModel'
import type { BootstrapContext, SessionBootstrapState } from './types'

function bootstrapState(reportId: string): SessionBootstrapState {
  return {
    identity: { type: 'authenticated', userId: 'user-1' },
    prefillData: {
      confidence: 0,
      fieldsPopulated: [],
      fieldsRemaining: [],
      sources: [],
    },
    report: {
      hasExistingData: true,
      mode: 'existing',
      reportId,
      status: 'active',
    },
    ui: {
      currentStep: 1,
      showAccountantBanner: false,
      showOnboarding: false,
      showWelcomeBack: true,
      suggestedFlow: 'manual',
    },
  }
}

describe('SessionBootstrapServiceModel', () => {
  it('keeps only calls inside the sliding breaker window', () => {
    expect(pruneBootstrapCallTimestamps([100, 901, 1100], 1200, 300)).toEqual([901, 1100])
  })

  it('trips the circuit breaker at the configured threshold', () => {
    expect(shouldTripBootstrapCircuitBreaker([1, 2, 3], 4)).toBe(false)
    expect(shouldTripBootstrapCircuitBreaker([1, 2, 3, 4], 4)).toBe(true)
  })

  it('builds the stable Titan in-flight cache namespace and breaker message', () => {
    expect(buildTitanBootstrapCacheKey('report:val_123')).toBe('titan:report:val_123')
    expect(buildBootstrapCircuitBreakerMessage(4, 30_000)).toBe(
      '[Bootstrap] Circuit breaker: 4 calls in 30s window — refusing further calls'
    )
  })

  it('returns a fresh cached result only when the requested scope matches', () => {
    const context: BootstrapContext = {
      locale: 'nl',
      reportId: 'val_cached_a',
      sourceApp: 'mercury',
    }
    const otherContext: BootstrapContext = {
      ...context,
      reportId: 'val_cached_b',
    }
    const snapshot = {
      lastSuccessfulAt: 1000,
      lastSuccessfulCacheKey: getBootstrapContextCacheKey(context),
      lastSuccessfulResult: bootstrapState('val_cached_a'),
      now: 1500,
      ttlMs: 10_000,
    }

    expect(
      getScopedBootstrapCachedResult({
        ...snapshot,
        contextOrReportId: context,
        scopeProvided: true,
      })?.report.reportId
    ).toBe('val_cached_a')
    expect(
      getScopedBootstrapCachedResult({
        ...snapshot,
        contextOrReportId: otherContext,
        scopeProvided: true,
      })
    ).toBeNull()
    expect(
      getScopedBootstrapCachedResult({
        ...snapshot,
        scopeProvided: false,
      })?.report.reportId
    ).toBe('val_cached_a')
  })

  it('rejects stale cache entries and missing cache payloads', () => {
    const context: BootstrapContext = { reportId: 'val_stale', locale: 'en' }
    const cacheKey = getBootstrapContextCacheKey(context)

    expect(
      hasCompletedBootstrapFor({
        contextOrReportId: context,
        lastSuccessfulAt: 1000,
        lastSuccessfulCacheKey: cacheKey,
        lastSuccessfulResult: bootstrapState('val_stale'),
        now: 11_001,
        scopeProvided: true,
        ttlMs: 10_000,
      })
    ).toBe(false)
    expect(
      hasCompletedBootstrapFor({
        contextOrReportId: context,
        lastSuccessfulAt: 1000,
        lastSuccessfulCacheKey: cacheKey,
        lastSuccessfulResult: null,
        now: 1500,
        scopeProvided: true,
        ttlMs: 10_000,
      })
    ).toBe(false)
  })

  it('builds rich retryable Titan bootstrap errors from structured failures', () => {
    const data = {
      success: false,
      errorInfo: {
        code: 'UPSTREAM_TIMEOUT',
        message: 'Titan bootstrap timed out',
        retryable: true,
      },
    }

    expect(getTitanBootstrapFailureDiagnostic(data)).toEqual({
      code: 'UPSTREAM_TIMEOUT',
      message: 'Titan bootstrap timed out',
      retryable: true,
    })

    const error = buildTitanBootstrapFailureError(data)

    expect(error.message).toBe('[UPSTREAM_TIMEOUT] Titan bootstrap timed out (retryable)')
    expect(error.code).toBe('UPSTREAM_TIMEOUT')
    expect(error.retryable).toBe(true)
  })

  it('builds rich non-retryable Titan bootstrap errors from structured failures', () => {
    const error = buildTitanBootstrapFailureError({
      success: false,
      errorInfo: {
        code: 'REPORT_NOT_FOUND',
        message: 'Report is gone',
        retryable: false,
      },
    })

    expect(error.message).toBe('[REPORT_NOT_FOUND] Report is gone')
    expect(error.code).toBe('REPORT_NOT_FOUND')
    expect(error.retryable).toBe(false)
  })

  it('preserves legacy unstructured bootstrap error payloads with UNKNOWN metadata', () => {
    expect(getTitanBootstrapFailureDiagnostic({ error: 'Plain failure' })).toBeNull()

    const error = buildTitanBootstrapFailureError({
      success: false,
      error: 'Plain failure',
    })

    expect(error.message).toBe('Plain failure')
    expect(error.code).toBe('UNKNOWN')
    expect(error.retryable).toBe(false)
  })

  it('falls back when Titan returns an unsuccessful payload without details', () => {
    const error = buildTitanBootstrapFailureError({ success: false })

    expect(error.message).toBe('Bootstrap returned no data')
    expect(error.code).toBe('UNKNOWN')
    expect(error.retryable).toBe(false)
  })
})
