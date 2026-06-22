import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessTypeFullMetadata } from '../services/businessTypesApi'
import { useBusinessTypeFull } from './useBusinessTypeFull'

interface DeferredBusinessTypeFull {
  promise: Promise<BusinessTypeFullMetadata | null>
  reject: (reason?: unknown) => void
  resolve: (value: BusinessTypeFullMetadata | null) => void
}

interface BusinessTypeFullRequest {
  businessTypeId: string
  deferred: DeferredBusinessTypeFull
}

const mocks = vi.hoisted(() => {
  const requests: BusinessTypeFullRequest[] = []

  function createDeferred(): DeferredBusinessTypeFull {
    let resolve: DeferredBusinessTypeFull['resolve'] | undefined
    let reject: DeferredBusinessTypeFull['reject'] | undefined
    const promise = new Promise<BusinessTypeFullMetadata | null>(
      (promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
      }
    )

    if (!resolve || !reject) {
      throw new Error('Deferred business-type metadata promise was not initialized')
    }

    return { promise, reject, resolve }
  }

  return {
    getBusinessTypeFull: vi.fn((businessTypeId: string) => {
      const deferred = createDeferred()
      requests.push({ businessTypeId, deferred })
      return deferred.promise
    }),
    requests,
  }
})

vi.mock('../services/businessTypesApi', () => ({
  businessTypesApiService: {
    getBusinessTypeFull: mocks.getBusinessTypeFull,
  },
}))

vi.mock('../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

function makeBusinessTypeFull(id: string): BusinessTypeFullMetadata {
  return {
    benchmarks: [],
    category_id: 'professional-services',
    created_at: '',
    dcf_preference: 0.4,
    description: `${id} description`,
    icon: 'briefcase',
    id,
    industry: 'Professional Services',
    metadata: [],
    multiples_preference: 0.6,
    owner_dependency_impact: 0.3,
    primary_model: 'ebitda_multiple',
    questions: [],
    sector: 'services',
    status: 'active',
    title: `${id} business`,
    updated_at: '',
    validations: [],
    version: 1,
  }
}

describe('useBusinessTypeFull', () => {
  beforeEach(() => {
    mocks.getBusinessTypeFull.mockClear()
    mocks.requests.length = 0
  })

  it('ignores stale metadata responses after the business type changes', async () => {
    const { result, rerender } = renderHook(
      ({ businessTypeId }) => useBusinessTypeFull(businessTypeId),
      { initialProps: { businessTypeId: 'accounting' } }
    )

    await waitFor(() => expect(mocks.requests).toHaveLength(1))

    rerender({ businessTypeId: 'tax-advisory' })
    await waitFor(() => expect(mocks.requests).toHaveLength(2))

    await act(async () => {
      mocks.requests[0].deferred.resolve(makeBusinessTypeFull('accounting'))
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.businessType).toBeNull()

    await act(async () => {
      mocks.requests[1].deferred.resolve(makeBusinessTypeFull('tax-advisory'))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.businessType?.id).toBe('tax-advisory')
  })
})
