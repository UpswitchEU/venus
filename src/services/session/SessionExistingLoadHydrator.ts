import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { createContextLogger } from '../../utils/logger'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import {
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
} from '../../utils/sessionHelpers'
import { validateSessionData } from '../../utils/sessionValidation'
import {
  backfillSparseSessionFromStoreSeed,
  fetchBusinessCardData,
  mergeBusinessCardIntoSession,
  sessionDataIndicatesUsableFormInputs,
} from './SessionSparseBackfill'

const logger = createContextLogger('SessionService')

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function hydrateExistingValuationSession(
  reportId: string,
  session: ValuationSession,
  prefilledQuery?: string | null
): Promise<ValuationSession> {
  validateSessionData(session)

  const normalizedSession = normalizeSessionDates(session)
  const mergedSession = mergeSessionFields(normalizedSession)
  await backfillSparseSessionFromStoreSeed(reportId, mergedSession)

  const mergedSessionData = asRecord(mergedSession.sessionData) ?? {}
  const companyName = optionalString(mergedSessionData.company_name)
  const hasCompanyName = companyName && companyName.trim() !== ''
  const hasBusinessCardData = !!(
    hasCompanyName ||
    mergedSessionData.business_type_id ||
    mergedSessionData.founding_year ||
    mergedSessionData.country_code
  )

  if (hasBusinessCardData && hasCompanyName) {
    logger.debug('Business card data preserved in existing session', {
      reportId,
      company_name: mergedSessionData.company_name,
      business_type_id: mergedSessionData.business_type_id,
    })
  } else {
    const clientContext = asRecord(mergedSessionData._client_context)
    const clientUserId = optionalString(clientContext?.client_user_id)

    if (clientUserId) {
      logger.debug('Fetching business card (fallback) for existing session', {
        reportId,
        clientUserId: `${clientUserId.substring(0, 8)}...`,
      })
      const businessCardData = await fetchBusinessCardData(clientUserId)
      if (businessCardData) {
        mergeBusinessCardIntoSession(mergedSession, businessCardData, clientContext)
        logger.debug('Business card merged into existing session', {
          reportId,
          fieldsAdded: Object.keys(businessCardData).length,
        })
      }
    }
  }

  const sessionPrefilledQuery =
    optionalString(mergedSessionData._prefilledQuery) ||
    optionalString(asRecord(mergedSession.partialData)?._prefilledQuery) ||
    null
  const effectivePrefilledQuery = sessionPrefilledQuery || prefilledQuery

  if (!sessionPrefilledQuery && prefilledQuery) {
    logger.warn(
      '[DEPRECATED] Reading prefilledQuery from URL parameter. This should be stored in session_data._prefilledQuery',
      {
        reportId,
        note: 'Migrating URL-based prefilledQuery to session data on first load',
      }
    )
  }

  if (effectivePrefilledQuery) {
    mergedSession.partialData = mergePrefilledQuery(
      mergedSession.partialData,
      effectivePrefilledQuery
    )
    if (!asRecord(mergedSession.sessionData)?._prefilledQuery) {
      mergedSession.sessionData = {
        ...mergedSession.sessionData,
        _prefilledQuery: effectivePrefilledQuery,
      } as Partial<ValuationRequest>
    }
  }

  const clientContext = asRecord(asRecord(mergedSession.sessionData)?._client_context)
  const clientUserIdForLog = optionalString(clientContext?.client_user_id)
  const accountantUserIdForLog = optionalString(clientContext?.accountant_user_id)
  const relationshipIdForLog = optionalString(clientContext?.relationship_id)
  const hasFullDelegatedContext =
    clientUserIdForLog && accountantUserIdForLog && relationshipIdForLog
  const hasPendingInviteContext =
    clientUserIdForLog == null && accountantUserIdForLog && relationshipIdForLog

  if (hasFullDelegatedContext || hasPendingInviteContext) {
    logger.debug(
      'Session contains client context - backend should allow access via _client_context',
      {
        reportId,
        clientUserId: clientUserIdForLog
          ? `${clientUserIdForLog.substring(0, 8)}...`
          : 'null (pending)',
        accountantUserId: `${accountantUserIdForLog?.substring(0, 8)}...`,
        relationshipId: `${relationshipIdForLog?.substring(0, 8)}...`,
        note: 'Backend access check should work even if headers are not sent',
      }
    )
  }

  const hasSessionData = !!mergedSession.sessionData
  const sessionDataKeys = mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : []
  const sessionData = mergedSession.sessionData || {}
  const hasFormFields = hasSessionData && sessionDataIndicatesUsableFormInputs(sessionData)

  globalSessionCache.set(reportId, mergedSession)

  logger.debug('Session loaded from backend and cached', {
    reportId,
    currentView: mergedSession.currentView,
    hasPrefilledQuery: !!effectivePrefilledQuery,
    prefilledQuerySource: sessionPrefilledQuery ? 'session_data' : prefilledQuery ? 'url' : 'none',
    hasSessionData,
    hasFormFields,
    sessionDataKeysCount: sessionDataKeys.length,
    sessionDataKeys: sessionDataKeys.slice(0, 5),
    note: 'Form fields (sessionData) included in cache for instant restoration on revisit',
  })

  return mergedSession
}
