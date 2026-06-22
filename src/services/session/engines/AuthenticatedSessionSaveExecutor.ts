import { recordSessionPoolPressureFromHttpError } from '../../../hooks/sessionPoolPressureCircuit'
import type { ValuationSession } from '../../../types/valuation'
import { generalLogger } from '../../../utils/logger'
import { preserveClientRecoveredHtmlWhenServerSessionStale } from '../../../utils/reportHtmlRecovery'
import { sessionService } from '../../index'
import {
  type AuthenticatedSessionSaveReason,
  shouldSkipAutosavePayload,
} from './AuthenticatedSessionConcurrencyModel'
import { isRetryableSessionSaveError } from './AuthenticatedSessionSaveErrorPolicy'
import {
  autosavePayloadFingerprint,
  buildAuthenticatedSessionSavePayload,
  mergeQueuedLocalSession,
} from './AuthenticatedSessionSavePayload'

const MAX_SESSION_SAVE_ATTEMPTS = 2
const SESSION_SAVE_BACKOFF_MS = [1000, 3000]

export interface AuthenticatedSessionSaveExecutorState {
  currentSession: ValuationSession | null
  sessionLifecycleVersion: number
  localMutationVersion: number
  savePending: boolean
  lastPersistedSaveFingerprint: string | null
}

export interface AuthenticatedSessionSaveExecutorOptions {
  reason: AuthenticatedSessionSaveReason
  queueReportId: string
  queueLifecycleVersion: number
  getState: () => AuthenticatedSessionSaveExecutorState
  isActiveSaveQueue: (reportId: string, lifecycleVersion: number) => boolean
  replaceCurrentSession: (session: ValuationSession) => void
  normalizeReportId: () => void
  setLastPersistedSaveFingerprint: (fingerprint: string) => void
  saveSession?: (
    reportId: string,
    updates: Record<string, unknown>
  ) => Promise<ValuationSession | null>
  sleepMs?: (delayMs: number) => Promise<void>
}

const defaultSleepMs = (delayMs: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, delayMs))

export async function executeAuthenticatedSessionSave({
  reason,
  queueReportId,
  queueLifecycleVersion,
  getState,
  isActiveSaveQueue,
  replaceCurrentSession,
  normalizeReportId,
  setLastPersistedSaveFingerprint,
  saveSession = sessionService.saveSession.bind(sessionService),
  sleepMs = defaultSleepMs,
}: AuthenticatedSessionSaveExecutorOptions): Promise<number> {
  if (!getState().currentSession) return getState().localMutationVersion

  for (let attempt = 0; attempt < MAX_SESSION_SAVE_ATTEMPTS; attempt++) {
    if (!isActiveSaveQueue(queueReportId, queueLifecycleVersion)) {
      return getState().localMutationVersion
    }

    try {
      const stateAtSend = getState()
      if (!stateAtSend.currentSession) return stateAtSend.localMutationVersion

      const reportIdAtSend = stateAtSend.currentSession.reportId
      const lifecycleVersionAtSend = stateAtSend.sessionLifecycleVersion
      const updates = buildAuthenticatedSessionSavePayload(stateAtSend.currentSession)
      const payloadFingerprint = autosavePayloadFingerprint(updates)
      if (
        shouldSkipAutosavePayload({
          reason,
          payloadFingerprint,
          lastPersistedFingerprint: stateAtSend.lastPersistedSaveFingerprint,
        })
      ) {
        generalLogger.debug('[AuthenticatedSessionEngine] Skipping unchanged autosave payload', {
          reportId: stateAtSend.currentSession.reportId,
        })
        return stateAtSend.localMutationVersion
      }

      const mutationVersionAtSend = stateAtSend.localMutationVersion
      const updatedSession = await saveSession(reportIdAtSend, updates)
      const latestState = getState()

      if (
        lifecycleVersionAtSend !== latestState.sessionLifecycleVersion ||
        !latestState.currentSession ||
        latestState.currentSession.reportId !== reportIdAtSend
      ) {
        generalLogger.debug('[AuthenticatedSessionEngine] Ignoring stale save response', {
          reportId: reportIdAtSend,
          activeReportId: latestState.currentSession?.reportId,
          reason,
        })
        return mutationVersionAtSend
      }

      if (updatedSession) {
        const localSession: ValuationSession | null = latestState.currentSession
        const nextSession =
          localSession &&
          (latestState.savePending || latestState.localMutationVersion !== mutationVersionAtSend)
            ? mergeQueuedLocalSession(updatedSession, localSession)
            : localSession
              ? preserveClientRecoveredHtmlWhenServerSessionStale(updatedSession, localSession)
              : updatedSession

        replaceCurrentSession(nextSession)
        normalizeReportId()

        const afterMerge = getState()
        if (attempt > 0) {
          generalLogger.info('[AuthenticatedSessionEngine] Session saved after retry', {
            reportId: afterMerge.currentSession?.reportId ?? reportIdAtSend,
            reason,
            attempt: attempt + 1,
          })
        } else {
          generalLogger.debug('[AuthenticatedSessionEngine] Session saved to backend', {
            reportId: afterMerge.currentSession?.reportId ?? reportIdAtSend,
            reason,
          })
        }
      }

      setLastPersistedSaveFingerprint(payloadFingerprint)
      return mutationVersionAtSend
    } catch (error) {
      recordSessionPoolPressureFromHttpError(error)

      if (!isActiveSaveQueue(queueReportId, queueLifecycleVersion)) {
        const latestState = getState()
        generalLogger.debug('[AuthenticatedSessionEngine] Ignoring stale save failure', {
          reportId: queueReportId,
          activeReportId: latestState.currentSession?.reportId,
          reason,
          error: error instanceof Error ? error.message : String(error),
        })
        return latestState.localMutationVersion
      }

      const latestState = getState()
      const isRetryableError = isRetryableSessionSaveError(error)
      const isLastAttempt = attempt >= MAX_SESSION_SAVE_ATTEMPTS - 1

      if (!isRetryableError || isLastAttempt) {
        generalLogger.error('[AuthenticatedSessionEngine] Failed to save session', {
          reportId: latestState.currentSession?.reportId,
          reason,
          attempt: attempt + 1,
          isRetryableError,
          error: error instanceof Error ? error.message : String(error),
        })
        throw error
      }

      generalLogger.warn('[AuthenticatedSessionEngine] Transient save error, retrying', {
        reportId: latestState.currentSession?.reportId,
        attempt: attempt + 1,
        backoffMs: SESSION_SAVE_BACKOFF_MS[attempt],
        error: error instanceof Error ? error.message : String(error),
      })

      await sleepMs(SESSION_SAVE_BACKOFF_MS[attempt])
    }
  }

  return getState().localMutationVersion
}
