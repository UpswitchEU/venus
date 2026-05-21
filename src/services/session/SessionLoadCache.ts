import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { dateLikeToUnixMs } from '../../utils/date-like'
import { createContextLogger } from '../../utils/logger'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { mergePrefilledQuery } from '../../utils/sessionHelpers'
import { validateSessionData } from '../../utils/sessionValidation'
import { revalidateSessionCacheInBackground } from './SessionBackgroundRevalidation'
import { sessionDataIndicatesUsableFormInputs } from './SessionSparseBackfill'

const logger = createContextLogger('SessionService')

export type CachedSessionLoadResult =
  | { status: 'miss' }
  | { session: ValuationSession; status: 'hit' }

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function revalidateAndLog(reportId: string, failureMessage: string): void {
  revalidateSessionCacheInBackground(reportId).catch((err) => {
    logger.warn(failureMessage, {
      reportId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

export function loadCachedValuationSession(
  reportId: string,
  prefilledQuery: string | null | undefined,
  startTime: number
): CachedSessionLoadResult {
  const cachedSession = globalSessionCache.get(reportId)
  if (!cachedSession) {
    return { status: 'miss' }
  }

  const loadTime = performance.now() - startTime
  const updatedMs = dateLikeToUnixMs(cachedSession.updatedAt)
  const cacheAge_minutes =
    updatedMs !== null ? Math.floor((Date.now() - updatedMs) / (60 * 1000)) : 0
  const hasSessionData = !!cachedSession.sessionData
  const sessionDataKeys = cachedSession.sessionData ? Object.keys(cachedSession.sessionData) : []
  const sessionData = cachedSession.sessionData || {}
  const hasFormFields = hasSessionData && sessionDataIndicatesUsableFormInputs(sessionData)
  const isMetadataOnlyCache =
    !hasFormFields && !cachedSession.valuationResult && !cachedSession.htmlReport

  logger.debug('Session loaded from cache (instant)', {
    reportId,
    loadTime_ms: loadTime.toFixed(2),
    cacheAge_minutes,
    hasSessionData,
    hasFormFields,
    isMetadataOnlyCache,
    sessionDataKeysCount: sessionDataKeys.length,
    sessionDataKeys: sessionDataKeys.slice(0, 5),
    note: isMetadataOnlyCache
      ? 'Browser cache is metadata-only; authoritative payload will be revalidated from Titan.'
      : 'Form fields (sessionData) included in cache for instant restoration',
  })

  validateSessionData(cachedSession)

  const effectivePrefilledQuery =
    optionalString(asRecord(cachedSession.sessionData)?._prefilledQuery) || prefilledQuery

  if (effectivePrefilledQuery) {
    const updatedPartialData = mergePrefilledQuery(
      cachedSession.partialData,
      effectivePrefilledQuery
    )
    if (updatedPartialData !== cachedSession.partialData) {
      const updatedSession = {
        ...cachedSession,
        partialData: updatedPartialData,
      }
      if (!asRecord(updatedSession.sessionData)?._prefilledQuery) {
        updatedSession.sessionData = {
          ...updatedSession.sessionData,
          _prefilledQuery: effectivePrefilledQuery,
        } as Partial<ValuationRequest>
      }
      globalSessionCache.set(reportId, updatedSession)
      return { session: updatedSession, status: 'hit' }
    }
  }

  if (isMetadataOnlyCache || cacheAge_minutes > 5) {
    logger.debug('Cache requires Titan revalidation', {
      reportId,
      cacheAge_minutes,
      isMetadataOnlyCache,
    })
    revalidateAndLog(reportId, 'Background cache revalidation failed')
  }

  if (!cachedSession.htmlReport) {
    const sessionDataRecord = asRecord(cachedSession.sessionData)
    const hasValuationResult = sessionDataRecord?.valuation_result || cachedSession.valuationResult

    if (hasValuationResult) {
      logger.debug('Cache missing HTML reports for completed valuation, fetching immediately', {
        reportId,
        hasValuationResult: true,
        cacheAge_minutes,
      })
      revalidateAndLog(reportId, 'Background HTML fetch failed')
    }
  }

  return { session: cachedSession, status: 'hit' }
}
