import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clientContextState = {
  contextGateResolved: false,
}

vi.mock('../../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => clientContextState,
    setState: (patch: Partial<typeof clientContextState>) => {
      Object.assign(clientContextState, patch)
    },
  },
}))

describe('clientContextGate', () => {
  beforeEach(() => {
    clientContextState.contextGateResolved = false
    vi.resetModules()
    vi.stubGlobal('window', {
      location: {
        search: '?clientId=client-a&source=mercury',
        pathname: '/nl/reports/report-uuid',
      },
    } as Window)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('waitForClientContext waits again after store gate drops without module reset', async () => {
    const gate = await import('../clientContextGate')
    gate.resolveClientContext()
    clientContextState.contextGateResolved = false

    const waitPromise = gate.waitForClientContext()
    let settled = false
    void waitPromise.then(() => {
      settled = true
    })

    await Promise.resolve()
    expect(settled).toBe(false)

    gate.resolveClientContext()
    await waitPromise
    expect(settled).toBe(true)
  })

  it('resolveDelegatedContextGateIfBootstrapSynced opens gate when relationship matches URL clientId', async () => {
    const gate = await import('../clientContextGate')
    gate.resetDelegatedClientContextGate()
    clientContextState.contextGateResolved = false

    gate.resolveDelegatedContextGateIfBootstrapSynced('client-b')
    expect(clientContextState.contextGateResolved).toBe(false)

    gate.resolveDelegatedContextGateIfBootstrapSynced('client-a')
    expect(clientContextState.contextGateResolved).toBe(true)
    expect(gate.isClientContextReady()).toBe(true)
  })
})
