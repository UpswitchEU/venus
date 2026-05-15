import { useCallback, useState } from 'react'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { useNbbPrefillStore } from '../../../store/useNbbPrefillStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import { writeNewValuationPrefill } from '../../../utils/newValuationPrefillStorage'
import { buildManualNewValuationUrl } from '../utils/manualNewValuation'

export interface UseManualNewValuationFlowParams {
  currentLocale: string
  reportId?: string | null
  collectedCompanyName?: string | null
  isAccountantFlow: boolean
  clientCompanyName?: string | null
  isAccountantMode: boolean
  clientContextId?: string | null
}

export interface UseManualNewValuationFlowResult {
  showNewValuationModal: boolean
  isConfirmingNewValuation: boolean
  handleNewValuation: () => void
  handleConfirmNewValuation: () => void
  handleCancelNewValuation: () => void
}

export function useManualNewValuationFlow({
  currentLocale,
  reportId,
  collectedCompanyName,
  isAccountantFlow,
  clientCompanyName,
  isAccountantMode,
  clientContextId,
}: UseManualNewValuationFlowParams): UseManualNewValuationFlowResult {
  const [showNewValuationModal, setShowNewValuationModal] = useState(false)
  const [isConfirmingNewValuation, setIsConfirmingNewValuation] = useState(false)

  const handleNewValuation = useCallback(() => {
    setShowNewValuationModal(true)
  }, [])

  const handleCancelNewValuation = useCallback(() => {
    setShowNewValuationModal(false)
  }, [])

  const handleConfirmNewValuation = useCallback(() => {
    setIsConfirmingNewValuation(true)

    try {
      try {
        const formData = useManualFormStore.getState().formData
        const normItems = useNormalizationStore
          .getState()
          .items.filter((n) => n.status === 'accepted')
        writeNewValuationPrefill(formData as unknown as Record<string, unknown>, {
          normCount: normItems.length,
        })
      } catch {
        // sessionStorage unavailable or serialization failed.
      }

      useSessionStore.getState().clearSession()
      useManualFormStore.getState().resetForm()
      useManualResultsStore.getState().clearResults()
      useManualResultsStore.getState().setCalculating(false)
      useNormalizationStore.getState().clear()
      useTaxLatencyStore.getState().clear({ source: 'system' })
      useNbbPrefillStore.getState().clear()
      if (reportId) useVersionHistoryStore.getState().clearVersions(reportId)
      setShowNewValuationModal(false)

      const ctx = useClientContext.getState()
      const currentSearch = typeof window !== 'undefined' ? window.location.search : undefined
      window.location.href = buildManualNewValuationUrl({
        locale: currentLocale,
        collectedCompanyName,
        isAccountantFlow,
        clientCompanyName,
        isAccountantMode,
        isActingAsClient: ctx?.isActingAsClient,
        clientContextId,
        relationshipId: ctx?.relationshipId,
        currentSearch,
      })
    } finally {
      setIsConfirmingNewValuation(false)
    }
  }, [
    clientCompanyName,
    clientContextId,
    collectedCompanyName,
    currentLocale,
    isAccountantFlow,
    isAccountantMode,
    reportId,
  ])

  return {
    showNewValuationModal,
    isConfirmingNewValuation,
    handleNewValuation,
    handleConfirmNewValuation,
    handleCancelNewValuation,
  }
}
