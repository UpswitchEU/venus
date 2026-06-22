import { afterEach, describe, expect, it, vi } from 'vitest'
import { CLIENT_CONTEXT_HEADERS } from '../../constants/headers'
import {
  readTitanBootstrapClientContextSnapshot,
  resolveTitanBootstrapDelegationState,
  waitForTitanBootstrapDelegatedReadiness,
} from './TitanBootstrapDelegation'
import type { BootstrapContext, BootstrapHints } from './types'

function makeLogger() {
  return {
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }
}

const delegatedContext: BootstrapContext = {
  reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
  sourceApp: 'mercury',
  clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
  mercuryPersonaMode: 'accountant',
  locale: 'nl',
}

const delegatedHints: BootstrapHints = {
  hasClientToken: false,
  hasPrefilledQuery: false,
  hasReportId: true,
  isEmbedded: false,
  isNewReport: false,
  locale: 'nl',
  requestedFlow: null,
  requestedMode: null,
}

describe('TitanBootstrapDelegation', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('detects Mercury accountant handoffs that must wait for delegated context', () => {
    expect(resolveTitanBootstrapDelegationState(delegatedContext, delegatedHints)).toEqual({
      delegatedHandoff: true,
      needsClientContext: true,
    })
  })

  it('returns readiness and a delegated header snapshot when auth and client context match', async () => {
    const logger = makeLogger()
    const { useAuthStore } = await import('../auth')
    const { useClientContext } = await import('../../stores/clientContext')

    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      error: null,
      isInitializing: false,
      isRefreshing: false,
      loading: false,
      user: { id: 'accountant-1', role: 'accountant' },
    } as ReturnType<typeof useAuthStore.getState>)

    vi.spyOn(useClientContext, 'getState').mockReturnValue({
      accountant: { email: 'advisor@example.com', id: 'accountant-1' },
      contextGateResolved: true,
      getContextHeaders: () => ({
        [CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]: 'accountant-1',
        [CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID]: delegatedContext.clientId ?? '',
      }),
      isActingAsClient: true,
      relationshipId: delegatedContext.clientId ?? null,
    } as ReturnType<typeof useClientContext.getState>)

    const readiness = await waitForTitanBootstrapDelegatedReadiness({
      context: delegatedContext,
      hints: delegatedHints,
      logger,
      traceId: 'trace-ready',
    })
    const snapshot = await readTitanBootstrapClientContextSnapshot(logger)

    expect(readiness).toMatchObject({
      authReady: true,
      delegatedHandoff: true,
      needsClientContext: true,
    })
    expect(snapshot?.relationshipId).toBe(delegatedContext.clientId)
    expect(snapshot?.contextHeaders[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID]).toBe('accountant-1')
    expect(logger.info).toHaveBeenCalledWith(
      '[Bootstrap:trace-ready] Mercury delegated flow — waiting for client context',
      expect.objectContaining({ delegatedHandoff: true, hasClientId: true })
    )
  })

  it('aborts before Titan when delegated context is not ready before the auth wait budget', async () => {
    vi.useFakeTimers()
    const logger = makeLogger()
    const { useAuthStore } = await import('../auth')
    const { useClientContext } = await import('../../stores/clientContext')

    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      error: 'Failed to fetch client context',
      isInitializing: false,
      isRefreshing: false,
      loading: false,
      user: { id: 'accountant-1', role: 'accountant' },
    } as ReturnType<typeof useAuthStore.getState>)

    vi.spyOn(useClientContext, 'getState').mockReturnValue({
      accountant: { email: 'advisor@example.com', id: 'accountant-1' },
      contextGateResolved: false,
      getContextHeaders: () => ({}),
      isActingAsClient: true,
      relationshipId: delegatedContext.clientId ?? null,
    } as ReturnType<typeof useClientContext.getState>)

    const readiness = waitForTitanBootstrapDelegatedReadiness({
      context: delegatedContext,
      hints: delegatedHints,
      logger,
      traceId: 'trace-not-ready',
    })
    const assertion = expect(readiness).rejects.toThrow('Failed to fetch client context')

    await vi.runAllTimersAsync()
    await assertion

    expect(logger.error).toHaveBeenCalledWith(
      '[Bootstrap:trace-not-ready] Aborting Titan bootstrap — delegated context required',
      expect.objectContaining({ hasClientId: true })
    )
  })

  it('aborts before Titan when the stored relationship no longer matches the URL client', async () => {
    const logger = makeLogger()
    const { useAuthStore } = await import('../auth')
    const { useClientContext } = await import('../../stores/clientContext')
    const readyContext = {
      accountant: { email: 'advisor@example.com', id: 'accountant-1' },
      contextGateResolved: true,
      getContextHeaders: () => ({}),
      isActingAsClient: true,
      relationshipId: delegatedContext.clientId ?? null,
    } as ReturnType<typeof useClientContext.getState>
    const staleContext = {
      ...readyContext,
      relationshipId: 'stale-client-id',
    } as ReturnType<typeof useClientContext.getState>

    vi.spyOn(useAuthStore, 'getState').mockReturnValue({
      error: null,
      isInitializing: false,
      isRefreshing: false,
      loading: false,
      user: { id: 'accountant-1', role: 'accountant' },
    } as ReturnType<typeof useAuthStore.getState>)

    vi.spyOn(useClientContext, 'getState')
      .mockReturnValueOnce(readyContext)
      .mockReturnValueOnce(staleContext)

    await expect(
      waitForTitanBootstrapDelegatedReadiness({
        context: delegatedContext,
        hints: delegatedHints,
        logger,
        traceId: 'trace-mismatch',
      })
    ).rejects.toThrow('Delegated client context does not match the requested client')

    expect(logger.error).toHaveBeenCalledWith(
      '[Bootstrap:trace-mismatch] Aborting Titan bootstrap — delegated context mismatch',
      expect.objectContaining({
        storedRelationshipId: 'stale-cl',
        urlClientId: 'e25ce3b7',
      })
    )
  })
})
