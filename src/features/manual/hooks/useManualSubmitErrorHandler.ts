import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  AuthenticationError,
  CreditError,
  NetworkError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import { isAuthError } from '../../../utils/errorDetection'
import { generalLogger } from '../../../utils/logger'
import { isSlowSaveError } from '../../../utils/saveErrorHandling'
import type { ManualSubmitRun } from './useManualSubmitRunGuard'

type ManualSubmitToastTranslator = (key: string) => string

export interface HandleManualSubmitErrorParams {
  error: unknown
  retrySubmit: () => void
  submitRun: ManualSubmitRun
}

export interface UseManualSubmitErrorHandlerParams {
  translate: ManualSubmitToastTranslator
  translateErrors: ManualSubmitToastTranslator
  translatePreparer: ManualSubmitToastTranslator
}

export interface UseManualSubmitErrorHandlerResult {
  handleManualSubmitError: (params: HandleManualSubmitErrorParams) => void
}

export function useManualSubmitErrorHandler({
  translate,
  translateErrors,
  translatePreparer,
}: UseManualSubmitErrorHandlerParams): UseManualSubmitErrorHandlerResult {
  const handleManualSubmitError = useCallback(
    ({ error, retrySubmit, submitRun }: HandleManualSubmitErrorParams) => {
      if (!submitRun.isStillTarget()) {
        submitRun.endLoading()
        generalLogger.info('[ManualLayout] Dropping stale manual calculation error', {
          ...submitRun.staleContext(),
        })
        return
      }

      submitRun.endLoading()

      if (error instanceof ValidationError && error.context?.code === 'EXTREME_MULTIPLE') {
        toast.error(translatePreparer('extremeServerToast'), {
          description: error.message,
        })
        generalLogger.warn('[ManualLayout] EXTREME_MULTIPLE rejected by Titan', {
          message: error.message,
        })
        return
      }

      // BENCHMARK_CONTRACT_REQUIRED — either Titan's preflight guard caught it
      // (422 when business_type_id is missing) or python's preflight fired and
      // Titan tunneled the code through the 503 wrapper. Render a typed toast
      // so the user knows to re-pick a business type instead of seeing a
      // generic "Service unavailable". Same `error.context.code` contract as
      // EXTREME_MULTIPLE above.
      if (
        error instanceof ValidationError &&
        error.context?.code === 'BENCHMARK_CONTRACT_REQUIRED'
      ) {
        toast.error(translate('benchmarkContractRequired'), {
          description: translate('benchmarkContractRequiredDesc'),
          action: {
            label: translate('retry'),
            onClick: retrySubmit,
          },
        })
        generalLogger.warn('[ManualLayout] BENCHMARK_CONTRACT_REQUIRED', {
          // Keep the server message in logs (English, useful for support /
          // Cowork sessions) even though we show a localized toast.
          serverMessage: error.message,
          via503: Boolean(
            (error.context as { via_503_passthrough?: boolean })?.via_503_passthrough
          ),
        })
        return
      }

      if (error instanceof CreditError) {
        toast.error(translateErrors('calculation.insufficientCredits'), {
          description: error.message,
        })
        generalLogger.warn('[ManualLayout] Insufficient credits for calculation', {
          message: error.message,
        })
        return
      }

      if (error instanceof RateLimitError) {
        toast.error(translateErrors('rateLimit.title'), {
          description: error.message || translateErrors('rateLimit.description'),
        })
        generalLogger.warn('[ManualLayout] Rate limited during calculation', {
          message: error.message,
        })
        return
      }

      const isSessionExpired = error instanceof AuthenticationError || isAuthError(error)
      const isNetworkFailure = error instanceof NetworkError || isSlowSaveError(error)
      const title = isSessionExpired
        ? translateErrors('session.expired')
        : isNetworkFailure
          ? translate('serviceUnavailable')
          : translate('calculationFailed')
      const description = isSessionExpired
        ? translateErrors('authentication.expired')
        : error instanceof Error
          ? error.message
          : translate('unknownError')

      toast.error(title, {
        description,
        action: isSessionExpired
          ? {
              label: translateErrors('session.reloadPage'),
              onClick: () => window.location.reload(),
            }
          : {
              label: translate('retry'),
              onClick: retrySubmit,
            },
      })
      generalLogger.error('[ManualLayout] Form submission failed', {
        error: description,
        isSessionExpired,
      })
    },
    [translate, translateErrors, translatePreparer]
  )

  return { handleManualSubmitError }
}
