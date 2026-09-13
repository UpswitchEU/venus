import type { ValuationSessionResponse } from '../../types/api-responses'
import { ApplicationError, NetworkError, NotFoundError, ValidationError } from '../../types/errors'
import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { getErrorMessage } from '../../utils/errors/errorConverter'
import { createContextLogger } from '../../utils/logger'
import { globalSessionCache } from '../../utils/sessionCacheManager'
import { mergeSessionFields, normalizeSessionDates } from '../../utils/sessionHelpers'
import { stripReportBlobsFromSessionPatch } from '../../utils/stripReportBlobsFromSessionPatch'
import { validateOptionalValuationCompanyGraphContext } from '../../utils/valuationCompanyGraphContext'
import { backendAPI } from '../backendApi'

const logger = createContextLogger('SessionService')

type SessionExtensionUpdates = {
  [key: `_${string}`]: unknown
}

export type SaveSessionUpdates = Partial<ValuationRequest> &
  Partial<Pick<ValuationSession, 'currentView' | 'name'>> &
  SessionExtensionUpdates

type LoadSessionForSave = (reportId: string) => Promise<ValuationSession | null>

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export async function saveValuationSession(
  reportId: string,
  updates: SaveSessionUpdates,
  loadSession: LoadSessionForSave
): Promise<ValuationSession> {
  const startTime = performance.now()

  try {
    const { pendingReportAssetSave } = await import('../report/ReportAssetService')
    const pendingSave = pendingReportAssetSave(reportId)
    if (pendingSave) {
      logger.debug('Waiting for pending asset save before reloading session', {
        reportId,
        note: 'Preventing race condition - asset save must complete before session reload',
      })
      await pendingSave
    }

    logger.debug('Saving session', {
      reportId,
      updateKeys: Object.keys(updates),
    })

    const { useSessionStore } = await import('../../store/useSessionStore')
    const storeState = useSessionStore.getState()
    const currentSession = storeState.session
    const currentSessionData = asRecord(currentSession?.sessionData)
    const isBootstrapCreated = !!currentSessionData?._bootstrapCreated
    const updatesRecord = updates as Record<string, unknown>
    const currentView = updates.currentView || currentSession?.currentView || 'manual'
    const hasExplicitName = Object.hasOwn(updatesRecord, 'name')
    const name = hasExplicitName ? optionalString(updatesRecord.name) : currentSession?.name
    const { currentView: _, name: __, ...sessionDataWithoutView } = updatesRecord
    const sessionData = asRecord(updatesRecord.sessionData) ?? sessionDataWithoutView
    validateOptionalValuationCompanyGraphContext(sessionData.company_graph_context)

    let response: ValuationSessionResponse

    if (isBootstrapCreated) {
      logger.debug('Creating session (bootstrap-created, first save)', {
        reportId,
        hasSessionData: !!sessionData,
      })

      let mergedSessionData: Record<string, unknown> = {
        ...(currentSessionData || {}),
        ...sessionData,
        _bootstrapCreated: undefined,
      }

      try {
        const { useClientContext } = await import('../../stores/clientContext')
        const clientContext = useClientContext.getState()

        if (
          clientContext.isActingAsClient &&
          clientContext.client &&
          clientContext.accountant &&
          clientContext.relationshipId
        ) {
          mergedSessionData._client_context = {
            client_user_id: clientContext.client.id,
            accountant_user_id: clientContext.accountant.id,
            relationship_id: clientContext.relationshipId,
          }

          logger.debug('Including client context in session creation', {
            reportId,
            clientUserId: `${clientContext.client.id.substring(0, 8)}...`,
            accountantUserId: `${clientContext.accountant.id.substring(0, 8)}...`,
          })
        }
      } catch (error) {
        logger.warn('Failed to get client context for session creation (non-critical)', {
          reportId,
          error: error instanceof Error ? error.message : String(error),
        })
      }

      response = await backendAPI.createValuationSession({
        session_key: reportId,
        reportId,
        currentView,
        ...(name !== undefined && { name }),
        sessionData: stripReportBlobsFromSessionPatch(
          mergedSessionData
        ) as unknown as Partial<ValuationRequest>,
      } as unknown as ValuationSession)

      if (response?.session) {
        const currentStoreSession = storeState.session
        if (currentStoreSession?.reportId === reportId) {
          const updatedSessionData = {
            ...(asRecord(currentStoreSession.sessionData) || {}),
            _bootstrapCreated: undefined,
          }
          storeState.hydrateSession({
            sessionData: updatedSessionData as Partial<ValuationRequest>,
          })
          logger.debug('Removed _bootstrapCreated flag after successful creation', {
            reportId,
          })
        }
      }
    } else {
      const sessionUpdates: Partial<ValuationSession> = {
        sessionData: stripReportBlobsFromSessionPatch(
          sessionData
        ) as unknown as Partial<ValuationRequest>,
        ...(currentView && { currentView }),
        ...(name !== undefined && { name }),
      }

      response = await backendAPI.updateValuationSession(reportId, sessionUpdates)
    }

    let mergedSession: ValuationSession

    if (response?.session) {
      const normalizedSession = normalizeSessionDates(response.session)
      mergedSession = mergeSessionFields(normalizedSession)
      if (name !== undefined && mergedSession.name === undefined) {
        mergedSession = {
          ...mergedSession,
          name,
        }
      }

      const companyName = optionalString(asRecord(mergedSession.sessionData)?.company_name)
      const hasCompanyName = companyName && companyName.trim() !== ''

      logger.debug('Session saved', {
        reportId,
        hasCompanyName,
        company_name: companyName,
        sessionDataKeys: mergedSession.sessionData
          ? Object.keys(mergedSession.sessionData).length
          : 0,
      })
    } else {
      // A successful lightweight PATCH need not read the database again. Preserve
      // the last report and local edits while applying the acknowledged fields.
      const liveSession = useSessionStore.getState().session
      if (liveSession?.reportId === reportId) {
        mergedSession = {
          ...liveSession,
          sessionData: { ...liveSession.sessionData, ...sessionData },
          currentView,
          ...(name !== undefined && { name }),
          updatedAt: new Date(),
        }
      } else {
        const reloaded = await loadSession(reportId)
        if (!reloaded) throw new Error('Saved session could not be retrieved')
        mergedSession = reloaded
      }
    }

    globalSessionCache.set(reportId, mergedSession)

    const duration = performance.now() - startTime

    logger.debug('Session saved successfully', {
      reportId,
      duration_ms: duration.toFixed(2),
    })

    return mergedSession
  } catch (error) {
    const duration = performance.now() - startTime

    if (error instanceof ValidationError) {
      logger.warn('Failed to save session - validation error', {
        error: error.message,
        field: error.field,
        reportId,
        duration_ms: duration.toFixed(2),
      })
      throw error
    }
    if (error instanceof NetworkError && error.retryable) {
      logger.warn('Failed to save session - network error (retryable)', {
        error: error.message,
        reportId,
        duration_ms: duration.toFixed(2),
      })
      throw error
    }
    if (error instanceof NotFoundError) {
      logger.error('Failed to save session - resource not found', {
        error: error.message,
        resourceType: error.resourceType,
        resourceId: error.resourceId,
        reportId,
        duration_ms: duration.toFixed(2),
      })
      throw error
    }

    logger.error('Failed to save session - unknown error', {
      error: getErrorMessage(error),
      reportId,
      duration_ms: duration.toFixed(2),
    })
    throw new ApplicationError(
      `Failed to save session: ${getErrorMessage(error)}`,
      'SESSION_SAVE_FAILED',
      {
        originalError: error,
        reportId,
        updateKeys: Object.keys(updates),
        duration_ms: duration.toFixed(2),
      }
    )
  }
}
