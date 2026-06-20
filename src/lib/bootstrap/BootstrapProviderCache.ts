import { getBootstrapContextCacheKey, getBootstrapReportCacheKey } from './contextCacheKey'
import type { BootstrapContext, SessionBootstrapState } from './types'

let bootstrapCompletedGlobally = false
let lastGlobalResult: SessionBootstrapState | null = null
let lastGlobalContextKey: string | null = null

export function hasScopedGlobalBootstrapResult(): boolean {
  return bootstrapCompletedGlobally
}

export function getScopedGlobalBootstrapReportId(): string | null {
  return lastGlobalResult?.report.reportId ?? null
}

export function clearScopedGlobalBootstrapResult(): void {
  bootstrapCompletedGlobally = false
  lastGlobalResult = null
  lastGlobalContextKey = null
}

export function getScopedGlobalBootstrapResult(
  context: BootstrapContext | null | undefined
): SessionBootstrapState | null {
  const requestedContextKey = getBootstrapContextCacheKey(context)
  const requestedReportKey = getBootstrapReportCacheKey(context?.reportId)
  if (
    !bootstrapCompletedGlobally ||
    lastGlobalContextKey !== requestedContextKey ||
    !lastGlobalResult
  ) {
    return null
  }

  // Do not hydrate /reports/new from an immortal module cache. The service TTL
  // handles short remount deduplication for new report creation.
  if (requestedReportKey === 'new') {
    return null
  }

  const returnedId = lastGlobalResult.report.reportId?.trim()
  return returnedId === requestedReportKey ? lastGlobalResult : null
}

export function rememberScopedGlobalBootstrapResult(
  context: BootstrapContext | null | undefined,
  result: SessionBootstrapState
): void {
  const requestedContextKey = getBootstrapContextCacheKey(context)
  const requestedReportKey = getBootstrapReportCacheKey(context?.reportId)
  const returnedId = result.report.reportId?.trim()

  if (requestedReportKey === 'new' || returnedId !== requestedReportKey) {
    clearScopedGlobalBootstrapResult()
    return
  }

  bootstrapCompletedGlobally = true
  lastGlobalResult = result
  lastGlobalContextKey = requestedContextKey
}
