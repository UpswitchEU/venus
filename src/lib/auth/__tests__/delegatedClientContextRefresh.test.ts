import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  refreshDelegatedClientContextIfNeeded,
  resetDelegatedClientContextRefreshState,
} from '../delegatedClientContextRefresh'

const authState = {
  user: { id: 'adv-1', role: 'accountant' },
  error: null as string | null,
  setError: vi.fn((error: string | null) => {
    authState.error = error
  }),
}

const clientContextState = {
  isActingAsClient: true,
  accountant: { id: 'acc-1', email: 'acc@firm.be', fullName: 'Acc' },
  client: null,
  relationshipId: 'client-a',
  relationshipCustomerName: 'A',
  lastValidatedAt: Date.now(),
  contextGateResolved: true,
  clearClientContext: vi.fn(() => {
    clientContextState.isActingAsClient = false
    clientContextState.accountant = null
    clientContextState.relationshipId = null
    clientContextState.contextGateResolved = false
  }),
  setClientContext: vi.fn(
    (context: {
      accountantUser: { id: string; email: string; full_name: string }
      relationship: { id: string; customer_name: string }
    }) => {
      clientContextState.isActingAsClient = true
      clientContextState.accountant = {
        id: context.accountantUser.id,
        email: context.accountantUser.email,
        fullName: context.accountantUser.full_name,
      }
      clientContextState.relationshipId = context.relationship.id
      clientContextState.contextGateResolved = false
    }
  ),
}

vi.mock('../initRuntime', () => ({
  isInitCompleted: () => true,
}))

vi.mock('../store', () => ({
  useAuthStore: {
    getState: () => authState,
  },
}))

vi.mock('../../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => clientContextState,
    setState: (partial: Partial<typeof clientContextState>) => {
      Object.assign(clientContextState, partial)
    },
  },
}))

describe('refreshDelegatedClientContextIfNeeded', () => {
  beforeEach(() => {
    resetDelegatedClientContextRefreshState()
    authState.error = null
    authState.setError.mockClear()
    clientContextState.isActingAsClient = true
    clientContextState.accountant = { id: 'acc-1', email: 'acc@firm.be', fullName: 'Acc' }
    clientContextState.relationshipId = 'client-a'
    clientContextState.contextGateResolved = true
    clientContextState.clearClientContext.mockClear()
    clientContextState.setClientContext.mockClear()
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('re-fetches when URL clientId changes in-session', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accountantUser: { id: 'acc-1', email: 'acc@firm.be', full_name: 'Acc' },
          clientUser: null,
          relationship: { id: 'client-b', customer_name: 'B' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await refreshDelegatedClientContextIfNeeded({
      sourceApp: 'mercury',
      reportId: '480808fd-4093-4c5e-91b1-c24d919dd266',
      clientId: 'client-b',
      mercuryPersonaMode: 'accountant',
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(clientContextState.setClientContext).toHaveBeenCalled()
    expect(clientContextState.relationshipId).toBe('client-b')
  })

  it('skips network when the same delegated key is already satisfied', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          accountantUser: { id: 'acc-1', email: 'acc@firm.be', full_name: 'Acc' },
          clientUser: null,
          relationship: { id: 'client-a', customer_name: 'A' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    const input = {
      sourceApp: 'mercury',
      reportId: '480808fd-4093-4c5e-91b1-c24d919dd266',
      clientId: 'client-a',
      mercuryPersonaMode: 'accountant',
    }

    await refreshDelegatedClientContextIfNeeded(input)
    clientContextState.contextGateResolved = true
    vi.mocked(fetch).mockClear()

    await refreshDelegatedClientContextIfNeeded(input)

    expect(fetch).not.toHaveBeenCalled()
  })
})
