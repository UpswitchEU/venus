import type { UpdateValuationSessionRequest } from '../../../types/api'
import type {
  CreateValuationSessionResponse,
  UpdateValuationSessionResponse,
} from '../../../types/api-responses'
import type { ValuationSession } from '../../../types/valuation'
import { apiLogger } from '../../../utils/logger'
import type { APIRequestConfig } from '../HttpClient'
import type { CreateValuationSessionInput } from './SessionAPI'
import { type AxiosLikeError, isHttpStatus, responseMessage } from './SessionApiHttp'
import {
  emptyOptimisticUpdate,
  flattenStoreAndPatchIntoSessionDataForCreate,
} from './SessionApiPatchHelpers'

type SessionCreationErrorState = {
  error: unknown
  timestamp: number
}

type MissingSessionRecoveryOptions = {
  createValuationSession: (
    session: CreateValuationSessionInput,
    options?: APIRequestConfig
  ) => Promise<CreateValuationSessionResponse>
  errorCooldownMs: number
  hasRecentDeletedSession: (reportId: string) => boolean
  originalError: AxiosLikeError
  requestOptions?: APIRequestConfig
  reportId: string
  sessionCreationErrors: Map<string, SessionCreationErrorState>
  sessionCreationPromises: Map<string, Promise<CreateValuationSessionResponse>>
  tombstoneTtlMs: number
  updates: UpdateValuationSessionRequest
}

export function isCriticalSessionUpdate(updates: UpdateValuationSessionRequest): boolean {
  return !!(updates.updates?.sessionData || updates.updates?.currentView)
}

function updateResponseFromCreateResponse(
  createResponse: CreateValuationSessionResponse
): UpdateValuationSessionResponse {
  return {
    success: createResponse.success,
    session: createResponse.session,
    updated: true,
  }
}

export async function recoverMissingSessionUpdate({
  createValuationSession,
  errorCooldownMs,
  hasRecentDeletedSession,
  originalError,
  requestOptions,
  reportId,
  sessionCreationErrors,
  sessionCreationPromises,
  tombstoneTtlMs,
  updates,
}: MissingSessionRecoveryOptions): Promise<UpdateValuationSessionResponse> {
  try {
    if (hasRecentDeletedSession(reportId)) {
      apiLogger.warn('Skipping session auto-create because this session was just deleted', {
        reportId,
        tombstoneTtlMs,
      })
      return emptyOptimisticUpdate()
    }

    const { useSessionStore } = await import('../../../store/useSessionStore')
    const sessionStore = useSessionStore.getState()
    const currentSession = sessionStore.session

    if (currentSession && currentSession.reportId === reportId) {
      const recentError = sessionCreationErrors.get(reportId)
      if (recentError) {
        const errorAge = Date.now() - recentError.timestamp
        if (errorAge < errorCooldownMs) {
          apiLogger.warn(
            'Session creation blocked - recent rate limit error, returning optimistic success',
            {
              reportId,
              errorAge_ms: errorAge,
              cooldownRemaining_ms: errorCooldownMs - errorAge,
              note: 'Update will be retried after cooldown period',
            }
          )

          if (!isCriticalSessionUpdate(updates)) {
            return emptyOptimisticUpdate()
          }
        } else {
          sessionCreationErrors.delete(reportId)
        }
      }

      const existingPromise = sessionCreationPromises.get(reportId)
      if (existingPromise) {
        apiLogger.debug('Session creation already in progress, waiting for existing promise', {
          reportId,
        })

        try {
          const createResponse = await existingPromise
          return updateResponseFromCreateResponse(createResponse)
        } catch (promiseError) {
          if (isHttpStatus(promiseError, 429) && !isCriticalSessionUpdate(updates)) {
            return emptyOptimisticUpdate()
          }
          throw promiseError
        }
      }

      const createPromise = (async () => {
        try {
          apiLogger.info('Session not found during update, creating session with updates', {
            reportId,
            note: 'Session exists in store but not in backend. Creating session with provided updates.',
            updates: Object.keys(updates.updates || {}),
          })

          const mergedSessionData = flattenStoreAndPatchIntoSessionDataForCreate(
            currentSession.sessionData as Record<string, unknown> | undefined,
            updates.updates
          )

          const sessionToCreate: CreateValuationSessionInput = {
            session_key: reportId,
            reportId,
            currentView: currentSession.currentView || updates.updates?.currentView || 'manual',
            sessionData: mergedSessionData,
            name: updates.updates?.name || currentSession.name,
            dataSource: updates.updates?.dataSource || currentSession.dataSource,
          }

          const createResponse = await createValuationSession(sessionToCreate, requestOptions)
          sessionCreationErrors.delete(reportId)
          return createResponse
        } catch (createError) {
          if (isHttpStatus(createError, 429)) {
            sessionCreationErrors.set(reportId, {
              error: createError,
              timestamp: Date.now(),
            })
            apiLogger.warn('Rate limit hit during session creation, storing error for cooldown', {
              reportId,
              cooldown_ms: errorCooldownMs,
            })
          }
          throw createError
        } finally {
          sessionCreationPromises.delete(reportId)
        }
      })()

      sessionCreationPromises.set(reportId, createPromise)

      try {
        const createResponse = await createPromise
        return updateResponseFromCreateResponse(createResponse)
      } catch (createError) {
        if (isHttpStatus(createError, 429) && !isCriticalSessionUpdate(updates)) {
          return emptyOptimisticUpdate()
        }
        throw createError
      }
    }

    if (!isCriticalSessionUpdate(updates)) {
      apiLogger.debug('Session not found during update - returning optimistic success', {
        reportId,
        isCriticalUpdate: false,
        note: 'Non-critical update - will be retried on next change',
      })
      return emptyOptimisticUpdate()
    }

    apiLogger.warn('Session not found during update - session does not exist in store', {
      reportId,
      note: 'Sessions are created during bootstrap. A 404 indicates the session was deleted or there is a synchronization issue.',
      errorMessage: responseMessage(originalError) || 'Unknown error',
    })
    return emptyOptimisticUpdate()
  } catch (createError) {
    if (isHttpStatus(createError, 429)) {
      sessionCreationErrors.set(reportId, {
        error: createError,
        timestamp: Date.now(),
      })
      apiLogger.warn('Rate limit hit during session auto-create, returning optimistic success', {
        reportId,
        note: 'Update will be retried after cooldown period',
        cooldown_ms: errorCooldownMs,
      })

      if (!isCriticalSessionUpdate(updates)) {
        return emptyOptimisticUpdate()
      }

      apiLogger.warn('Rate limit hit for critical update, returning optimistic success', {
        reportId,
        updateKeys: Object.keys(updates.updates || {}),
      })
      return emptyOptimisticUpdate()
    }

    apiLogger.warn('Failed to auto-create session after 404, returning optimistic success', {
      reportId,
      createError: createError instanceof Error ? createError.message : String(createError),
      originalError: responseMessage(originalError) || 'Unknown error',
      note: 'Guest users can continue working - session will be created on explicit save',
    })
    return emptyOptimisticUpdate()
  }
}
