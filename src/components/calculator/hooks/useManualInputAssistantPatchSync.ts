import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import type { ManualValuationFormData } from '../../../types/valuation'
import {
  applyManualCurrentYearBalance,
  applyManualFinancialYearSelection,
  type ManualCurrentYearBalance,
} from '../utils/manualFinancialRowMutations'

export type ManualInputAssistantPatch =
  | {
      id: string
      type: 'select_financial_years'
      years: number[]
    }
  | {
      id: string
      type: 'set_current_year_balance'
      balance: ManualCurrentYearBalance
    }

interface UseManualInputAssistantPatchSyncParams {
  assistantPatch?: ManualInputAssistantPatch | null
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

export function useManualInputAssistantPatchSync({
  assistantPatch,
  setFormData,
}: UseManualInputAssistantPatchSyncParams) {
  const appliedAssistantPatchIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!assistantPatch || appliedAssistantPatchIdRef.current === assistantPatch.id) return
    appliedAssistantPatchIdRef.current = assistantPatch.id

    if (assistantPatch.type === 'select_financial_years') {
      setFormData((prev) => applyManualFinancialYearSelection(prev, assistantPatch.years).next)
      return
    }

    setFormData((prev) => applyManualCurrentYearBalance(prev, assistantPatch.balance))
  }, [assistantPatch, setFormData])
}
