'use client'

import { type Dispatch, type SetStateAction, useEffect } from 'react'
import type { ManualValuationFormData } from '../../../types/valuation'
import { isFilingYearConfirmedValue } from '../../../utils/fiscalYear'
import { shouldAutoConfirmPrefilledFilingYear } from '../utils/manualFinancialSeeds'

interface UseManualFilingYearAutoConfirmParams {
  currentFilingYear: number
  initialCurrentYearData: ManualValuationFormData['current_year_data']
  initialFilingYearConfirmed: ManualValuationFormData['filingYearConfirmed']
  initialHistoricalYearsData: ManualValuationFormData['historical_years_data']
  initialYearlyFinancials: ManualValuationFormData['yearlyFinancials'] | undefined
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

export function useManualFilingYearAutoConfirm({
  currentFilingYear,
  initialCurrentYearData,
  initialFilingYearConfirmed,
  initialHistoricalYearsData,
  initialYearlyFinancials,
  setFormData,
}: UseManualFilingYearAutoConfirmParams) {
  useEffect(() => {
    const autoConfirmInitialData = {
      current_year_data: initialCurrentYearData,
      filingYearConfirmed: initialFilingYearConfirmed,
      historical_years_data: initialHistoricalYearsData,
      yearlyFinancials: initialYearlyFinancials,
    }
    if (shouldAutoConfirmPrefilledFilingYear(autoConfirmInitialData, currentFilingYear)) {
      setFormData((prev) =>
        isFilingYearConfirmedValue(prev.filingYearConfirmed)
          ? prev
          : { ...prev, filingYearConfirmed: true }
      )
    }
  }, [
    currentFilingYear,
    initialCurrentYearData,
    initialFilingYearConfirmed,
    initialHistoricalYearsData,
    initialYearlyFinancials,
    setFormData,
  ])
}
