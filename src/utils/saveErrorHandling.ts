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

export function toastSaveFailure(
  error: unknown,
  tReport: (key: string) => string
): void {
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
