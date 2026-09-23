import { toast } from 'sonner'
import { NetworkError } from '../types/errors'

export function isSlowSaveError(error: unknown): boolean {
  if (error instanceof NetworkError) return true
  const rawMsg = error instanceof Error ? error.message : String(error)
  const normalized = rawMsg.toLowerCase()
  return (
    normalized.includes('network') ||
    normalized.includes('unavailable') ||
    normalized.includes('timeout') ||
    normalized.includes('aborted')
  )
}

export interface SaveFailureToastOptions {
  /**
   * Re-sends the save of a result that is already calculated and shown. When set, the toast
   * says so and offers the retry instead of an error that suggests recalculating.
   */
  onRetry?: () => void
}

/** Long enough to reach the retry action; the result stays on screen meanwhile. */
const RETRYABLE_SAVE_TOAST_MS = 20_000

export function toastSaveFailure(
  error: unknown,
  tReport: (key: string) => string,
  options: SaveFailureToastOptions = {}
): void {
  if (options.onRetry) {
    toast.warning(tReport(isSlowSaveError(error) ? 'saveStillInProgress' : 'saveResultNotSaved'), {
      description: tReport('saveResultRetryDesc'),
      duration: RETRYABLE_SAVE_TOAST_MS,
      action: { label: tReport('saveRetry'), onClick: options.onRetry },
    })
    return
  }

  if (isSlowSaveError(error)) {
    toast.error(tReport('saveStillInProgress'), {
      description: tReport('saveStillInProgressDesc'),
      duration: 8000,
    })
    return
  }

  const errMsg = error instanceof Error ? error.message : String(error)
  toast.error(tReport('saveReportFailed'), { description: errMsg })
}
