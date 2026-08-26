/**
 * useManualSubmitErrorHandler — pins the typed-code → toast contract.
 *
 * This hook routes server errors (ValidationError / CreditError / ...) into
 * sonner toasts. The structured `error.context.code` branches are the
 * cross-app contract with Titan and python — if Titan/python ship a new
 * `code`, this hook is where it gets translated into a typed UI surface.
 *
 * Coverage focus:
 * 1. EXTREME_MULTIPLE (existing) — pre-existing dormant test pin.
 * 2. BENCHMARK_CONTRACT_REQUIRED (new) — uses dedicated i18n keys.
 * 3. via_503_passthrough flag is logged correctly.
 * 4. Generic fallthrough still works for unmapped server errors.
 * 5. Stale-submit run short-circuit doesn't fire a toast.
 */

import { renderHook } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AuthenticationError,
  CreditError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import { useManualSubmitErrorHandler } from './useManualSubmitErrorHandler'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('../../../utils/logger', () => ({
  generalLogger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

// isAuthError + isSlowSaveError both return false in tests by default; the
// hook then routes to its catch-all branches.
vi.mock('../../../utils/errorDetection', () => ({
  isAuthError: vi.fn(() => false),
}))
vi.mock('../../../utils/saveErrorHandling', () => ({
  isSlowSaveError: vi.fn(() => false),
}))

// Identity translator so test assertions can grep on the key directly.
const translate = (key: string) => key
const translateErrors = (key: string) => key
const translatePreparer = (key: string) => key

function makeStillTargetRun(): ManualSubmitRun {
  return {
    isStillTarget: () => true,
    endLoading: vi.fn(),
    staleContext: () => ({}),
  } as unknown as ManualSubmitRun
}

function makeStaleRun(): ManualSubmitRun {
  return {
    isStillTarget: () => false,
    endLoading: vi.fn(),
    staleContext: () => ({ stale: true }),
  } as unknown as ManualSubmitRun
}

function callHandler(error: unknown, submitRun: ManualSubmitRun = makeStillTargetRun()) {
  const { result } = renderHook(() =>
    useManualSubmitErrorHandler({ translate, translateErrors, translatePreparer })
  )
  const retrySubmit = vi.fn()
  result.current.handleManualSubmitError({ error, retrySubmit, submitRun })
  return { retrySubmit, submitRun }
}

describe('useManualSubmitErrorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens recovery instead of offering a blind retry for reconnect-required 409s', () => {
    const onAccountingReconnectRequired = vi.fn()
    const { result } = renderHook(() =>
      useManualSubmitErrorHandler({
        translate,
        translateErrors,
        translatePreparer,
        onAccountingReconnectRequired,
      })
    )
    const submitRun = makeStillTargetRun()
    result.current.handleManualSubmitError({
      error: new ValidationError('Reconnect Silverfin', undefined, undefined, {
        status: 409,
        code: 'ACCOUNTING_RECONNECT_REQUIRED',
        provider: 'silverfin',
      }),
      retrySubmit: vi.fn(),
      submitRun,
    })

    expect(onAccountingReconnectRequired).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'ACCOUNTING_RECONNECT_REQUIRED' })
    )
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('focuses the affected financial year inline instead of showing a terminal toast', () => {
    const listener = vi.fn()
    window.addEventListener('venus:financial-review-required', listener)

    callHandler(
      new ValidationError('Review imported expenses', undefined, undefined, {
        status: 409,
        code: 'FINANCIAL_REVIEW_REQUIRED',
        fiscalYear: 2024,
      })
    )

    expect(listener).toHaveBeenCalledTimes(1)
    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ fiscalYear: 2024 })
    expect(toast.error).not.toHaveBeenCalled()
    window.removeEventListener('venus:financial-review-required', listener)
  })

  it('routes tax-latency contract errors to localized review recovery', () => {
    const listener = vi.fn()
    window.addEventListener('venus:tax-latency-review-required', listener)

    callHandler(
      new ValidationError('Validation failed', 'tax_latencies.0.tax_rate', undefined, {
        code: 'TAX_LATENCY_FIELD_CONFLICT',
        correlationId: 'cid-tax-1',
      })
    )

    expect(toast.error).toHaveBeenCalledWith(
      'taxLatencyReviewRequired',
      expect.objectContaining({
        description: 'taxLatencyReviewRequiredDesc',
        action: expect.objectContaining({ label: 'review' }),
      })
    )
    const options = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]?.[1]
    options.action.onClick()
    expect(listener).toHaveBeenCalledTimes(1)

    window.removeEventListener('venus:tax-latency-review-required', listener)
  })

  describe('BENCHMARK_CONTRACT_REQUIRED', () => {
    it('renders the dedicated i18n keys and a Retry action when Titan returns 422', () => {
      const error = new ValidationError('A business type is required', undefined, undefined, {
        status: 422,
        code: 'BENCHMARK_CONTRACT_REQUIRED',
      })

      const { retrySubmit } = callHandler(error)

      expect(toast.error).toHaveBeenCalledTimes(1)
      const [title, options] = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(title).toBe('benchmarkContractRequired')
      expect(options.description).toBe('benchmarkContractRequiredDesc')
      expect(options.action.label).toBe('retry')
      // Retry action wires through to the caller's retrySubmit
      options.action.onClick()
      expect(retrySubmit).toHaveBeenCalledTimes(1)
    })

    it('renders the same toast whether the code came from 422 or 503 pass-through', async () => {
      const { generalLogger } = await import('../../../utils/logger')
      const error503 = new ValidationError(
        'Valuation calculation failed: Resolved benchmark contract required',
        undefined,
        undefined,
        {
          status: 503,
          code: 'BENCHMARK_CONTRACT_REQUIRED',
          via_503_passthrough: true,
        }
      )

      callHandler(error503)

      expect(toast.error).toHaveBeenCalledWith(
        'benchmarkContractRequired',
        expect.objectContaining({ description: 'benchmarkContractRequiredDesc' })
      )
      // Log carries the via503 flag so post-mortems can tell which layer caught it
      expect(generalLogger.warn).toHaveBeenCalledWith(
        '[ManualValuationWorkspace] BENCHMARK_CONTRACT_REQUIRED',
        expect.objectContaining({ via503: true })
      )
    })

    it('logs via503=false when 422 was caught at the Titan guard (no pass-through)', async () => {
      const { generalLogger } = await import('../../../utils/logger')
      const error = new ValidationError('msg', undefined, undefined, {
        status: 422,
        code: 'BENCHMARK_CONTRACT_REQUIRED',
        // no via_503_passthrough field
      })

      callHandler(error)

      expect(generalLogger.warn).toHaveBeenCalledWith(
        '[ManualValuationWorkspace] BENCHMARK_CONTRACT_REQUIRED',
        expect.objectContaining({ via503: false })
      )
    })
  })

  describe('EXTREME_MULTIPLE (pre-existing branch — pin to prevent regression)', () => {
    it('uses the preparer namespace and shows server message as description', () => {
      const error = new ValidationError(
        'Multiple 18× is outside the p10–p90 guardrail.',
        undefined,
        undefined,
        { status: 422, code: 'EXTREME_MULTIPLE' }
      )

      callHandler(error)

      expect(toast.error).toHaveBeenCalledWith(
        'extremeServerToast',
        expect.objectContaining({
          description: 'Multiple 18× is outside the p10–p90 guardrail.',
        })
      )
    })
  })

  describe('stale submit run', () => {
    it('does not fire a toast when the run is no longer the target', () => {
      const error = new ValidationError('whatever', undefined, undefined, {
        status: 422,
        code: 'BENCHMARK_CONTRACT_REQUIRED',
      })

      callHandler(error, makeStaleRun())

      expect(toast.error).not.toHaveBeenCalled()
    })
  })

  describe('non-typed errors keep their existing routing', () => {
    it('CreditError → insufficientCredits toast', () => {
      callHandler(new CreditError('Out of credits'))
      expect(toast.error).toHaveBeenCalledWith(
        'calculation.insufficientCredits',
        expect.any(Object)
      )
    })

    it('RateLimitError → rateLimit toast', () => {
      callHandler(new RateLimitError('Too many requests'))
      expect(toast.error).toHaveBeenCalledWith('rateLimit.title', expect.any(Object))
    })

    it('AuthenticationError → session.expired toast with reload action', () => {
      callHandler(new AuthenticationError('expired'))
      const [title, options] = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(title).toBe('session.expired')
      expect(options.action.label).toBe('session.reloadPage')
    })

    it('NetworkError → serviceUnavailable title with raw message as description', () => {
      callHandler(new NetworkError('Service temporarily unavailable'))
      const [title, options] = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(title).toBe('serviceUnavailable')
      expect(options.description).toBe('Service temporarily unavailable')
    })

    it('unknown ValidationError without a code falls through to calculationFailed', () => {
      // Critical regression pin: a ValidationError without `code` must NOT
      // hit the EXTREME_MULTIPLE or BENCHMARK branches — those check the
      // exact code string. A bare ValidationError (e.g. 400 from Titan with
      // no code) falls through to the generic calculationFailed toast.
      const error = new ValidationError('Some other validation error', undefined, undefined, {
        status: 400,
      })

      callHandler(error)
      const [title] = (toast.error as ReturnType<typeof vi.fn>).mock.calls[0]
      expect(title).toBe('calculationFailed')
    })
  })
})
