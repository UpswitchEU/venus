import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
