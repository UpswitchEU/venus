import { type MutableRefObject, useCallback, useEffect, useMemo, useRef } from 'react'
import type { ValuationReportData } from '../../../components/calculator'
import type {
  ValuationFormData as StoredValuationFormData,
  ValuationResponse,
} from '../../../types/valuation'
import { getCurrentFilingYear } from '../../../utils/fiscalYear'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import { getReportedFinancialEbitda } from '../../../utils/normalizationMath'
import { restoredFiscalYear } from '../../../utils/restoredFinancialYear'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import {
  buildManualLiveYearlyFinancials,
  type ManualLiveYearlyFinancial,
} from '../utils/manualLiveYearlyFinancials'
import { getManualOriginalEbitdaForDisplay } from '../utils/manualOriginalEbitdaDisplay'

export interface UseManualFinancialContextParams {
  formStoreData: StoredValuationFormData
  report: ValuationReportData | null
  result: ValuationResponse | null
}

export interface UseManualFinancialContextResult {
  financialYears: number[]
  getLiveYearlyFinancials: () => ManualLiveYearlyFinancial[]
  getOriginalEbitdaForDisplay: () => number
  latestFormDataRef: MutableRefObject<Partial<CollectedData>>
  originalEBITDAByYear: Record<number, number>
  restoredYearlyFinancials: ManualLiveYearlyFinancial[] | undefined
}

export function useManualFinancialContext({
  formStoreData,
  report,
  result,
}: UseManualFinancialContextParams): UseManualFinancialContextResult {
  const latestFormDataRef = useRef<Partial<CollectedData>>({})

  useEffect(() => {
    latestFormDataRef.current = {
      ...latestFormDataRef.current,
      current_year_data:
        formStoreData.current_year_data ?? latestFormDataRef.current.current_year_data,
      historical_years_data:
        formStoreData.historical_years_data ?? latestFormDataRef.current.historical_years_data,
      forecast_years_data:
        formStoreData.forecast_years_data ?? latestFormDataRef.current.forecast_years_data,
    }
  }, [
    formStoreData.current_year_data,
    formStoreData.historical_years_data,
    formStoreData.forecast_years_data,
  ])

  const getLiveYearlyFinancials = useCallback(() => {
    return buildManualLiveYearlyFinancials({
      latestYearlyFinancials: latestFormDataRef.current?.yearlyFinancials,
      formData: formStoreData,
    })
  }, [formStoreData])

  const financialYears = useMemo(() => {
    const filingYear = getCurrentFilingYear()
    const years = new Set<number>([filingYear])
    getLiveYearlyFinancials().forEach((yearData) => {
      const year = Number(yearData.year)
      if (Number.isFinite(year) && year >= 2000 && year <= filingYear) {
        years.add(year)
      }
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [getLiveYearlyFinancials])

  const restoredYearlyFinancials = useMemo(() => {
    const allYears = getLiveYearlyFinancials()
    return allYears.length > 0 ? allYears : undefined
  }, [getLiveYearlyFinancials])

  const originalEBITDAByYear = useMemo(() => {
    const byYear: Record<number, number> = {}
    getLiveYearlyFinancials().forEach((yearData) => {
      const year = Number(yearData.year)
      const ebitda = Number(yearData.ebitda)
      if (Number.isFinite(year) && year >= 2000 && year <= 2100 && Number.isFinite(ebitda)) {
        byYear[year] = ebitda
      }
    })

    const currentRow =
      latestFormDataRef.current?.current_year_data ?? formStoreData.current_year_data
    const fallbackYear = currentRow ? restoredFiscalYear(currentRow.year) : getCurrentFilingYear()
    // A known annual row controls both the period and the reported basis. Never
    // resurrect its normalized earnings through a top-level legacy mirror.
    const fallbackEbitda = currentRow
      ? getReportedFinancialEbitda(currentRow)
      : parseFlexibleNumber(latestFormDataRef.current?.ebitda ?? formStoreData.ebitda)
    if (fallbackYear !== undefined && !(fallbackYear in byYear) && fallbackEbitda !== undefined) {
      byYear[fallbackYear] = fallbackEbitda
    }

    return byYear
  }, [formStoreData.current_year_data, formStoreData.ebitda, getLiveYearlyFinancials])

  const getOriginalEbitdaForDisplay = useCallback(() => {
    return getManualOriginalEbitdaForDisplay({
      year: getCurrentFilingYear(),
      originalEBITDAByYear,
      formCurrentEbitda: formStoreData.current_year_data
        ? getReportedFinancialEbitda(formStoreData.current_year_data)
        : undefined,
      latestFormData: latestFormDataRef.current,
      result,
      report,
    })
  }, [formStoreData.current_year_data, originalEBITDAByYear, report, result])

  return {
    financialYears,
    getLiveYearlyFinancials,
    getOriginalEbitdaForDisplay,
    latestFormDataRef,
    originalEBITDAByYear,
    restoredYearlyFinancials,
  }
}
