/**
 * SessionBootstrapService transport Tests
 *
 * Covers in-flight deduplication, explicit retry cancellation, body-read budgets, and structured retry behavior.
 *
 * @module lib/bootstrap/__tests__/SessionBootstrapService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BootstrapContext, SessionBootstrapState } from './SessionBootstrapService.testHarness'
import {
  BOOTSTRAP_TIMEOUT_USER_MESSAGE,
  fetchTitanBootstrapPayloadWithStructuredRetry,
  getTransportContext,
  jsonResponse,
  makeBootstrapRequest,
  mockAuthResolver,
  mockPrefillResolver,
  mockSessionResolver,
  readResponseBodyWithinClientBudget,
  resetSessionBootstrapHarness,
  restoreSessionBootstrapHarness,
} from './SessionBootstrapService.testHarness'

let service: SessionBootstrapService

beforeEach(() => {
  service = resetSessionBootstrapHarness()
})

afterEach(restoreSessionBootstrapHarness)

describe('SessionBootstrapService transport', () => {
  it('should deduplicate parallel bootstrap requests', async () => {
    const context: BootstrapContext = {
      reportId: 'val_dedup_123',
      locale: 'en',
    }

    mockAuthResolver.resolve.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                data: { type: 'authenticated', userId: 'user-dedup' },
              }),
            100
          )
        )
    )

    mockSessionResolver.resolve.mockResolvedValue({
      data: {
        mode: 'new',
        reportId: context.reportId,
        hasExistingData: false,
        status: 'draft',
      },
    })

    mockPrefillResolver.resolve.mockResolvedValue({
      data: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
      },
    })

    // Fire multiple parallel requests
    const [result1, result2, result3] = await Promise.all([
      service.bootstrap(context),
      service.bootstrap(context),
      service.bootstrap(context),
    ])

    // All should return the same result
    expect(result1.report.reportId).toBe(result2.report.reportId)
    expect(result2.report.reportId).toBe(result3.report.reportId)

    // Auth resolver should only be called once (deduplication)
    expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(1)
  })

  it('drops stale in-flight Titan bootstrap work when explicitly cleared', async () => {
    const context: BootstrapContext = {
      reportId: 'val_dedup_titan',
      locale: 'nl',
    }
    const never = new Promise<SessionBootstrapState>(() => {
      // Intentionally never resolves; this pins the in-flight cache behavior.
    })
    const executeTitan = vi.fn(() => never)
    ;(
      service as unknown as {
        _executeBootstrapViaTitan: typeof executeTitan
      }
    )._executeBootstrapViaTitan = executeTitan

    void service.bootstrapViaTitan(context)
    void service.bootstrapViaTitan(context)

    expect(executeTitan).toHaveBeenCalledTimes(1)

    service.clearInflightCache()
    void service.bootstrapViaTitan(context)

    expect(executeTitan).toHaveBeenCalledTimes(2)
  })

  it('aborts active Titan fetches when explicit retry clears in-flight work', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        })
    )

    const requestPromise = makeBootstrapRequest({
      ...getTransportContext(service),
      requestBody: {},
      headers: {},
      traceId: 'trace-clear',
    })

    await Promise.resolve()
    service.clearInflightCache()

    await expect(requestPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not resume a retry backoff after explicit retry clears in-flight work', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 500 }))
    const transportContext = getTransportContext(service)

    const requestPromise = makeBootstrapRequest({
      ...transportContext,
      requestBody: {},
      headers: {},
      traceId: 'trace-backoff-clear',
    })
    const assertion = expect(requestPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)

    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(transportContext.bootstrapAbortControllers.size).toBe(1)

    service.clearInflightCache()

    await assertion
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(transportContext.bootstrapAbortControllers.size).toBe(0)
  })

  it('bounds browser-side Titan response body reads', async () => {
    vi.useFakeTimers()

    const readPromise = readResponseBodyWithinClientBudget({
      ...getTransportContext(service),
      operation: () =>
        new Promise(() => {
          // Intentionally never resolves; the browser-side body budget must win.
        }),
      startTime: performance.now(),
      traceId: 'trace-body',
      label: 'JSON body',
    })
    const assertion = expect(readPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)

    await vi.advanceTimersByTimeAsync(32_000)

    await assertion
  })

  it('aborts in-progress Titan response body reads when explicit retry clears in-flight work', async () => {
    const controller = new AbortController()
    const response = new Response('{}')
    ;(
      service as unknown as {
        bootstrapAbortControllers: Set<AbortController>
        responseAbortControllers: WeakMap<Response, AbortController>
      }
    ).bootstrapAbortControllers.add(controller)
    ;(
      service as unknown as {
        responseAbortControllers: WeakMap<Response, AbortController>
      }
    ).responseAbortControllers.set(response, controller)

    const readPromise = readResponseBodyWithinClientBudget({
      ...getTransportContext(service),
      operation: () =>
        new Promise((_resolve, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'))
          })
        }),
      startTime: performance.now(),
      traceId: 'trace-body-clear',
      label: 'JSON body',
      response,
    })
    const assertion = expect(readPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)

    await Promise.resolve()
    service.clearInflightCache()

    await assertion
  })

  it('retries retryable structured Titan bootstrap errors once', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        jsonResponse({
          success: false,
          error: 'Database busy',
          errorInfo: {
            code: 'DATABASE_ERROR',
            message: 'A database error occurred. Please try again.',
            retryable: true,
          },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: {
            identity: { type: 'authenticated', userId: 'user-structured-retry' },
            report: {
              mode: 'existing',
              reportId: '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
              hasExistingData: true,
              status: 'completed',
            },
            prefill: {
              sources: [],
              confidence: 0,
              fieldsPopulated: [],
              fieldsRemaining: [],
            },
            ui: {},
          },
        })
      )
    const resultPromise = fetchTitanBootstrapPayloadWithStructuredRetry({
      ...getTransportContext(service),
      requestBody: {},
      headers: {},
      traceId: 'trace-structured-retry',
      startTime: performance.now(),
    })

    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(400)
    const result = await resultPromise

    expect(result.data.success).toBe(true)
    expect(result.responseStatus).toBe(200)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('cancels structured Titan retry backoff when explicit retry clears in-flight work', async () => {
    vi.useFakeTimers()
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: false,
        error: 'Database busy',
        errorInfo: {
          code: 'DATABASE_ERROR',
          message: 'A database error occurred. Please try again.',
          retryable: true,
        },
      })
    )
    const transportContext = getTransportContext(service)
    const resultPromise = fetchTitanBootstrapPayloadWithStructuredRetry({
      ...transportContext,
      requestBody: {},
      headers: {},
      traceId: 'trace-structured-backoff-clear',
      startTime: performance.now(),
    })
    const assertion = expect(resultPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)

    await Promise.resolve()
    await Promise.resolve()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(transportContext.bootstrapAbortControllers.size).toBe(1)

    service.clearInflightCache()

    await assertion
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(transportContext.bootstrapAbortControllers.size).toBe(0)
  })

  it('does not retry structured missing-report errors', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: false,
        error: 'Report not found',
        errorInfo: {
          code: 'REPORT_NOT_FOUND',
          message: 'Report not found',
          retryable: false,
        },
      })
    )
    const result = await fetchTitanBootstrapPayloadWithStructuredRetry({
      ...getTransportContext(service),
      requestBody: {},
      headers: {},
      traceId: 'trace-not-found',
      startTime: performance.now(),
    })

    expect(result.data.success).toBe(false)
    expect(result.data.errorInfo?.code).toBe('REPORT_NOT_FOUND')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('does not retry credit-blocked bootstrap responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      jsonResponse({
        success: false,
        error: 'Credits exhausted',
        errorInfo: {
          code: 'CREDITS_EXHAUSTED',
          message: 'Credits exhausted',
          retryable: true,
        },
        data: {
          creditStatus: {
            allowed: false,
          },
        },
      })
    )
    const result = await fetchTitanBootstrapPayloadWithStructuredRetry({
      ...getTransportContext(service),
      requestBody: {},
      headers: {},
      traceId: 'trace-credit',
      startTime: performance.now(),
    })

    expect(result.data.success).toBe(false)
    expect(result.data.data?.creditStatus?.allowed).toBe(false)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})
