import { useShallow } from 'zustand/react/shallow'
import { useManualFormStore, useManualResultsStore } from '../../../store/manual'
import { usePreparerMultipleStore } from '../../../store/manual/usePreparerMultipleStore'
import { useImportQualityStore } from '../../../store/useImportQualityStore'
import { useSessionStore } from '../../../store/useSessionStore'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { getManualSessionKey } from '../utils/manualSessionIdentifiers'

export function useManualWorkspaceStores() {
  const results = useManualResultsStore(
    useShallow((s) => ({
      isCalculating: s.isCalculating,
      result: s.result,
      htmlReport: s.htmlReport,
      selectedMethod: s.selectedMethod,
      setSelectedMethod: s.setSelectedMethod,
      preSelectedMethod: s.preSelectedMethod,
      setPreSelectedMethod: s.setPreSelectedMethod,
      togglePreSelectedMethod: s.togglePreSelectedMethod,
      trySetCalculating: s.trySetCalculating,
      setCalculating: s.setCalculating,
      setResult: s.setResult,
    }))
  )

  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const formStoreData = useManualFormStore((s) => s.formData)
  const session = useSessionStore((s) => s.session)
  const activeSessionKey = getManualSessionKey(session)
  const restorationComplete = useSessionStore((s) => s.restorationComplete)
  const sessionName = useSessionStore((s) => s.session?.name)
  const importQualityMap = useImportQualityStore((s) => s.importQuality)
  const hasImportQuality =
    !!importQualityMap &&
    typeof importQualityMap === 'object' &&
    Object.keys(importQualityMap).length > 0

  return {
    ...results,
    activeSessionKey,
    createVersion: useVersionHistoryStore((s) => s.createVersion),
    formStoreData,
    getLatestVersion: useVersionHistoryStore((s) => s.getLatestVersion),
    hasImportQuality,
    preparerAcknowledgedExtreme: usePreparerMultipleStore((s) => s.acknowledgedExtreme),
    preparerAppliedMedian: usePreparerMultipleStore((s) => s.appliedMedian),
    preparerBenchmarkMedian: usePreparerMultipleStore((s) => s.benchmarkMedian),
    preparerNote: usePreparerMultipleStore((s) => s.note),
    preparerReasonKey: usePreparerMultipleStore((s) => s.reasonKey),
    restorationComplete,
    session,
    sessionName,
    updateFormData,
  }
}
