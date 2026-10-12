import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  patchValuationSessionWithTransientRetry,
  SESSION_PATCH_TIMEOUT_MS,
} from './SessionApiPatchRetry'

const circuitMocks = vi.hoisted(() => ({
  awaitSessionPoolPressureGate: vi.fn(),
  recordSessionPoolPressureFromHttpError: vi.fn(),
  recordSuccessfulSessionPatch: vi.fn(),
}))

const loggerMocks = vi.hoisted(() => ({
  warn: vi.fn(),
}))

vi.mock('../../../hooks/sessionPoolPressureCircuit', () => ({
  awaitSessionPoolPressureGate: circuitMocks.awaitSessionPoolPressureGate,
  recordSessionPoolPressureFromHttpError: circuitMocks.recordSessionPoolPressureFromHttpError,
  recordSuccessfulSessionPatch: circuitMocks.recordSuccessfulSessionPatch,
}))

vi.mock('../../../utils/logger', () => ({
  apiLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: loggerMocks.warn,
  },
}))

describe('SessionApiPatchRetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    circuitMocks.awaitSessionPoolPressureGate.mockResolvedValue(true)
  })

  it('builds a single PATCH request with the session timeout and generic retries disabled', async () => {
    const executeRequest = vi.fn().mockResolvedValue({ success: true })

    const result = await patchValuationSessionWithTransientRetry({
      executeRequest,
      patchBody: { session_data: { company_name: 'Acme BV' } },
      reportId: 'val_patch_policy',
    })

    expect(result).toEqual({ success: true })
    expect(circuitMocks.awaitSessionPoolPressureGate).toHaveBeenCalledWith({
      maxWaitMs: expect.any(Number),
    })
    expect(executeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { session_data: { company_name: 'Acme BV' } },
        method: 'PATCH',
        url: '/api/v2/valuations/sessions/val_patch_policy',
      }),
      expect.objectContaining({
        retry: { maxRetries: 0 },
        timeout: SESSION_PATCH_TIMEOUT_MS,
      })
    )
    expect(circuitMocks.recordSuccessfulSessionPatch).toHaveBeenCalledTimes(1)
  })

  it.each([
    429, 500, 503, 504,
  ])('leaves %s retries and Retry-After to report recovery', async (status) => {
    const error = {
      response: { status, headers: { 'retry-after': '30' }, data: { message: 'Unavailable' } },
    }
    const executeRequest = vi.fn().mockRejectedValue(error)
    await expect(
      patchValuationSessionWithTransientRetry({
        executeRequest,
        patchBody: {},
        reportId: 'val_transient_patch',
      })
    ).rejects.toBe(error)
    expect(executeRequest).toHaveBeenCalledTimes(1)
  })

  it('does not retry 503 or 504 pool-pressure failures', async () => {
    const poolPressureError = { response: { status: 503 } }
    const executeRequest = vi.fn().mockRejectedValue(poolPressureError)

    await expect(
      patchValuationSessionWithTransientRetry({
        executeRequest,
        patchBody: { session_data: { company_name: 'Acme BV' } },
        reportId: 'val_pool_pressure',
      })
    ).rejects.toBe(poolPressureError)

    expect(executeRequest).toHaveBeenCalledTimes(1)
    expect(circuitMocks.recordSessionPoolPressureFromHttpError).toHaveBeenCalledWith(
      poolPressureError
    )
    expect(circuitMocks.recordSuccessfulSessionPatch).not.toHaveBeenCalled()
  })

  it('defers PATCH when the pool-pressure gate cannot open within budget', async () => {
    circuitMocks.awaitSessionPoolPressureGate.mockResolvedValue(false)
    const executeRequest = vi.fn()

    await expect(
      patchValuationSessionWithTransientRetry({
        executeRequest,
        patchBody: { session_data: { company_name: 'Acme BV' } },
        reportId: 'val_deferred',
      })
    ).rejects.toMatchObject({
      message: 'Session PATCH deferred: database pool pressure',
      response: { status: 503 },
    })

    expect(executeRequest).not.toHaveBeenCalled()
  })
})
