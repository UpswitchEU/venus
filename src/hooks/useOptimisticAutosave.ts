/**
 * Optimistic Autosave Hook
 *
 * Provides instant "saved" feedback by updating UI immediately,
 * then persisting changes in the background with debouncing.
 *
 * Features:
 * - Immediate UI feedback (<16ms)
 * - Debounced persistence (500ms default)
 * - Automatic rollback on error
 * - Progress tracking (Saving... → Saved)
 *
 * @module hooks/useOptimisticAutosave
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useIsMountedRef } from '../features/manual/hooks/useNavigationCancellation'
import { useSessionStore } from '../store/useSessionStore'
import { generalLogger } from '../utils/logger'

export interface OptimisticAutosaveOptions {
  /**
   * Debounce delay in milliseconds
   * Default: 500ms
   */
  debounceMs?: number

  /**
   * Callback when save succeeds
   */
  onSaveSuccess?: () => void

  /**
   * Callback when save fails
   */
  onSaveError?: (error: Error) => void
}

export interface OptimisticAutosaveState {
  /**
   * True if currently saving in background
   */
  isSaving: boolean

  /**
   * True if there are unsaved changes
   */
  hasUnsavedChanges: boolean

  /**
   * Last save timestamp
   */
  lastSaved: Date | null

  /**
   * Error message if save failed
   */
  error: string | null
}

