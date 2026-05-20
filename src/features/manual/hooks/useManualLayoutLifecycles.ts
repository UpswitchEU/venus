import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react'
import {
  enableNormalizationAutoPersist,
  setNormalizationToastMessages,
} from '../../../store/useNormalizationStore'
import { enableTaxLatencyAutoPersist } from '../../../store/useTaxLatencyStore'
import type { ValuationFormData } from '../../../types/valuation'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'
import { buildManualRestoredFinancialSnapshot } from '../utils/manualRestoredFinancialSnapshot'

export function useManualPanelStorageReset() {
  useLayoutEffect(() => {
    try {
      const keysToRemove = [
        'venus-calculator-layout-v2',
        'venus-calculator-panels',
        'upswitch-panel-width',
        'react-resizable-panels:venus-calculator-layout-v2',
        'react-resizable-panels:venus-calculator-panels',
      ]
      keysToRemove.forEach((key) => localStorage.removeItem(key))
      Object.keys(localStorage)
        .filter((key) => key.includes('react-resizable-panels') || key.includes('venus-calculator'))
        .forEach((key) => localStorage.removeItem(key))
    } catch {
      // localStorage may be unavailable in embedded/private contexts.
    }
  }, [])
}

export function useManualToastMessageLifecycle(translate: (key: string) => string) {
  useEffect(() => {
    setNormalizationToastMessages((key) => translate(key))
    return () => setNormalizationToastMessages(null)
  }, [translate])
}

export function useManualSessionPersistenceLifecycles({
  reportId,
  resolvedReportId,
}: {
  reportId: string
  resolvedReportId?: string | null
}) {
  useEffect(() => {
    const unsub = enableNormalizationAutoPersist(() => resolvedReportId || reportId || undefined)
    return unsub
  }, [reportId, resolvedReportId])

  useEffect(() => {
    const unsub = enableTaxLatencyAutoPersist(() => resolvedReportId || reportId || undefined)
    return unsub
  }, [reportId, resolvedReportId])
}

export function useManualVersionSyncTimeoutRef() {
  const versionSyncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (versionSyncTimeoutRef.current) clearTimeout(versionSyncTimeoutRef.current)
    }
  }, [])

  return versionSyncTimeoutRef
}

export function useManualRestoredFinancialSnapshotBaseline({
  formStoreData,
  lastSubmittedFinancialSnapshotRef,
  result,
  setIsDirty,
}: {
  formStoreData: ValuationFormData
  lastSubmittedFinancialSnapshotRef: MutableRefObject<SubmittedFinancialSnapshot | null>
  result: unknown
  setIsDirty: (isDirty: boolean) => void
}) {
  useEffect(() => {
    if (!result || lastSubmittedFinancialSnapshotRef.current) return
    const restoredSnapshot = buildManualRestoredFinancialSnapshot(formStoreData)
    if (!restoredSnapshot) return
    lastSubmittedFinancialSnapshotRef.current = restoredSnapshot
    setIsDirty(false)
  }, [
    result,
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.revenue,
    formStoreData.ebitda,
    formStoreData.forecast_years_data,
    formStoreData,
    lastSubmittedFinancialSnapshotRef,
    lastSubmittedFinancialSnapshotRef.current,
    setIsDirty,
  ])
}

export function useManualKeyboardShortcuts({
  chatDrawerOpen,
  setChatDrawerOpen,
  setShowFullscreenModal,
  showFullscreenModal,
}: {
  chatDrawerOpen: boolean
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setShowFullscreenModal: Dispatch<SetStateAction<boolean>>
  showFullscreenModal: boolean
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        if (showFullscreenModal) setShowFullscreenModal(false)
        else if (chatDrawerOpen) setChatDrawerOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setChatDrawerOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [chatDrawerOpen, setChatDrawerOpen, setShowFullscreenModal, showFullscreenModal])
}
