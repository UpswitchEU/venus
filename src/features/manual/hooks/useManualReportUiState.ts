import { useRef, useState } from 'react'
import type { RightPanelView, ValuationReportData } from '../../../components/calculator'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'

export interface UseManualReportUiStateParams {
  initialTab: RightPanelView
}

export function useManualReportUiState({ initialTab }: UseManualReportUiStateParams) {
  const [report, setReport] = useState<ValuationReportData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialTab)
  const [draftStatus, setDraftStatus] = useState<'draft' | 'saved' | 'saving'>('draft')
  const [lastSaved, setLastSaved] = useState<Date | undefined>(undefined)
  const [isDirty, setIsDirty] = useState(false)
  const lastSubmittedFinancialSnapshotRef = useRef<SubmittedFinancialSnapshot | null>(null)
  /** Synchronous guard — set before Zustand `setResult` so the report bridge cannot mark saved early. */
  const durableSaveInFlightRef = useRef(false)

  return {
    draftStatus,
    durableSaveInFlightRef,
    isDirty,
    isGenerating,
    lastSaved,
    lastSubmittedFinancialSnapshotRef,
    report,
    rightPanelView,
    setDraftStatus,
    setIsDirty,
    setIsGenerating,
    setLastSaved,
    setReport,
    setRightPanelView,
  }
}
