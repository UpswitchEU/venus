import type { StateCreator } from 'zustand'
import { storeLogger } from '../utils/logger'
import type { SessionStore } from './useSessionStore'
import { deriveMarkSavedState } from './useSessionStore.dirtyState'
import {
  asSessionDataRecord,
  isNonCriticalSaveFailureMessage,
  readString,
} from './useSessionStore.helpers'

type StoreSet = Parameters<StateCreator<SessionStore>>[0]
type StoreGet = Parameters<StateCreator<SessionStore>>[1]

export function createSaveSessionAction(set: StoreSet, get: StoreGet): SessionStore['saveSession'] {
  return async (reason = 'autosave') => {
    const state = get()

    if (!state.engine) {
      storeLogger.warn('[Session] Cannot save - engine not initialized')
      return
    }

    if (!state.session) {
      storeLogger.warn('[Session] Cannot save: no active session')
      return
    }

    if (state.isSaving) {
      storeLogger.debug('[Session] Save already in progress, delegating to engine queue', {
        reason,
      })
    }

    const hadUnsavedChangesBeforeSave = state.hasUnsavedChanges
    const saveStartDirtyVersion = state.dirtyVersion

    set({ isSaving: true, errorMessage: null })

    try {
      storeLogger.debug('[Session] Saving session', {
        reportId: state.session.reportId,
        reason,
        hadUnsavedChanges: hadUnsavedChangesBeforeSave,
      })

      await state.engine.saveSession(reason)

      const savedSession = state.engine.getSession()
      if (savedSession) {
        const savedSessionData = asSessionDataRecord(savedSession.sessionData)
        const savedCompanyName = readString(savedSessionData, 'company_name')
        const hasSavedCompanyName = savedCompanyName && savedCompanyName.trim() !== ''
        storeLogger.debug('[Session] Updating store with saved session', {
          reportId: state.session.reportId,
          hasSavedSession: !!savedSession,
          savedCompanyName,
          hasSavedCompanyName,
          savedBusinessTypeId: savedSessionData.business_type_id,
        })

        set({
          session: savedSession,
        })
      }

      storeLogger.info('[Session] Session saved successfully', {
        reportId: state.session.reportId,
        reason,
        hadUnsavedChanges: hadUnsavedChangesBeforeSave,
      })

      if (reason === 'user' && state.onSaveSuccess) {
        state.onSaveSuccess()
      }

      set((current) => deriveMarkSavedState(current, saveStartDirtyVersion))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save session'

      if (isNonCriticalSaveFailureMessage(message)) {
        storeLogger.warn('[Session] Non-critical save error (will retry automatically)', {
          reportId: state.session.reportId,
          error: message,
          reason,
          note: 'Rate limit or network error - update will be retried on next change',
        })

        set({
          isSaving: false,
          errorMessage: null,
        })
        return
      }

      storeLogger.error('[Session] Save failed', {
        reportId: state.session.reportId,
        error: message,
        reason,
      })

      set({
        isSaving: false,
        errorMessage: message,
      })

      throw error
    }
  }
}
