/**
 * SessionBootstrapService Tests
 *
 * AUTH-FIRST ARCHITECTURE: All tests assume authenticated users.
 * Guest flow has been removed from the platform.
 *
 * @module lib/bootstrap/__tests__/SessionBootstrapService
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BOOTSTRAP_TIMEOUT_USER_MESSAGE } from '../bootstrapUserMessages'
import { SessionBootstrapService } from '../SessionBootstrapService'
import {
  fetchTitanBootstrapPayloadWithStructuredRetry,
  makeBootstrapRequest,
  readResponseBodyWithinClientBudget,
} from '../TitanBootstrapClient'
import type { BootstrapContext, SessionBootstrapState } from '../types'

// Mock resolvers
const mockAuthResolver = {
  resolve: vi.fn(),
}

const mockSessionResolver = {
  resolve: vi.fn(),
}

const mockPrefillResolver = {
  resolve: vi.fn(),
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function getTransportContext(service: SessionBootstrapService) {
  const internals = service as unknown as {
    bootstrapAbortControllers: Set<AbortController>
    bootstrapCancellationEpoch: number
    responseAbortControllers: WeakMap<Response, AbortController>
  }
  return {
    bootstrapAbortControllers: internals.bootstrapAbortControllers,
    getCancellationEpoch: () => internals.bootstrapCancellationEpoch,
    logger: console,
    responseAbortControllers: internals.responseAbortControllers,
  }
}

describe('SessionBootstrapService', () => {
  let service: SessionBootstrapService
  type SessionBootstrapServiceConstructorArgs = ConstructorParameters<
    typeof SessionBootstrapService
  >

  beforeEach(() => {
    vi.clearAllMocks()
    service = new SessionBootstrapService(
      mockAuthResolver as unknown as SessionBootstrapServiceConstructorArgs[0],
      mockSessionResolver as unknown as SessionBootstrapServiceConstructorArgs[1],
      mockPrefillResolver as unknown as SessionBootstrapServiceConstructorArgs[2]
    )
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  describe('bootstrap', () => {
    // AUTH-FIRST: Guest identity test removed - all users must authenticate
    it('should return authenticated identity for new user', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-new-123',
        },
      })

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
          fieldsRemaining: ['company_name', 'revenue'],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('authenticated')
      expect(result.report.mode).toBe('new')
      expect(result.prefillData.confidence).toBe(0)
    })

    it('should return authenticated identity when user exists', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-123',
          email: 'test@example.com',
        },
      })

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
          sources: ['user_profile'],
          companyInfo: { companyName: 'Test Corp' },
          confidence: 0.5,
          fieldsPopulated: ['company_name'],
          fieldsRemaining: ['revenue'],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('authenticated')
      expect(result.identity.userId).toBe('user-123')
      expect(result.prefillData.sources).toContain('user_profile')
    })

    it('should return accountant_for_client identity when clientToken present', async () => {
      const context: BootstrapContext = {
        reportId: 'val_123456789_vabc123',
        clientToken: 'ct_abc123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'accountant_for_client',
          userId: 'client-456',
          clientContext: {
            clientUserId: 'client-456',
            accountantUserId: 'accountant-789',
            relationshipId: 'rel-123',
            permissions: {
              canCreateValuations: true,
              canViewReports: true,
              canEditReports: true,
            },
          },
        },
      })

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
          sources: ['user_profile', 'kbo'],
          companyInfo: { companyName: 'Client Corp', kboNumber: '0123456789' },
          confidence: 0.8,
          fieldsPopulated: ['company_name', 'kbo_number'],
          fieldsRemaining: ['revenue'],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.identity.type).toBe('accountant_for_client')
      expect(result.identity.clientContext?.clientUserId).toBe('client-456')
      expect(result.identity.clientContext?.accountantUserId).toBe('accountant-789')
      expect(result.ui.showAccountantBanner).toBe(true)
    })

    it('should handle existing report mode', async () => {
      const context: BootstrapContext = {
        reportId: 'val_existing_123',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-123',
        },
      })

      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'existing',
          reportId: context.reportId,
          hasExistingData: true,
          status: 'active',
          currentStep: 3,
        },
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: ['session'],
          companyInfo: { companyName: 'Existing Corp' },
          confidence: 0.9,
          fieldsPopulated: ['company_name', 'revenue', 'ebitda'],
          fieldsRemaining: [],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.report.mode).toBe('existing')
      expect(result.report.hasExistingData).toBe(true)
      expect(result.ui.showWelcomeBack).toBe(true)
      expect(result.ui.resumableSession).toBe(true)
    })

    it('preserves explicit report readiness for existing reports', async () => {
      const context: BootstrapContext = {
        reportId: 'val_existing_pending',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-123',
        },
      })

      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'existing',
          reportId: context.reportId,
          hasExistingData: true,
          hasValuationResult: false,
          reportReady: false,
          status: 'completed',
        },
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: ['session'],
          confidence: 0.9,
          fieldsPopulated: ['company_name'],
          fieldsRemaining: [],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.report.mode).toBe('existing')
      expect(result.report.reportReady).toBe(false)
    })

    it('should suggest conversational flow for low confidence', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-low-confidence',
        },
      })

      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'new',
          reportId: 'val_new_123',
          hasExistingData: false,
          status: 'draft',
        },
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: [],
          confidence: 0.1, // Very low confidence
          fieldsPopulated: [],
          fieldsRemaining: ['company_name', 'revenue', 'ebitda'],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.ui.suggestedFlow).toBe('conversational')
    })

    it('should handle KBO prefill', async () => {
      const context: BootstrapContext = {
        prefilledQuery: 'Test Company BV',
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: {
          type: 'authenticated',
          userId: 'user-kbo-lookup',
        },
      })

      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'new',
          reportId: 'val_new_123',
          hasExistingData: false,
          status: 'draft',
        },
      })

      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: ['kbo'],
          companyInfo: {
            companyName: 'Test Company BV',
            kboNumber: '0123456789',
            vatNumber: 'BE0123456789',
            city: 'Brussels',
          },
          kboData: {
            kboNumber: '0123456789',
            companyName: 'Test Company BV',
            isActive: true,
          },
          confidence: 0.6,
          fieldsPopulated: ['company_name', 'kbo_number', 'vat_number', 'city'],
          fieldsRemaining: ['revenue', 'ebitda'],
        },
      })

      const result = await service.bootstrap(context)

      expect(result.prefillData.sources).toContain('kbo')
      expect(result.prefillData.kboData?.kboNumber).toBe('0123456789')
      expect(result.ui.showKboVerification).toBe(true)
    })

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

      const requestPromise = makeBootstrapRequest({
        ...getTransportContext(service),
        requestBody: {},
        headers: {},
        traceId: 'trace-backoff-clear',
      })
      const assertion = expect(requestPromise).rejects.toThrow(BOOTSTRAP_TIMEOUT_USER_MESSAGE)

      await Promise.resolve()
      expect(fetchSpy).toHaveBeenCalledTimes(1)

      service.clearInflightCache()
      await vi.advanceTimersByTimeAsync(500)

      await assertion
      expect(fetchSpy).toHaveBeenCalledTimes(1)
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

    it('scopes cached results to the requested report id', async () => {
      const context: BootstrapContext = {
        reportId: 'val_cache_a',
        locale: 'en',
      }
      const otherContext: BootstrapContext = {
        ...context,
        reportId: 'val_cache_b',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: { type: 'authenticated', userId: 'user-cache' },
      })
      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'existing',
          reportId: context.reportId,
          hasExistingData: false,
          status: 'active',
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

      const result = await service.bootstrap(context)

      expect(result.report.reportId).toBe('val_cache_a')
      expect(service.getCachedResult(context)?.report.reportId).toBe('val_cache_a')
      expect(service.getCachedResult(otherContext)).toBeNull()
    })

    it('scopes cached results to the full new-report context', async () => {
      const alphaContext: BootstrapContext = {
        locale: 'nl',
        flow: 'manual',
        prefilledQuery: 'Alpha BV',
        sourceApp: 'mercury',
        clientId: 'client-a',
      }
      const betaContext: BootstrapContext = {
        ...alphaContext,
        prefilledQuery: 'Beta BV',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: { type: 'authenticated', userId: 'user-new-cache' },
      })
      mockSessionResolver.resolve.mockImplementation((ctx: BootstrapContext) =>
        Promise.resolve({
          data: {
            mode: 'new',
            reportId: ctx.prefilledQuery === 'Beta BV' ? 'val_new_beta' : 'val_new_alpha',
            hasExistingData: false,
            status: 'draft',
          },
        })
      )
      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: [],
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
        },
      })

      const alphaResult = await service.bootstrap(alphaContext)

      expect(alphaResult.report.reportId).toBe('val_new_alpha')
      expect(service.getCachedResult(alphaContext)?.report.reportId).toBe('val_new_alpha')
      expect(service.getCachedResult(betaContext)).toBeNull()

      const betaResult = await service.bootstrap(betaContext)

      expect(betaResult.report.reportId).toBe('val_new_beta')
      expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(2)
    })

    it('does not deduplicate parallel new-report requests with different context', async () => {
      const alphaContext: BootstrapContext = {
        locale: 'nl',
        flow: 'manual',
        prefilledQuery: 'Alpha BV',
      }
      const betaContext: BootstrapContext = {
        ...alphaContext,
        prefilledQuery: 'Beta BV',
      }

      mockAuthResolver.resolve.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () => resolve({ data: { type: 'authenticated', userId: 'user-parallel-new' } }),
              25
            )
          )
      )
      mockSessionResolver.resolve.mockImplementation((ctx: BootstrapContext) =>
        Promise.resolve({
          data: {
            mode: 'new',
            reportId: ctx.prefilledQuery === 'Beta BV' ? 'val_parallel_beta' : 'val_parallel_alpha',
            hasExistingData: false,
            status: 'draft',
          },
        })
      )
      mockPrefillResolver.resolve.mockResolvedValue({
        data: {
          sources: [],
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
        },
      })

      const [alphaResult, betaResult] = await Promise.all([
        service.bootstrap(alphaContext),
        service.bootstrap(betaContext),
      ])

      expect(alphaResult.report.reportId).toBe('val_parallel_alpha')
      expect(betaResult.report.reportId).toBe('val_parallel_beta')
      expect(mockAuthResolver.resolve).toHaveBeenCalledTimes(2)
    })

    it('does not return another report from the circuit breaker fallback', async () => {
      const context: BootstrapContext = {
        reportId: 'val_breaker_a',
        locale: 'en',
      }
      const otherContext: BootstrapContext = {
        ...context,
        reportId: 'val_breaker_b',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: { type: 'authenticated', userId: 'user-breaker' },
      })
      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'existing',
          reportId: context.reportId,
          hasExistingData: false,
          status: 'active',
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

      await service.bootstrap(context)
      ;(service as unknown as { callTimestamps: number[] }).callTimestamps = Array.from(
        { length: 4 },
        () => Date.now()
      )

      await expect(
        service.bootstrap({
          reportId: 'val_breaker_b',
          locale: 'en',
        })
      ).rejects.toThrow('Circuit breaker')

      expect(service.getCachedResult(context)?.report.reportId).toBe('val_breaker_a')
      expect(service.getCachedResult(otherContext)).toBeNull()
    })

    it('rejects Titan bootstrap responses that downgrade an existing UUID to a new draft', () => {
      expect(() =>
        (
          service as unknown as {
            assertExistingReportWasNotDowngraded: (
              context: BootstrapContext,
              state: SessionBootstrapState,
              traceId: string
            ) => void
          }
        ).assertExistingReportWasNotDowngraded(
          {
            url: '/nl/reports/46e05c0c-6f40-4527-82cb-4560d6eee0ad',
            reportId: '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
            locale: 'nl',
            sourceApp: 'mercury',
          },
          {
            identity: { type: 'authenticated', userId: 'user-1' },
            report: {
              mode: 'new',
              reportId: '46e05c0c-6f40-4527-82cb-4560d6eee0ad',
              hasExistingData: false,
              status: 'draft',
            },
            prefillData: {
              sources: [],
              confidence: 0,
              fieldsPopulated: [],
              fieldsRemaining: [],
            },
            ui: {
              showWelcomeBack: false,
              resumableSession: false,
              suggestedFlow: 'manual',
              prefilledFieldCount: 0,
              totalFieldCount: 0,
              showKboVerification: false,
              showAccountantBanner: false,
            },
            bootstrapVersion: '2.0.0',
            bootstrappedAt: new Date(),
            bootstrapDurationMs: 0,
          },
          'trace-uuid-downgrade'
        )
      ).toThrow('was expected to exist')
    })

    it('should track bootstrap duration', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockResolvedValue({
        data: { type: 'authenticated', userId: 'user-timing' },
      })
      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'new',
          reportId: 'val_timing_123',
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

      const result = await service.bootstrap(context)

      expect(result.bootstrapDurationMs).toBeGreaterThanOrEqual(0)
      expect(result.bootstrappedAt).toBeInstanceOf(Date)
    })

    it('should gracefully handle resolver failures', async () => {
      const context: BootstrapContext = {
        locale: 'en',
      }

      mockAuthResolver.resolve.mockRejectedValue(new Error('Auth failed'))
      mockSessionResolver.resolve.mockResolvedValue({
        data: {
          mode: 'new',
          reportId: 'val_fallback_123',
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

      // Should not throw, but return fallback state
      const result = await service.bootstrap(context)

      // Fallback state should still be valid
      expect(result.identity).toBeDefined()
      expect(result.report).toBeDefined()
      expect(result.prefillData).toBeDefined()
    })

    it('bypasses Titan result cache when delegated gate is unresolved', async () => {
      const context: BootstrapContext = {
        reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
        sourceApp: 'mercury',
        clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
        mercuryPersonaMode: 'accountant',
        locale: 'nl',
      }

      const cachedState: SessionBootstrapState = {
        identity: {
          type: 'authenticated',
          userId: 'user-1',
        },
        report: {
          mode: 'existing',
          reportId: context.reportId ?? 'report-1',
          hasExistingData: true,
          status: 'active',
        },
        prefillData: {
          sources: [],
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
        },
        ui: {
          suggestedFlow: 'manual',
          showWelcomeBack: false,
        },
      }

      const executeTitan = vi.fn().mockResolvedValue(cachedState)
      ;(
        service as unknown as {
          _executeBootstrapViaTitan: typeof executeTitan
        }
      )._executeBootstrapViaTitan = executeTitan

      const { useClientContext } = await import('../../../stores/clientContext')
      const matchingRelationshipId = 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd'
      const getStateSpy = vi.spyOn(useClientContext, 'getState')

      getStateSpy.mockReturnValue({
        isActingAsClient: true,
        accountant: { id: 'acc-1', email: 'acc@firm.be' },
        relationshipId: matchingRelationshipId,
        contextGateResolved: true,
        getContextHeaders: () => ({}),
      } as ReturnType<typeof useClientContext.getState>)

      await service.bootstrapViaTitan(context)
      expect(executeTitan).toHaveBeenCalledTimes(1)
      expect(service.hasCompletedFor(context)).toBe(true)

      executeTitan.mockClear()
      getStateSpy.mockReturnValue({
        isActingAsClient: true,
        accountant: { id: 'acc-1', email: 'acc@firm.be' },
        relationshipId: matchingRelationshipId,
        contextGateResolved: false,
        getContextHeaders: () => ({}),
      } as ReturnType<typeof useClientContext.getState>)

      await service.bootstrapViaTitan(context)
      expect(executeTitan).toHaveBeenCalledTimes(1)
    })

    it('aborts Titan bootstrap when stored relationshipId mismatches URL clientId', async () => {
      vi.useFakeTimers()

      const context: BootstrapContext = {
        reportId: 'dba236f5-31eb-4ab9-b995-e52c64dce70c',
        sourceApp: 'mercury',
        clientId: 'e25ce3b7-2e1e-4c6d-890d-eb826d527afd',
        mercuryPersonaMode: 'accountant',
        locale: 'nl',
      }

      const { useAuthStore } = await import('../../auth')
      const { useClientContext } = await import('../../../stores/clientContext')

      vi.spyOn(useAuthStore, 'getState').mockReturnValue({
        loading: false,
        isInitializing: false,
        isRefreshing: false,
        user: { id: 'user-1', role: 'accountant' },
        error: 'Failed to fetch client context',
      } as ReturnType<typeof useAuthStore.getState>)

      vi.spyOn(useClientContext, 'getState').mockReturnValue({
        isActingAsClient: true,
        accountant: { id: 'acc-1', email: 'acc@firm.be' },
        relationshipId: 'stale-client-id',
        contextGateResolved: false,
        getContextHeaders: () => ({}),
      } as ReturnType<typeof useClientContext.getState>)

      const expectation = expect(service.bootstrapViaTitan(context)).rejects.toThrow(
        'Failed to fetch client context'
      )
      await vi.runAllTimersAsync()
      await expectation

      vi.useRealTimers()
    })
  })
})