export function useOptimisticAutosave(reportId: string, options: OptimisticAutosaveOptions = {}) {
  const { debounceMs = 500, onSaveSuccess, onSaveError } = options

  // Local state for UI feedback
  const [state, setState] = useState<OptimisticAutosaveState>({
    isSaving: false,
    hasUnsavedChanges: false,
    lastSaved: null,
    error: null,
  })

  // ROOT CAUSE FIX: Only subscribe to saveSession function, not entire session object
  // Session state is read via getState() when needed
  const _saveSession = useSessionStore((state) => state.saveSession)

  // Ref to store pending changes
  const pendingChangesRef = useRef<Partial<any>>({})
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  // Mount tracking lives in the shared `useIsMountedRef` utility — every
  // `await`-then-`setState` path below reads `isMountedRef.current` before
  // touching React state or the session store to avoid post-unmount writes.
  const isMountedRef = useIsMountedRef()

  // Cleanup on unmount — debounce timer only; mount flag is handled by useIsMountedRef.
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [])

  /**
   * Update a single field with optimistic autosave
   *
   * Flow:
   * 1. Update UI immediately (show "Saved")
   * 2. Accumulate changes in pendingChangesRef
   * 3. Debounce (wait 500ms for more changes)
   * 4. Persist all accumulated changes in background
   * 5. Revert on error
   */
  const updateField = useCallback(
    (fieldName: string, value: any) => {
      if (!reportId) {
        generalLogger.warn('[OptimisticAutosave] No reportId, skipping autosave')
        return
      }

      // Step 1: Immediate UI feedback (< 16ms)
      setState((prev) => ({
        ...prev,
        hasUnsavedChanges: false, // Optimistic: mark as "saved"
        lastSaved: new Date(),
        error: null,
      }))

      // Step 2: Accumulate changes
      pendingChangesRef.current = {
        ...pendingChangesRef.current,
        [fieldName]: value,
      }

      generalLogger.debug('[OptimisticAutosave] Field updated (optimistic)', {
        reportId,
        fieldName,
        pendingChangesCount: Object.keys(pendingChangesRef.current).length,
      })

      // Step 3: Debounce - clear previous timeout and set new one
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return

        // Step 4: Background persistence
        const changesToSave = { ...pendingChangesRef.current }
        pendingChangesRef.current = {} // Clear pending changes

        setState((prev) => ({ ...prev, isSaving: true }))

        generalLogger.info('[OptimisticAutosave] Starting background save', {
          reportId,
          fieldsCount: Object.keys(changesToSave).length,
        })

        try {
          // Update session data and save
          const { updateSessionData, saveSession: save } = useSessionStore.getState()
          updateSessionData(changesToSave)
          await save('autosave') // ✅ FIX: Mark as autosave (debounced optimistic save)

          if (!isMountedRef.current) return

          setState((prev) => ({
            ...prev,
            isSaving: false,
            hasUnsavedChanges: false,
            lastSaved: new Date(),
            error: null,
          }))

          onSaveSuccess?.()

          generalLogger.info('[OptimisticAutosave] Background save succeeded', {
            reportId,
          })
        } catch (error) {
          if (!isMountedRef.current) return

          // Step 5: Error handling (revert is handled by saveSessionOptimistic)
          const errorMessage = error instanceof Error ? error.message : 'Save failed'

          setState((prev) => ({
            ...prev,
            isSaving: false,
            hasUnsavedChanges: true,
            error: errorMessage,
          }))

          onSaveError?.(error instanceof Error ? error : new Error(errorMessage))

          generalLogger.error('[OptimisticAutosave] Background save failed', {
            reportId,
            error: errorMessage,
          })
        }
      }, debounceMs)
    },
    [reportId, debounceMs, onSaveSuccess, onSaveError, isMountedRef.current]
  )

  /**
   * Update multiple fields at once
   */
  const updateFields = useCallback(
    (fields: Record<string, any>) => {
      if (!reportId) {
        generalLogger.warn('[OptimisticAutosave] No reportId, skipping autosave')
        return
      }

      // Step 1: Immediate UI feedback
      setState((prev) => ({
        ...prev,
        hasUnsavedChanges: false,
        lastSaved: new Date(),
        error: null,
      }))

      // Step 2: Accumulate changes
      pendingChangesRef.current = {
        ...pendingChangesRef.current,
        ...fields,
      }

      generalLogger.debug('[OptimisticAutosave] Multiple fields updated (optimistic)', {
        reportId,
        fieldsCount: Object.keys(fields).length,
        pendingChangesCount: Object.keys(pendingChangesRef.current).length,
      })

      // Step 3: Debounce
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }

      timeoutRef.current = setTimeout(async () => {
        if (!isMountedRef.current) return

        const changesToSave = { ...pendingChangesRef.current }
        pendingChangesRef.current = {}

        setState((prev) => ({ ...prev, isSaving: true }))

        generalLogger.info('[OptimisticAutosave] Starting background save (multiple fields)', {
          reportId,
          fieldsCount: Object.keys(changesToSave).length,
        })

        try {
          // Update session data and save
          const { updateSessionData, saveSession: save } = useSessionStore.getState()
          updateSessionData(changesToSave)
          await save()

          if (!isMountedRef.current) return

          setState((prev) => ({
            ...prev,
            isSaving: false,
            hasUnsavedChanges: false,
            lastSaved: new Date(),
            error: null,
          }))

          onSaveSuccess?.()

          generalLogger.info('[OptimisticAutosave] Background save succeeded (multiple fields)', {
            reportId,
          })
        } catch (error) {
          if (!isMountedRef.current) return

          const errorMessage = error instanceof Error ? error.message : 'Save failed'

          setState((prev) => ({
            ...prev,
            isSaving: false,
            hasUnsavedChanges: true,
            error: errorMessage,
          }))

          onSaveError?.(error instanceof Error ? error : new Error(errorMessage))

          generalLogger.error('[OptimisticAutosave] Background save failed (multiple fields)', {
            reportId,
            error: errorMessage,
          })
        }
      }, debounceMs)
    },
    [reportId, debounceMs, onSaveSuccess, onSaveError, isMountedRef.current]
  )

  /**
   * Force immediate save (bypass debounce)
   */
  const forceSave = useCallback(async () => {
    if (!reportId) {
      generalLogger.warn('[OptimisticAutosave] No reportId, skipping force save')
      return
    }

    // Clear debounce timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }

    // If no pending changes, return
    if (Object.keys(pendingChangesRef.current).length === 0) {
      generalLogger.debug('[OptimisticAutosave] Force save: no pending changes')
      return
    }

    const changesToSave = { ...pendingChangesRef.current }
    pendingChangesRef.current = {}

    setState((prev) => ({ ...prev, isSaving: true }))

    generalLogger.info('[OptimisticAutosave] Force save started', {
      reportId,
      fieldsCount: Object.keys(changesToSave).length,
    })

    try {
      // Update and save session
      const { updateSessionData, saveSession: save } = useSessionStore.getState()
      updateSessionData(changesToSave)
      await save('autosave') // ✅ FIX: Mark as autosave (force save from optimistic autosave)

      if (!isMountedRef.current) return

      setState((prev) => ({
        ...prev,
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: new Date(),
        error: null,
      }))

      onSaveSuccess?.()

      generalLogger.info('[OptimisticAutosave] Force save succeeded', { reportId })
    } catch (error) {
      if (!isMountedRef.current) return

      const errorMessage = error instanceof Error ? error.message : 'Save failed'

      setState((prev) => ({
        ...prev,
        isSaving: false,
        hasUnsavedChanges: true,
        error: errorMessage,
      }))

      onSaveError?.(error instanceof Error ? error : new Error(errorMessage))

      generalLogger.error('[OptimisticAutosave] Force save failed', {
        reportId,
        error: errorMessage,
      })
    }
  }, [reportId, onSaveSuccess, onSaveError, isMountedRef.current])

  return {
    // State
    ...state,

    // Actions
    updateField,
    updateFields,
    forceSave,
  }
}
