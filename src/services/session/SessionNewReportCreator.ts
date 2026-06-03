import { getBootstrapReportMode } from '../../lib/bootstrap/bootstrapReportModeRegistry'
import { ValidationError } from '../../types/errors'
import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { isUuid } from '../../utils/identifiers'
import { createContextLogger } from '../../utils/logger'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import {
  mergePrefilledQuery,
  mergeSessionFields,
  normalizeSessionDates,
} from '../../utils/sessionHelpers'
import { validateSessionData } from '../../utils/sessionValidation'
import { backendAPI } from '../backendApi'
import { checkValuationCreationAllowed } from './SessionPlanEnforcement'
import { fetchBusinessCardData, mergeBusinessCardIntoSession } from './SessionSparseBackfill'

const logger = createContextLogger('SessionService')

export type SessionFlow = 'conversational' | 'manual'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

async function bootstrapIndicatesNewReport(reportId: string): Promise<boolean> {
  const bootstrapMode = getBootstrapReportMode(reportId)
  if (bootstrapMode) {
    return bootstrapMode === 'new'
  }

  if (isUuid(reportId)) {
    logger.warn('No bootstrap state for UUID report - refusing session creation fallback', {
      reportId,
      note: 'UUIDs are existing Mercury report lookups; creating a session would mask a failed lookup.',
    })
    return false
  }

  logger.warn(
    'No bootstrap state for session-key report - allowing legacy draft creation fallback',
    {
      reportId,
    }
  )
  return true
}

function throwCategorizedSessionCreationError(reportId: string, createError: unknown): never {
  const errorMessage = createError instanceof Error ? createError.message : String(createError)

  if (
    errorMessage.includes('paywall') ||
    errorMessage.includes('limit') ||
    errorMessage.includes('plan')
  ) {
    logger.warn('Session creation blocked by plan enforcement', {
      reportId,
      error: errorMessage,
    })
    throw createError
  }

  if (
    errorMessage.includes('401') ||
    errorMessage.includes('Unauthorized') ||
    errorMessage.includes('authentication')
  ) {
    logger.error('Session creation failed - authentication required', {
      reportId,
      error: errorMessage,
    })
    throw new Error('Authentication required. Please log in to continue.')
  }

  if (
    errorMessage.includes('uuid') ||
    errorMessage.includes('database') ||
    errorMessage.includes('42804') ||
    errorMessage.includes('42883') ||
    errorMessage.includes('column') ||
    errorMessage.includes('type uuid but expression is of type text')
  ) {
    logger.error('Database error during session creation', {
      reportId,
      error: errorMessage,
    })
    throw new Error(
      'Unable to create session due to a technical issue. Please try again or contact support if the problem persists.'
    )
  }

  if (
    errorMessage.includes('Network') ||
    errorMessage.includes('fetch') ||
    errorMessage.includes('timeout')
  ) {
    logger.error('Session creation failed - network error', {
      reportId,
      error: errorMessage,
    })
    throw new Error('Network error. Please check your connection and try again.')
  }

  if (
    errorMessage.includes('validation') ||
    errorMessage.includes('invalid') ||
    errorMessage.includes('userId must be provided') ||
    errorMessage.includes('Authentication required') ||
    errorMessage.includes('must be provided')
  ) {
    logger.error('Session creation failed - validation error (non-retryable)', {
      reportId,
      error: errorMessage,
    })
    throw new ValidationError(`Invalid session data: ${errorMessage}`)
  }

  logger.error('Session creation failed - unknown error', {
    reportId,
    error: errorMessage,
  })
  throw new Error(`Failed to create session: ${errorMessage}`)
}

