import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  BusinessTypeQuestionsOptions,
  BusinessTypeQuestionsResponse,
} from '../services/businessTypesApi'
import { useBusinessTypeQuestions } from './useBusinessTypeQuestions'

interface DeferredQuestions {
  promise: Promise<BusinessTypeQuestionsResponse | null>
  reject: (reason?: unknown) => void
  resolve: (value: BusinessTypeQuestionsResponse | null) => void
}

interface QuestionsRequest {
  businessTypeId: string
  deferred: DeferredQuestions
  options?: BusinessTypeQuestionsOptions
}

const mocks = vi.hoisted(() => {
  const requests: QuestionsRequest[] = []

  function createDeferred(): DeferredQuestions {
    let resolve: DeferredQuestions['resolve'] | undefined
    let reject: DeferredQuestions['reject'] | undefined
    const promise = new Promise<BusinessTypeQuestionsResponse | null>(
      (promiseResolve, promiseReject) => {
        resolve = promiseResolve
        reject = promiseReject
      }
    )

    if (!resolve || !reject) {
      throw new Error('Deferred business-type questions promise was not initialized')
    }

    return { promise, reject, resolve }
  }

  return {
    getBusinessTypeQuestions: vi.fn(
      (businessTypeId: string, options?: BusinessTypeQuestionsOptions) => {
        const deferred = createDeferred()
        requests.push({ businessTypeId, deferred, options })
        return deferred.promise
      }
    ),
    requests,
  }
})

vi.mock('../services/businessTypesApi', () => ({
  businessTypesApiService: {
    getBusinessTypeQuestions: mocks.getBusinessTypeQuestions,
  },
}))

vi.mock('../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

function makeQuestionsResponse(id: string): BusinessTypeQuestionsResponse {
  return {
    business_type_id: id,
    estimated_time: 3,
    flow_type: 'manual',
    phase: 'initial',
    questions: [
      {
        id: `${id}-q1`,
        required: true,
        text: `${id} question`,
      },
    ],
    source: 'test',
    total_required: 1,
  }
}

describe('useBusinessTypeQuestions', () => {
  beforeEach(() => {
    mocks.getBusinessTypeQuestions.mockClear()
    mocks.requests.length = 0
  })

  it('ignores stale question responses after the business type changes', async () => {
    const { result, rerender } = renderHook(
      ({ businessTypeId }) => useBusinessTypeQuestions(businessTypeId, { phase: 'initial' }),
      { initialProps: { businessTypeId: 'saas' } }
    )

    await waitFor(() => expect(mocks.requests).toHaveLength(1))

    rerender({ businessTypeId: 'services' })
    await waitFor(() => expect(mocks.requests).toHaveLength(2))

    await act(async () => {
      mocks.requests[0].deferred.resolve(makeQuestionsResponse('saas'))
    })

    expect(result.current.loading).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.metadata).toBeNull()
    expect(result.current.questions).toEqual([])

    await act(async () => {
      mocks.requests[1].deferred.resolve(makeQuestionsResponse('services'))
    })

    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
    expect(result.current.metadata).toMatchObject({
      estimated_time: '3',
      total_required: 1,
    })
    expect(result.current.questions).toEqual([
      expect.objectContaining({
        business_type_id: 'services',
        id: 'services-q1',
        question_text: 'services question',
        required: true,
      }),
    ])
  })
})
