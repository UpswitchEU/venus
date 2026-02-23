/**
 * Valuation Toolbar Name Hook
 *
 * Single Responsibility: Handle valuation name editing logic
 * SOLID Principles: SRP - Only handles name editing operations
 *
 * @module hooks/valuationToolbar/useValuationToolbarName
 */

import { useEffect, useRef, useState } from 'react'
import { backendAPI } from '../../services/backendApi'
import { useSessionStore } from '../../store/useSessionStore'
import { generalLogger } from '../../utils/logger'
import { NameGenerator } from '../../utils/nameGenerator'

const DEFAULT_PLACEHOLDER_NAME = '__new_valuation__'

export interface UseValuationToolbarNameReturn {
  isEditingName: boolean
  editedName: string
  setEditedName: (name: string) => void
  generatedName: string
  nameInputRef: React.RefObject<HTMLInputElement>
  handleNameEdit: () => void
  handleNameSave: () => Promise<void>
  handleNameCancel: () => void
  handleKeyDown: (e: React.KeyboardEvent) => void
}

export interface UseValuationToolbarNameOptions {
  initialName?: string
  companyName?: string
  reportId?: string
}

/**
 * Hook for managing valuation name editing in ValuationToolbar
 */
export const useValuationToolbarName = (
  options: UseValuationToolbarNameOptions = {}
): UseValuationToolbarNameReturn => {
  const { initialName = DEFAULT_PLACEHOLDER_NAME, companyName, reportId } = options

  // ROOT CAUSE FIX: Only subscribe to reportId, not entire session object
  const sessionReportId = useSessionStore((state) => state.session?.reportId)
  const actualReportId = reportId || sessionReportId

  // ✅ NEW: Subscribe to session.name for restoration
  const sessionName = useSessionStore((state) => state.session?.name)

  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(initialName)

  // Generate unique name based on company or default
  // ✅ NEW: Initialize from session.name if available, otherwise generate
  const [generatedName, setGeneratedName] = useState(() => {
    // Priority: session.name > initialName > generated name
    if (sessionName) {
      return sessionName
    }
    if (initialName && initialName !== DEFAULT_PLACEHOLDER_NAME) {
      return initialName
    }
    if (companyName) {
      return NameGenerator.generateFromCompany(companyName)
    }
    return NameGenerator.generateValuationName()
  })

  // ✅ NEW: Restore name from session when it becomes available
  useEffect(() => {
    if (sessionName && sessionName !== generatedName && !isEditingName) {
      generalLogger.debug('[useValuationToolbarName] Restoring name from session', {
        sessionName,
        currentGeneratedName: generatedName,
        reportId: actualReportId,
      })
      setGeneratedName(sessionName)
      setEditedName(sessionName)
    }
  }, [sessionName, generatedName, isEditingName, actualReportId])

  // ✅ NEW: Auto-generate name when companyName changes
  useEffect(() => {
    if (companyName && companyName.trim() && actualReportId && !isEditingName) {
      // Only auto-generate if name hasn't been manually edited
      // Check if current name matches the pattern or is default
      const expectedAutoName = NameGenerator.generateFromCompany(companyName)
      const shouldAutoGenerate =
        !sessionName || // No saved name yet
        generatedName === initialName || // Still using default
        generatedName.includes('Valuation Report') || // Using default pattern
        generatedName === expectedAutoName || // Already matches auto-generated pattern
        (generatedName.endsWith('business valuation') && !sessionName) // Ends with "business valuation" but no session name (likely auto-generated)

      if (shouldAutoGenerate) {
        const newName = NameGenerator.generateFromCompany(companyName)
        if (newName !== generatedName) {
          generalLogger.info('[useValuationToolbarName] Auto-generating name from company name', {
            companyName,
            newName,
            currentGeneratedName: generatedName,
            reportId: actualReportId,
          })
          setGeneratedName(newName)
          setEditedName(newName)

          // Auto-save to backend (fire-and-forget)
          backendAPI
            .updateValuationSession(actualReportId, {
              name: newName,
            } as any)
            .then((response) => {
              if (response?.session?.name) {
                useSessionStore.getState().updateSession({ name: response.session.name })
                generalLogger.debug('[useValuationToolbarName] Auto-saved valuation name', {
                  reportId: actualReportId,
                  name: response.session.name,
                })
              }
            })
            .catch((error) => {
              generalLogger.warn('[useValuationToolbarName] Failed to auto-save valuation name', {
                error: error instanceof Error ? error.message : 'Unknown error',
                reportId: actualReportId,
                companyName,
              })
            })
        }
      }
    }
  }, [companyName, actualReportId, sessionName, generatedName, initialName, isEditingName])

  const nameInputRef = useRef<HTMLInputElement>(null)

  // Focus input when editing starts
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus()
      nameInputRef.current.select()
    }
  }, [isEditingName])

  // Sync editedName when generatedName changes
  useEffect(() => {
    if (!isEditingName) {
      setEditedName(generatedName)
    }
  }, [generatedName, isEditingName])

  const handleNameEdit = () => {
    setIsEditingName(true)
  }

  const handleNameSave = async () => {
    if (!editedName.trim()) {
      setEditedName(initialName) // Reset if empty
      setIsEditingName(false)
      return
    }

    // Update the displayed name
    setGeneratedName(editedName.trim())
    setIsEditingName(false)

    try {
      const nameToSave = editedName.trim()
      generalLogger.info('Valuation name saved', { name: nameToSave, reportId: actualReportId })

      // Persist to backend via session update if reportId is available
      if (actualReportId) {
        try {
          const response = await backendAPI.updateValuationSession(actualReportId, {
            name: nameToSave,
          } as any)

          // ✅ NEW: Update session store with the saved name to keep it in sync
          if (response?.session?.name) {
            useSessionStore.getState().updateSession({ name: response.session.name })
            generalLogger.debug('Session store updated with saved name', {
              reportId: actualReportId,
              name: response.session.name,
            })
          }

          generalLogger.debug('Valuation name persisted to backend', { reportId: actualReportId })
        } catch (error) {
          generalLogger.warn('Failed to persist valuation name to backend', {
            error: error instanceof Error ? error.message : 'Unknown error',
            reportId: actualReportId,
          })
          // Don't throw - name is already updated in UI
        }
      } else {
        generalLogger.debug('No reportId available - name saved locally only')
      }
    } catch (error) {
      generalLogger.error('Failed to save valuation name', { error })
      // Note: We don't revert here since the UI update is already done
    }
  }

  const handleNameCancel = () => {
    // Reset to current generated name (which may be from session)
    setEditedName(generatedName)
    setIsEditingName(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleNameSave()
    } else if (e.key === 'Escape') {
      handleNameCancel()
    }
  }

  return {
    isEditingName,
    editedName,
    setEditedName,
    generatedName,
    nameInputRef,
    handleNameEdit,
    handleNameSave,
    handleNameCancel,
    handleKeyDown,
  }
}
