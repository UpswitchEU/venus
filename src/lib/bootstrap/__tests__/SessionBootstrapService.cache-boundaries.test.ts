/**
 * SessionBootstrapService cache boundaries Tests
 *
 * Covers result-cache scoping, report identity boundaries, and draft-downgrade rejection.
 *
 * @module lib/bootstrap/__tests__/SessionBootstrapService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BootstrapContext, SessionBootstrapState } from './SessionBootstrapService.testHarness'
import {
  mockAuthResolver,
  mockPrefillResolver,
  mockSessionResolver,
  resetSessionBootstrapHarness,
  restoreSessionBootstrapHarness,
} from './SessionBootstrapService.testHarness'

let service: SessionBootstrapService

beforeEach(() => {
  service = resetSessionBootstrapHarness()
})

afterEach(restoreSessionBootstrapHarness)

describe('SessionBootstrapService cache boundaries', () => {
  it('scopes cached results to the requested report id', async () => {
    const context: BootstrapContext = {
      reportId: 'val_cache_a',
      locale: 'en',
    }
    const otherContext: BootstrapContext = {
      ...context,
      reportId: 'val_cache_b',
    }

    mockAuthResolver.resolve.mockResolvedValue({
      data: { type: 'authenticated', userId: 'user-cache' },
    })
    mockSessionResolver.resolve.mockResolvedValue({
      data: {
        mode: 'existing',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'active',
      },
    })
    mockPrefillResolver.resolve.mockResolvedValue({
      data: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
    })

    const result = await service.bootstrap(context)

    expect(result.report.reportId).toBe('val_cache_a')
    expect(service.getCachedResult(context)?.report.reportId).toBe('val_cache_a')
    expect(service.getCachedResult(otherContext)).toBeNull()
  })

  it('scopes cached results to the full new-report context', async () => {
    const alphaContext: BootstrapContext = {
      locale: 'nl',
      flow: 'manual',
      prefilledQuery: 'Alpha BV',
      sourceApp: 'mercury',
      clientId: 'client-a',
    }
    const betaContext: BootstrapContext = {
      ...alphaContext,
      prefilledQuery: 'Beta BV',
    }

    mockAuthResolver.resolve.mockResolvedValue({
      data: { type: 'authenticated', userId: 'user-new-cache' },
    })
    mockSessionResolver.resolve.mockImplementation((ctx: BootstrapContext) =>
      Promise.resolve({
        data: {
          mode: 'new',
          reportId: ctx.prefilledQuery === 'Beta BV' ? 'val_new_beta' : 'val_new_alpha',
          hasExistingData: false,
          status: 'draft',
        },
      })
    )
    mockPrefillResolver.resolve.mockResolvedValue({
      data: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
    })

    const alphaResult = await service.bootstrap(alphaContext)

    expect(alphaResult.report.reportId).toBe('val_new_alpha')
    expect(service.getCachedResult(alphaContext)?.report.reportId).toBe('val_new_alpha')
    expect(service.getCachedResult(betaContext)).toBeNull()

    const betaResult = await service.bootstrap(betaContext)

    expect(betaResult.report.reportId).toBe('val_new_beta')
    expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(2)
  })

  it('does not deduplicate parallel new-report requests with different context', async () => {
    const alphaContext: BootstrapContext = {
      locale: 'nl',
      flow: 'manual',
      prefilledQuery: 'Alpha BV',
    }
    const betaContext: BootstrapContext = {
      ...alphaContext,
      prefilledQuery: 'Beta BV',
    }

    mockAuthResolver.resolve.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () => resolve({ data: { type: 'authenticated', userId: 'user-parallel-new' } }),
            25
          )
        )
    )
    mockSessionResolver.resolve.mockImplementation((ctx: BootstrapContext) =>
      Promise.resolve({
        data: {
          mode: 'new',
          reportId: ctx.prefilledQuery === 'Beta BV' ? 'val_parallel_beta' : 'val_parallel_alpha',
          hasExistingData: false,
          status: 'draft',
        },
      })
    )
    mockPrefillResolver.resolve.mockResolvedValue({
      data: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
    })

    const [alphaResult, betaResult] = await Promise.all([
      service.bootstrap(alphaContext),
      service.bootstrap(betaContext),
    ])

    expect(alphaResult.report.reportId).toBe('val_parallel_alpha')
    expect(betaResult.report.reportId).toBe('val_parallel_beta')
    expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(2)
  })

  it('does not return another report from the circuit breaker fallback', async () => {
    const context: BootstrapContext = {
      reportId: 'val_breaker_a',
      locale: 'en',
    }
    const otherContext: BootstrapContext = {
      ...context,
      reportId: 'val_breaker_b',
    }

    mockAuthResolver.resolve.mockResolvedValue({
      data: { type: 'authenticated', userId: 'user-breaker' },
    })
    mockSessionResolver.resolve.mockResolvedValue({
      data: {
        mode: 'existing',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'active',
      },
    })
    mockPrefillResolver.resolve.mockResolvedValue({
      data: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
    })

    await service.bootstrap(context)
    ;(service as unknown as { callTimestamps: number[] }).callTimestamps = Array.from(
      { length: 4 },
      () => Date.now()
    )

    await expect(
      service.bootstrap({
        reportId: 'val_breaker_b',
        locale: 'en',
      })
    ).rejects.toThrow('Circuit breaker')

    expect(service.getCachedResult(context)?.report.reportId).toBe('val_breaker_a')
    expect(service.getCachedResult(otherContext)).toBeNull()
  })

  it('rejects Titan bootstrap responses that downgrade an existing UUID to a new draft', () => {
    expect(() =>
      (
        service as unknown as {
          assertExistingReportWasNotDowngraded: (
            context: BootstrapContext,
            state: SessionBootstrapState,
            traceId: string
          ) => void
        }
      ).assertExistingReportWasNotDowngraded(
        {
          url: '/nl/reports/46e05c0c-6f40-4527-82cb-4560d6eee0ad',
          reportId: '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
          locale: 'nl',
          sourceApp: 'mercury',
        },
        {
          identity: { type: 'authenticated', userId: 'user-1' },
          report: {
            mode: 'new',
            reportId: '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
            hasExistingData: false,
            status: 'draft',
          },
          prefillData: {
            sources: [],
            confidence: 0,
            fieldsPopulated: [],
            fieldsRemaining: [],
          },
          ui: {
            showWelcomeBack: false,
            resumableSession: false,
            suggestedFlow: 'manual',
            prefilledFieldCount: 0,
            totalFieldCount: 0,
            showKboVerification: false,
            showAccountantBanner: false,
          },
          bootstrapVersion: '2.0.0',
          bootstrappedAt: new Date(),
          bootstrapDurationMs: 0,
        },
        'trace-uuid-downgrade'
      )
    ).toThrow('was expected to exist')
  })
})
