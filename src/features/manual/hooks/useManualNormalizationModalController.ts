import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from 'react'
import { trackNormalizationOpen } from '@/lib/analytics'
import type { PlanFeatureFlags } from '../../../hooks/useCredits'
import {
  buildManualGuidedNormalizationPlan,
  type ManualGuidedNormalizationPrefill,
  type ManualGuidedNormalizationUrl,
} from '../utils/manualGuidedNormalization'

export interface OpenManualNormalizationModalOptions {
  prefill?: ManualGuidedNormalizationPrefill | null
  closeChat?: boolean
  track?: boolean
}

export interface UseManualNormalizationModalControllerParams {
  reportId: string
  guidedResolutionUrl?: ManualGuidedNormalizationUrl | null
  planFeatures: Pick<PlanFeatureFlags, 'ebitda_normalization'> | null
  openNormalizationPaywall: () => void
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
}

export interface UseManualNormalizationModalControllerResult {
  showUnifiedNormalizationModal: boolean
  guidedNormalizationPrefill: ManualGuidedNormalizationPrefill | null
  openUnifiedNormalizationModal: (opts?: OpenManualNormalizationModalOptions) => void
  handleUnifiedNormalizationModalOpenChange: (open: boolean) => void
  handleShowNormalisationReview: () => void
}

function hasHandledGuidedNormalization(storageKey: string): boolean {
  try {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem(storageKey) === '1'
  } catch {
    return false
  }
}

function markGuidedNormalizationHandled(storageKey: string): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(storageKey, '1')
    }
  } catch {
    // Non-fatal: without sessionStorage the modal may reopen after reload.
  }
}

export function useManualNormalizationModalController({
  reportId,
  guidedResolutionUrl,
  planFeatures,
  openNormalizationPaywall,
  setChatDrawerOpen,
}: UseManualNormalizationModalControllerParams): UseManualNormalizationModalControllerResult {
  const [showUnifiedNormalizationModal, setShowUnifiedNormalizationModal] = useState(false)
  const [guidedNormalizationPrefill, setGuidedNormalizationPrefill] =
    useState<ManualGuidedNormalizationPrefill | null>(null)

  const openUnifiedNormalizationModal = useCallback(
    (opts?: OpenManualNormalizationModalOptions) => {
      if (planFeatures && !planFeatures.ebitda_normalization) {
        openNormalizationPaywall()
        return
      }
      setGuidedNormalizationPrefill(opts?.prefill ?? null)
      if (opts?.track !== false) {
        trackNormalizationOpen()
      }
      setShowUnifiedNormalizationModal(true)
      if (opts?.closeChat) {
        setChatDrawerOpen(false)
      }
    },
    [openNormalizationPaywall, planFeatures, setChatDrawerOpen]
  )

  useEffect(() => {
    const guidedPlan = buildManualGuidedNormalizationPlan({ reportId, guidedResolutionUrl })
    if (!guidedPlan) return
    if (planFeatures === null) return
    if (!planFeatures.ebitda_normalization) return
    if (hasHandledGuidedNormalization(guidedPlan.storageKey)) return

    markGuidedNormalizationHandled(guidedPlan.storageKey)
    openUnifiedNormalizationModal({
      prefill: guidedPlan.prefill,
      track: false,
    })
  }, [reportId, guidedResolutionUrl, openUnifiedNormalizationModal, planFeatures])

  const handleUnifiedNormalizationModalOpenChange = useCallback((open: boolean) => {
    setShowUnifiedNormalizationModal(open)
    if (!open) {
      setGuidedNormalizationPrefill(null)
    }
  }, [])

  const handleShowNormalisationReview = useCallback(() => {
    openUnifiedNormalizationModal()
  }, [openUnifiedNormalizationModal])

  return {
    showUnifiedNormalizationModal,
    guidedNormalizationPrefill,
    openUnifiedNormalizationModal,
    handleUnifiedNormalizationModalOpenChange,
    handleShowNormalisationReview,
  }
}
