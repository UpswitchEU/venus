'use client'

import { type Dispatch, type SetStateAction, useEffect } from 'react'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  getPersistedManualDcfDefaults,
  type ManualDcfImportBatchData,
} from '../utils/manualDcfForecastDerivations'
import { applyManualDcfSuggestedCapexToBlankForecastRows } from '../utils/manualDcfForecastTransforms'

interface UseManualDcfSuggestedCapexHydrationParams {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  hasDcfSelected: boolean
  importBatchData: ManualDcfImportBatchData | null
  dcfForecastRows: YearlyFinancials[]
}

export function useManualDcfSuggestedCapexHydration({
  formData,
  setFormData,
  hasDcfSelected,
  importBatchData,
  dcfForecastRows,
}: UseManualDcfSuggestedCapexHydrationParams) {
  useEffect(() => {
    const suggestedCapex =
      importBatchData?.dcf_defaults?.suggested_capex ??
      getPersistedManualDcfDefaults(formData.business_context)?.suggested_capex
    if (
      !hasDcfSelected ||
      formData.dcf_input_mode === 'fcff_only' ||
      !suggestedCapex ||
      dcfForecastRows.length === 0
    ) {
      return
    }

    setFormData((prev) => {
      const result = applyManualDcfSuggestedCapexToBlankForecastRows({
        yearlyFinancials: prev.yearlyFinancials,
        suggestedCapex,
      })
      if (!result.changed) return prev
      return { ...prev, yearlyFinancials: result.yearlyFinancials }
    })
  }, [
    dcfForecastRows.length,
    hasDcfSelected,
    formData.business_context,
    formData.dcf_input_mode,
    importBatchData?.dcf_defaults?.suggested_capex,
    setFormData,
  ])
}