export async function createSessionForNewReportIfAllowed(
  reportId: string,
  flow?: SessionFlow,
  prefilledQuery?: string | null
): Promise<ValuationSession | null> {
  const isNewReport = await bootstrapIndicatesNewReport(reportId)

  if (!isNewReport) {
    logger.warn('Session not found and not a new report - may have been deleted', {
      reportId,
      note: 'Not creating new session to avoid restoring deleted reports',
    })
    return null
  }

  logger.debug('Session not found, creating new session', {
    requestedReportId: reportId,
    flow,
    isNewReport: true,
  })

  try {
    await checkValuationCreationAllowed()

    const prefilledSessionData = prefilledQuery
      ? ({ _prefilledQuery: prefilledQuery } as Partial<ValuationRequest>)
      : {}
    const createResponse = await backendAPI.createValuationSession({
      reportId,
      session_key: reportId,
      currentView: flow || 'manual',
      sessionData: prefilledSessionData,
      partialData: prefilledSessionData,
    } as unknown as ValuationSession)

    if (!createResponse?.session) {
      logger.error('Failed to create new session', { requestedReportId: reportId })
      return null
    }

    const createResponseRecord = asRecord(createResponse)
    const createdSessionRecord = asRecord(createResponse.session)
    const actualReportId =
      createResponse.reportId ||
      createResponse.session?.reportId ||
      optionalString(createdSessionRecord?.session_key) ||
      optionalString(createResponseRecord?.session_key)

    if (!actualReportId) {
      logger.error('Backend did not return session_key/reportId', {
        response: createResponse,
        responseKeys: Object.keys(createResponse),
        sessionKeys: createResponse.session ? Object.keys(createResponse.session) : [],
      })
      return null
    }

    logger.debug('New session created successfully', {
      requestedReportId: reportId,
      actualReportId: actualReportId,
      currentView: createResponse.session.currentView,
      hasPrefilledQuery: !!prefilledQuery,
      sessionKeyMatches: actualReportId === reportId,
    })

    validateSessionData(createResponse.session)
    const normalizedSession = normalizeSessionDates(createResponse.session)
    const mergedSession = mergeSessionFields(normalizedSession)

    mergedSession.reportId = actualReportId

    if (actualReportId !== reportId) {
      logger.warn('Titan generated different session_key than requested', {
        requestedReportId: reportId,
        actualReportId: actualReportId,
        note: 'This should not happen if forcedSessionKey is working correctly',
      })

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href)
        url.pathname = url.pathname.replace(reportId, actualReportId)
        logger.debug('Redirecting to correct session URL', {
          from: reportId,
          to: actualReportId,
          newUrl: url.toString(),
        })
        window.history.replaceState({}, '', url.toString())
      }
    }

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
      logger.debug('Business card data preserved in session', {
        reportId,
        company_name: mergedSessionData.company_name,
        business_type_id: mergedSessionData.business_type_id,
        founding_year: mergedSessionData.founding_year,
        country_code: mergedSessionData.country_code,
      })
    } else {
      logger.debug('No business card data in merged session (or company_name is empty)', {
        reportId,
        hasSessionData: !!mergedSession.sessionData,
        hasCompanyName,
        companyName,
        sessionDataKeys: mergedSession.sessionData ? Object.keys(mergedSession.sessionData) : [],
      })
    }

    mergedSession.reportId = actualReportId

    if (prefilledQuery) {
      mergedSession.partialData = mergePrefilledQuery(mergedSession.partialData, prefilledQuery)
    }

    const clientContext = asRecord(mergedSessionData._client_context)
    const clientUserId = optionalString(clientContext?.client_user_id)

    if (!hasCompanyName && clientUserId) {
      logger.debug('Fetching business card (fallback) after session creation', {
        reportId: actualReportId,
        clientUserId: `${clientUserId.substring(0, 8)}...`,
      })
      const businessCardData = await fetchBusinessCardData(clientUserId)
      if (businessCardData) {
        mergeBusinessCardIntoSession(mergedSession, businessCardData, clientContext)
        logger.debug('Business card merged after session creation', {
          reportId: actualReportId,
          fieldsAdded: Object.keys(businessCardData).length,
        })
      }
    }

    if (!mergedSession.partialData || Object.keys(mergedSession.partialData).length === 0) {
      mergedSession.partialData = mergedSession.sessionData ? { ...mergedSession.sessionData } : {}
    }

    globalSessionCache.set(actualReportId, mergedSession)

    return mergedSession
  } catch (createError) {
    throwCategorizedSessionCreationError(reportId, createError)
  }
}
