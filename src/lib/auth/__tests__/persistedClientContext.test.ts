import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearDelegatedClientContext,
  clearPersistedClientContextStorage,
  discardStalePersistedClientContextOnRehydrate,
  getDelegatedUrlClientId,
  isPersistedContextStaleForUrl,
  urlRequiresDelegatedClientContext,
} from '../persistedClientContext'

describe('persistedClientContext', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('detects URL clientId mismatch against stored relationshipId', () => {
    expect(isPersistedContextStaleForUrl('client-a', 'client-b')).toBe(true)
    expect(isPersistedContextStaleForUrl('client-a', 'client-a')).toBe(false)
    expect(isPersistedContextStaleForUrl('client-a', null)).toBe(false)
    expect(isPersistedContextStaleForUrl(null, 'client-a')).toBe(false)
  })

  it('reads delegated URL clientId from search params', () => {
    vi.stubGlobal('window', {
      location: { search: '?clientId=abc-123&source=mercury' },
    } as Window)
    expect(getDelegatedUrlClientId()).toBe('abc-123')
  })

  it('discards stale slice on rehydrate when URL clientId mismatches', () => {
    vi.stubGlobal('window', {
      location: { search: '?clientId=client-new&source=mercury' },
    } as Window)

    const state = {
      isActingAsClient: true,
      accountant: { id: 'acc-1' },
      client: { id: 'client-old' },
      relationshipId: 'client-old',
      relationshipCustomerName: 'Old Co',
      lastValidatedAt: Date.now(),
    }

    discardStalePersistedClientContextOnRehydrate(state)

    expect(state.isActingAsClient).toBe(false)
    expect(state.accountant).toBeNull()
    expect(state.client).toBeNull()
    expect(state.relationshipId).toBeNull()
    expect(state.relationshipCustomerName).toBeNull()
    expect(state.lastValidatedAt).toBeNull()
  })

  it('detects delegated context requirement from Mercury handoff URLs', () => {
    vi.stubGlobal('window', {
      location: {
        search: '?source=mercury&mode=accountant&clientId=client-1',
        pathname: '/nl/reports/480808fd-4093-4c5e-91b1-c24d919dd266',
      },
    } as Window)
    expect(urlRequiresDelegatedClientContext()).toBe(true)

    vi.stubGlobal('window', {
      location: {
        search: '?source=mercury',
        pathname: '/nl/reports/new',
      },
    } as Window)
    expect(urlRequiresDelegatedClientContext()).toBe(false)
  })

  it('removes client-context keys from localStorage', () => {
    localStorage.setItem('client-context', '{}')
    localStorage.setItem('client-context-version', '1')
    clearPersistedClientContextStorage()
    expect(localStorage.getItem('client-context')).toBeNull()
    expect(localStorage.getItem('client-context-version')).toBeNull()
  })

  it('clearDelegatedClientContext resets gate and refresh dedupe state', async () => {
    const resetGate = vi.fn()
    const resetRefresh = vi.fn()
    vi.doMock('../clientContextGate', () => ({
      resetDelegatedClientContextGate: resetGate,
    }))
    vi.doMock('../delegatedClientContextRefresh', () => ({
      resetDelegatedClientContextRefreshState: resetRefresh,
    }))

    const clearStore = vi.fn()
    vi.resetModules()
    const { clearDelegatedClientContext: clearDelegated } = await import(
      '../persistedClientContext'
    )
    clearDelegated(clearStore)

    expect(clearStore).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => {
      expect(resetGate).toHaveBeenCalledTimes(1)
      expect(resetRefresh).toHaveBeenCalledTimes(1)
    })
  })
})
