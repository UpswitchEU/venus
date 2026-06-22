import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BusinessType } from '../services/businessTypesApi'
import { useBusinessTypes } from './useBusinessTypes'

interface DeferredBusinessTypes {
  promise: Promise<BusinessType[]>
  reject: (reason?: unknown) => void
  resolve: (value: BusinessType[]) => void
}

interface BusinessTypesRequest {
  deferred: DeferredBusinessTypes
  signal?: AbortSignal
}

const mocks = vi.hoisted(() => {
  const requests: BusinessTypesRequest[] = []

  function createDeferred(): DeferredBusinessTypes {
    let resolve: DeferredBusinessTypes['resolve'] | undefined
    let reject: DeferredBusinessTypes['reject'] | undefined
    const promise = new Promise<BusinessType[]>((promiseResolve, promiseReject) => {
      resolve = promiseResolve
      reject = promiseReject
    })

    if (!resolve || !reject) {
      throw new Error('Deferred business-types promise was not initialized')
    }

    return { promise, reject, resolve }
  }

  return {
    getBusinessTypes: vi.fn((signal?: AbortSignal) => {
      const deferred = createDeferred()
      signal?.addEventListener(
        'abort',
        () => {
          const error = new Error('aborted')
          error.name = 'AbortError'
          deferred.reject(error)
        },
        { once: true }
      )
      requests.push({ deferred, signal })
      return deferred.promise
    }),
    requests,
  }
})

vi.mock('../services/businessTypesApi', () => ({
  businessTypesApiService: {
    getBusinessTypes: mocks.getBusinessTypes,
  },
  businessTypesToOptions: (types: BusinessType[]) =>
    types.map((type) => ({
      category: type.category,
      icon: type.icon,
      label: type.title,
      value: type.id,
    })),
}))

function makeBusinessType(id: string): BusinessType {
  return {
    category: 'Professional Services',
    category_id: 'professional-services',
    createdAt: '',
    description: '',
    icon: 'briefcase',
    id,
    industryMapping: 'professional-services',
    keywords: [],
    popular: false,
    status: 'active',
    title: `${id} business`,
    updatedAt: '',
  }
}

describe('useBusinessTypes', () => {
  beforeEach(() => {
    mocks.getBusinessTypes.mockClear()
    mocks.requests.length = 0
  })

  it('maps loaded business types into selector options', async () => {
    const { result } = renderHook(() => useBusinessTypes())

    await waitFor(() => expect(mocks.requests).toHaveLength(1))
    await act(async () => {
      mocks.requests[0].deferred.resolve([makeBusinessType('accounting')])
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.businessTypes).toHaveLength(1)
    expect(result.current.businessTypeOptions).toEqual([
      {
        category: 'Professional Services',
        icon: 'briefcase',
        label: 'accounting business',
        value: 'accounting',
      },
    ])
  })

  it('keeps loading true when an aborted request settles after a refetch starts', async () => {
    const { result } = renderHook(() => useBusinessTypes())

    await waitFor(() => expect(mocks.requests).toHaveLength(1))

    let refetchPromise: Promise<void> | undefined
    act(() => {
      refetchPromise = result.current.refetch()
    })

    await waitFor(() => expect(mocks.requests).toHaveLength(2))
    await act(async () => {
      await Promise.resolve()
    })

    expect(mocks.requests[0].signal?.aborted).toBe(true)
    expect(result.current.loading).toBe(true)

    await act(async () => {
      mocks.requests[1].deferred.resolve([makeBusinessType('tax-advisory')])
      await refetchPromise
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.businessTypes.map((type) => type.id)).toEqual(['tax-advisory'])
  })
})
