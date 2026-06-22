/**
 * SessionBootstrapService delegated safeguards Tests
 *
 * Covers duration tracking, resolver failure behavior, delegated cache bypass, and client-context aborts.
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

describe('SessionBootstrapService delegated safeguards', () => {
  it('should track bootstrap duration', async () => {
    const context: BootstrapContext = {
      locale: 'en',
    }

    mockAuthResolver.resolve.mockResolvedValue({
      data: { type: 'authenticated', userId: 'user-timing' },
    })
    mockSessionResolver.resolve.mockResolvedValue({
      data: {
        mode: 'new',
        reportId: 'val_timing_123',
        hasExistingData: false,
        status: 'draft',
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

    expect(result.bootstrapDurationMs).toBeGreaterThanOrEqual(0)
    expect(result.bootstrappedAt).toBeInstanceOf(Date)
  })

  it('should gracefully handle resolver failures', async () => {
    const context: BootstrapContext = {
      locale: 'en',
    }

    mockAuthResolver.resolve.mockRejectedValue(new Error('Auth failed'))
    mockSessionResolver.resolve.mockResolvedValue({
      data: {
        mode: 'new',
        reportId: 'val_fallback_123',
        hasExistingData: false,
        status: 'draft',
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

    // Should not throw, but return fallback state
    const result = await service.bootstrap(context)

    // Fallback state should still be valid
    expect(result.identity).toBeDefined()
    expect(result.report).toBeDefined()
    expect(result.prefillData).toBeDefined()
  })

  it('bypasses Titan result cache when delegated gate is unresolved', async () => {
    const context: BootstrapContext = {
      reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
      sourceApp: 'mercury',
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mercuryPersonaMode: 'accountant',
      locale: 'nl',
    }

    const cachedState: SessionBootstrapState = {
      identity: {
        type: 'authenticated',
        userId: 'user-1',
      },
      report: {
        mode: 'existing',
        reportId: context.reportId ?? 'report-1',
        hasExistingData: true,
        status: 'active',
      },
      prefillData: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
      ui: {
        suggestedFlow: 'manual',
        showWelcomeBack: false,
      },
    }

    const executeTitan = vi.fn().mockResolvedValue(cachedState)
    ;(
      service as unknown as {
        _executeBootstrapViaTitan: typeof executeTitan
      }
    )._executeBootstrapViaTitan = executeTitan

    const { useClientContext } = await import('../../../stores/clientContext')
    const matchingRelationshipId = 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd'
    const getStateSpy = vi.spyOn(useClientContext, 'getState')

    getStateSpy.mockReturnValue({
      isActingAsClient: true,
      accountant: { id: 'acc-1', email: 'acc@firm.be' },
      relationshipId: matchingRelationshipId,
      contextGateResolved: true,
      getContextHeaders: () => ({}),
    } as ReturnType<typeof useClientContext.getState>)

    await service.bootstrapViaTitan(context)
    expect(executeTitan).toHaveBeenCalledTimes(1)
    expect(service.hasCompletedFor(context)).toBe(true)

    executeTitan.mockClear()
    getStateSpy.mockReturnValue({
      isActingAsClient: true,
      accountant: { id: 'acc-1', email: 'acc@firm.be' },
      relationshipId: matchingRelationshipId,
      contextGateResolved: false,
      getContextHeaders: () => ({}),
    } as ReturnType<typeof useClientContext.getState>)

    await service.bootstrapViaTitan(context)
    expect(executeTitan).toHaveBeenCalledTimes(1)
  })

  it('aborts Titan bootstrap when stored relationshipId mismatches URL clientId', async () => {
    vi.useFakeTimers()

    const context: BootstrapContext = {
      reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
      sourceApp: 'mercury',
      clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
      mercuryPersonaMode: 'accountant',
      locale: 'nl',
    }

    const { useAuthStore } = await import('../../auth')
    const { useClientContext } = await import('../../../stores/clientContext')

    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      loading: false,
      isInitializing: false,
      isRefreshing: false,
      user: { id: 'user-1', role: 'accountant' },
      error: 'Failed to fetch client context',
    } as ReturnType<typeof useAuthStore.getState>)

    vi.spyOn(useClientContext, 'getState').mockReturnValue({
      isActingAsClient: true,
      accountant: { id: 'acc-1', email: 'acc@firm.be' },
      relationshipId: 'stale-client-id',
      contextGateResolved: false,
      getContextHeaders: () => ({}),
    } as ReturnType<typeof useClientContext.getState>)

    const expectation = expect(service.bootstrapViaTitan(context)).rejects.toThrow(
      'Failed to fetch client context'
    )
    await vi.runAllTimersAsync()
    await expectation

    vi.useRealTimers()
  })
})
