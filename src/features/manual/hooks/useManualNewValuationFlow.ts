import { useCallback, useState } from 'react'
import { useManualFormStore } from '../../../store/manual'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { useClientContext } from '../../../stores/clientContext'
import { writeNewValuationPrefill } from '../../../utils/newValuationPrefillStorage'
import { safeVenusInternalPath } from '../../../utils/safeVenusRedirect'
import { buildManualNewValuationUrl } from '../utils/manualNewValuation'
import { resetManualWorkspaceState } from '../utils/resetManualWorkspaceState'

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

      resetManualWorkspaceState({
        preserveForm: false,
        reportIdsToClearVersions: reportId ? [reportId] : [],
      })
      setShowNewValuationModal(false)

      const ctx = useClientContext.getState()
      const currentSearch = typeof window !== 'undefined' ? window.location.search : undefined
      const targetUrl = buildManualNewValuationUrl({
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
      window.location.assign(safeVenusInternalPath(targetUrl) ?? `/${currentLocale}/reports/new`)
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
