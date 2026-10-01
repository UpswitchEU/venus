import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerSignedInUserIdResolver } from '../lib/auth/actingAccountant'
import { generalLogger } from '../utils/logger'
import {
  startClientContextAutoValidation,
  stopClientContextAutoValidation,
  useClientContext,
  validateActiveClientContext,
} from './clientContext'

vi.mock('../utils/logger', () => ({
  generalLogger: {
    warn: vi.fn(),
  },
}))

const delegatedContext = {
  accountantUser: {
    id: 'accountant-1',
    email: 'accountant@example.com',
    full_name: 'Accountant One',
  },
  clientUser: {
    id: 'client-1',
    email: 'client@example.com',
    full_name: 'Client One',
    avatar_url: null,
  },
  relationship: {
    id: 'relationship-1',
    customer_name: 'Client Co',
  },
}

const originalValidateContext = useClientContext.getState().validateContext
afterEach(() => useClientContext.setState({ validateContext: originalValidateContext }))

describe('clientContext auto validation', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    stopClientContextAutoValidation()
    useClientContext.getState().clearClientContext()
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('starts one validation interval until explicitly stopped', () => {
    const intervalId = 42 as unknown as ReturnType<typeof setInterval>
    const setIntervalFn = vi.fn(() => intervalId) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval

    startClientContextAutoValidation({ setIntervalFn })
    startClientContextAutoValidation({ setIntervalFn })

    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000)

    stopClientContextAutoValidation({ clearIntervalFn })
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)

    startClientContextAutoValidation({ setIntervalFn })
    expect(setIntervalFn).toHaveBeenCalledTimes(2)
  })

  it('skips scheduled validation when no delegated client context is active', () => {
    const validateContext = vi.spyOn(useClientContext.getState(), 'validateContext')

    validateActiveClientContext()

    expect(validateContext).not.toHaveBeenCalled()
  })

  it('validates the active delegated client context on scheduled ticks', async () => {
    useClientContext.getState().setClientContext(delegatedContext)
    const validateContext = vi
      .spyOn(useClientContext.getState(), 'validateContext')
      .mockResolvedValue(true)

    validateActiveClientContext()
    await vi.waitFor(() => {
      expect(validateContext).toHaveBeenCalledTimes(1)
    })
  })

  it('contains unexpected scheduled validation rejections behind structured logging', async () => {
    const error = new Error('validation failed')
    useClientContext.getState().setClientContext(delegatedContext)
    vi.spyOn(useClientContext.getState(), 'validateContext').mockRejectedValue(error)

    validateActiveClientContext()

    await vi.waitFor(() => {
      expect(generalLogger.warn).toHaveBeenCalledWith(
        '[ClientContext] Scheduled validation failed',
        { error }
      )
    })
  })
})

describe('client context headers', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    useClientContext.getState().clearClientContext()
    useClientContext.setState({ contextGateResolved: true })
  })

  afterEach(() => {
    registerSignedInUserIdResolver(null)
    useClientContext.getState().clearClientContext()
  })

  it('names the signed-in advisor, not the relationship owner bootstrap stored', () => {
    useClientContext.getState().setClientContext({
      ...delegatedContext,
      accountantUser: { ...delegatedContext.accountantUser, id: 'relationship-owner' },
    })
    useClientContext.setState({ contextGateResolved: true })
    registerSignedInUserIdResolver(() => 'signed-in-colleague')

    expect(useClientContext.getState().getContextHeaders()).toMatchObject({
      'X-Accountant-User-Id': 'signed-in-colleague',
      'X-Relationship-Id': 'relationship-1',
    })
  })

  it('keeps the stored accountant while no one is signed in yet', () => {
    useClientContext.getState().setClientContext(delegatedContext)
    useClientContext.setState({ contextGateResolved: true })
    registerSignedInUserIdResolver(() => undefined)

    expect(useClientContext.getState().getContextHeaders()).toMatchObject({
      'X-Accountant-User-Id': 'accountant-1',
    })
  })
})

describe('client context freshness', () => {
  afterEach(() => {
    vi.useRealTimers()
    useClientContext.getState().clearClientContext()
  })
  it('does not renew server freshness during local validation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-01T00:00:00Z'))
    useClientContext.getState().setClientContext(delegatedContext)
    const validatedAt = useClientContext.getState().lastValidatedAt
    vi.advanceTimersByTime(23 * 60 * 60 * 1000)
    await expect(useClientContext.getState().validateContext()).resolves.toBe(true)
    expect(useClientContext.getState().lastValidatedAt).toBe(validatedAt)
    vi.advanceTimersByTime(60 * 60 * 1000)
    expect(useClientContext.getState().getContextHeaders()).toEqual({})
    expect(useClientContext.getState().isActingAsClient).toBe(false)
  })

  it('discards future-dated contexts and injected store actions on rehydrate', async () => {
    useClientContext.getState().clearClientContext()
    localStorage.setItem(
      'client-context',
      JSON.stringify({
        state: {
          isActingAsClient: true,
          accountant: { id: 'id', email: '', fullName: '' },
          client: null,
          relationshipId: 'relationship',
          lastValidatedAt: Date.now() + 100_000,
          getContextHeaders: null,
        },
      })
    )
    await useClientContext.persist.rehydrate()
    expect(useClientContext.getState().isActingAsClient).toBe(false)
    expect(typeof useClientContext.getState().getContextHeaders).toBe('function')
    expect(localStorage.getItem('client-context')).toBeNull()
  })
})
