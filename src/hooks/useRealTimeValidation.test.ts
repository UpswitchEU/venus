import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessTypeValidationResult } from '../services/businessTypesApi'
import { useRealTimeValidation } from './useRealTimeValidation'

interface DeferredValidation {
  promise: Promise<BusinessTypeValidationResult | null>
  reject: (reason?: unknown) => void
  resolve: (value: BusinessTypeValidationResult | null) => void
}

interface ValidationRequest {
  businessTypeId: string
  data: Record<string, unknown>
  deferred: DeferredValidation
}

const mocks = vi.hoisted(() => {
  const requests: ValidationRequest[] = []

  function createDeferred(): DeferredValidation {
    let resolve: DeferredValidation['resolve'] | undefined
    let reject: DeferredValidation['reject'] | undefined
    const promise = new Promise<BusinessTypeValidationResult | null>(
      (promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
      }
    )

    if (!resolve || !reject) {
      throw new Error('Deferred validation promise was not initialized')
    }

    return { promise, reject, resolve }
  }

  return {
    requests,
    validateBusinessTypeData: vi.fn((businessTypeId: string, data: Record<string, unknown>) => {
      const deferred = createDeferred()
      requests.push({ businessTypeId, data, deferred })
      return deferred.promise
    }),
  }
})

vi.mock('../services/businessTypesApi', () => ({
  businessTypesApiService: {
    validateBusinessTypeData: mocks.validateBusinessTypeData,
  },
}))

vi.mock('../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

function makeValidation(valid: boolean): BusinessTypeValidationResult {
  return {
    business_type_id: 'accounting',
    errors: valid
      ? []
      : [
          {
            field: 'revenue',
            message: 'Revenue is required',
            rule: 'required',
            severity: 'error',
          },
        ],
    suggestions: [],
    valid,
    warnings: [],
  }
}

describe('useRealTimeValidation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.validateBusinessTypeData.mockClear()
    mocks.requests.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores stale validation responses while a newer validation is active', async () => {
    const { result } = renderHook(() => useRealTimeValidation('accounting', 10))

    await act(async () => {
      await result.current.validate({ revenue: 1 })
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(mocks.requests).toHaveLength(1)

    expect(result.current.validating).toBe(true)

    await act(async () => {
      await result.current.validate({ revenue: 2 })
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(mocks.requests).toHaveLength(2)

    await act(async () => {
      mocks.requests[0].deferred.resolve(makeValidation(false))
    })

    expect(result.current.validation).toBeNull()
    expect(result.current.validating).toBe(true)

    await act(async () => {
      mocks.requests[1].deferred.resolve(makeValidation(true))
    })

    expect(result.current.validating).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.validation).toMatchObject({
      errors: [],
      suggestions: [],
      valid: true,
      warnings: [],
    })
  })
})
