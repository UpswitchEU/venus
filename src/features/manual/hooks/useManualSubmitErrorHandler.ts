import { useCallback } from 'react'
import { toast } from 'sonner'
import {
  AuthenticationError,
  CreditError,
  RateLimitError,
  ValidationError,
} from '../../../types/errors'
import { isAuthError } from '../../../utils/errorDetection'
import { generalLogger } from '../../../utils/logger'
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
      const title = isSessionExpired
        ? translateErrors('session.expired')
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
