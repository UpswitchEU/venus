import { useRef, useState } from 'react'
import type { RightPanelView, ValuationReportData } from '../../../components/calculator'
import { useSessionStore } from '../../../store/useSessionStore'
import type { SubmittedFinancialSnapshot } from '../utils/manualFinancialSnapshot'

export interface UseManualReportUiStateParams {
  initialTab: RightPanelView
}

export function useManualReportUiState({ initialTab }: UseManualReportUiStateParams) {
  const [report, setReport] = useState<ValuationReportData | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [rightPanelView, setRightPanelView] = useState<RightPanelView>(initialTab)
  const [calculationSaveStatus, setDraftStatus] = useState<'draft' | 'saved' | 'saving'>('draft')
  const [calculationSavedAt, setLastSaved] = useState<Date | undefined>(undefined)
  const [isDirty, setIsDirty] = useState(false)
  const lastSubmittedFinancialSnapshotRef = useRef<SubmittedFinancialSnapshot | null>(null)
  /** Tracks durable calculation saves until persistence acknowledges them. */
  const durableSaveInFlightRef = useRef(false)

  const sessionSaving = useSessionStore((state) => state.isSaving)
  const sessionDirty = useSessionStore((state) => state.hasUnsavedChanges)
  const sessionSaveError = useSessionStore((state) => state.saveErrorMessage)
  const sessionSavedAt = useSessionStore((state) => state.lastSaved)
  // A rendered calculation is not a persistence acknowledgement. Session
  // failures and pending edits take precedence over an older calculation save.
  const draftStatus: 'draft' | 'saved' | 'saving' = sessionSaveError
    ? 'draft'
    : sessionSaving || calculationSaveStatus === 'saving'
      ? 'saving'
      : sessionDirty
        ? 'draft'
        : sessionSavedAt
          ? 'saved'
          : calculationSaveStatus
  const lastSaved = sessionSavedAt ?? calculationSavedAt

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
