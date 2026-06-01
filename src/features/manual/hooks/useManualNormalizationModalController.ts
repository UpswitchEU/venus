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

export function useManualNormalizationModalController({
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
      setGuidedNormalizationPrefill((current) =>
        opts && 'prefill' in opts ? (opts.prefill ?? null) : current
      )
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
    const guidedPlan = buildManualGuidedNormalizationPlan({ guidedResolutionUrl })
    if (!guidedPlan) return
    if (planFeatures === null) return
    if (!planFeatures.ebitda_normalization) return

    setGuidedNormalizationPrefill(guidedPlan.prefill)
  }, [guidedResolutionUrl, planFeatures])

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
