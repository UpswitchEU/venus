import { useCallback, useState } from 'react'
import type { ManualStarterPaywallReason } from '../components/ManualStarterPaywallModal'

export function useManualModalState() {
  const [showFullscreenModal, setShowFullscreenModal] = useState(false)
  const [showValuationEditModal, setShowValuationEditModal] = useState(false)
  const [methodPaywallOpen, setMethodPaywallOpen] = useState(false)
  const [methodPaywallReason, setMethodPaywallReason] =
    useState<ManualStarterPaywallReason>('methods')

  const openStarterPaywall = useCallback((reason: ManualStarterPaywallReason) => {
    setMethodPaywallReason(reason)
    setMethodPaywallOpen(true)
  }, [])

  return {
    methodPaywallOpen,
    methodPaywallReason,
    openStarterPaywall,
    setMethodPaywallOpen,
    setShowFullscreenModal,
    setShowValuationEditModal,
    showFullscreenModal,
    showValuationEditModal,
  }
}
