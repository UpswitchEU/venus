'use client'

import { type Dispatch, type SetStateAction, useCallback } from 'react'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  applyManualDcfProjectionAutofill,
  countManualDcfForecastManualEdits,
} from '../utils/manualDcfForecastTransforms'

type ManualDcfTranslator = (key: string, values?: Record<string, string | number>) => string

interface UseManualDcfProjectionAutofillActionParams {
  canApplyDcfProjectionAutofill: boolean
  dcfForecastRowCount: number
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  translate: ManualDcfTranslator
}

export function useManualDcfProjectionAutofillAction({
  canApplyDcfProjectionAutofill,
  dcfForecastRowCount,
  setFormData,
  translate,
}: UseManualDcfProjectionAutofillActionParams) {
  return useCallback(() => {
    if (!canApplyDcfProjectionAutofill) return

    let snapshot: YearlyFinancials[] | null = null
    let manualEditCount = 0

    setFormData((prev) => {
      snapshot = prev.yearlyFinancials
      manualEditCount = countManualDcfForecastManualEdits(prev.yearlyFinancials)

      return applyManualDcfProjectionAutofill(prev)
    })

    void import('sonner').then(({ toast }) => {
      const undoLabel = translate('dcfProjectionAutofillUndo') || 'Undo'
      const baseMsg = translate('dcfProjectionAutofillApplied', { count: dcfForecastRowCount })
      const overwriteSuffix =
        manualEditCount > 0
          ? ` ${translate('dcfProjectionAutofillOverwrote', { count: manualEditCount })}`
          : ''
      const restore = () => {
        if (!snapshot) return
        const restoreSnapshot = snapshot
        setFormData((prev) => ({ ...prev, yearlyFinancials: restoreSnapshot }))
      }

      if (manualEditCount > 0) {
        toast.warning(`${baseMsg}${overwriteSuffix}`, {
          duration: 8000,
          action: { label: undoLabel, onClick: restore },
        })
      } else {
        toast.success(baseMsg, {
          duration: 5000,
          action: { label: undoLabel, onClick: restore },
        })
      }
    })
  }, [canApplyDcfProjectionAutofill, dcfForecastRowCount, setFormData, translate])
}
