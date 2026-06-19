import { useEffect, useRef, useState } from 'react'
import { coalesceFiniteNumber } from '../../../lib/omniPreview'
import type { ValuationFormData } from '../../../types/valuation'
import { normalizeCurrentYearForFiling } from '../../../utils/fiscalYear'
import { generalLogger } from '../../../utils/logger'
import { patchCurrentYearDataFromTopLevelFinancials } from '../utils/currentYearDataMirror'
import {
  areMergedYearRowsEqual,
  collectForecastRowsForMerge,
  computeNextHistoricalFromFormData,
  mergeHistoricalAndForecastRows,
  mirrorHistoricalToFormData,
  pickForecastRowsToPreserve,
} from '../utils/filingYearSync'

export type HistoricalInputs = Record<string, string>

interface UseHistoricalInputsSyncParams {
  formData: ValuationFormData
  updateFormData: (updates: Partial<ValuationFormData>) => void
  reportId: string | null | undefined
}

export function useHistoricalInputsSync({
  formData,
  updateFormData,
  reportId,
}: UseHistoricalInputsSyncParams) {
  const [historicalInputs, setHistoricalInputs] = useState<HistoricalInputs>({})
  const historicalInputsEverPopulatedRef = useRef(false)

  useEffect(() => {
    const historicalYearsData = formData.historical_years_data
    if (
      !historicalYearsData ||
      !Array.isArray(historicalYearsData) ||
      historicalYearsData.length === 0
    ) {
      return
    }

    setHistoricalInputs((currentInputs) => {
      const restoredInputs: HistoricalInputs = { ...currentInputs }
      let hasNewData = false

      historicalYearsData.forEach((yearData) => {
        const revenueKey = `${yearData.year}_revenue`
        const ebitdaKey = `${yearData.year}_ebitda`

        if (typeof yearData.revenue === 'number') {
          const currentRevenue = currentInputs[revenueKey]
          if (!currentRevenue || currentRevenue.trim() === '') {
            restoredInputs[revenueKey] = yearData.revenue.toString()
            hasNewData = true
          }
        }

        if (typeof yearData.ebitda === 'number') {
          const currentEbitda = currentInputs[ebitdaKey]
          if (!currentEbitda || currentEbitda.trim() === '') {
            restoredInputs[ebitdaKey] = yearData.ebitda.toString()
            hasNewData = true
          }
        }
      })

      if (!hasNewData) return currentInputs

      historicalInputsEverPopulatedRef.current = true
      generalLogger.info('[ValuationForm] Restored historical data to inputs', {
        reportId,
        yearsRestored: historicalYearsData.length,
        inputKeys: Object.keys(restoredInputs),
        years: historicalYearsData.map((d) => d.year),
      })
      return restoredInputs
    })
  }, [formData.historical_years_data, reportId])

  useEffect(() => {
    const maxHistoricalYear = normalizeCurrentYearForFiling(
      formData.current_year_data?.year,
      formData.filing_year_confirmed
    )
    const historicalYears: { year: number; revenue: number; ebitda: number }[] = []
    const yearSet = new Set<number>()

    Object.keys(historicalInputs).forEach((key) => {
      const match = key.match(/^(\d{4})_(revenue|ebitda)$/)
      if (!match) return

      const year = parseInt(match[1])
      if (year >= 2000 && year < maxHistoricalYear) {
        yearSet.add(year)
      }
    })

    yearSet.forEach((year) => {
      const revenue = historicalInputs[`${year}_revenue`]
      const ebitda = historicalInputs[`${year}_ebitda`]

      if (!revenue && !ebitda) return

      historicalYears.push({
        year,
        revenue: revenue ? coalesceFiniteNumber(revenue.replace(/,/g, '')) : 0,
        ebitda: ebitda ? coalesceFiniteNumber(ebitda.replace(/,/g, '')) : 0,
      })
    })

    historicalYears.sort((a, b) => a.year - b.year)

    if (Object.keys(historicalInputs).length > 0) {
      generalLogger.debug('[ValuationForm] Converting historicalInputs to historical_years_data', {
        reportId,
        inputKeys: Object.keys(historicalInputs),
        extractedYears: Array.from(yearSet).sort((a, b) => a - b),
        historicalYearsCount: historicalYears.length,
        historicalYears: historicalYears.map((h) => ({
          year: h.year,
          hasRevenue: Number.isFinite(h.revenue),
          hasEbitda: Number.isFinite(h.ebitda),
        })),
      })
    }

    const existingRows = formData.historical_years_data ?? []
    const forecastPool = collectForecastRowsForMerge(
      formData.historical_years_data,
      formData.forecast_years_data
    )
    const formUpdates: Partial<ValuationFormData> = {}

    if (historicalYears.length > 0) {
      historicalInputsEverPopulatedRef.current = true
      const merged = mergeHistoricalAndForecastRows(historicalYears, forecastPool)
      if (!areMergedYearRowsEqual(merged, formData.historical_years_data)) {
        formUpdates.historical_years_data = merged
      }
    } else if (historicalInputsEverPopulatedRef.current) {
      const remainingForecasts = pickForecastRowsToPreserve(existingRows)
      const nextHistorical = remainingForecasts.length > 0 ? remainingForecasts : undefined
      if (!areMergedYearRowsEqual(nextHistorical, formData.historical_years_data)) {
        formUpdates.historical_years_data = nextHistorical
      }
    }

    const revenueKey = `${maxHistoricalYear}_revenue`
    const ebitdaKey = `${maxHistoricalYear}_ebitda`
    const revenueMirror = mirrorHistoricalToFormData(historicalInputs[revenueKey], formData.revenue)
    const ebitdaMirror = mirrorHistoricalToFormData(historicalInputs[ebitdaKey], formData.ebitda)

    if (revenueMirror.changed) formUpdates.revenue = revenueMirror.next
    if (ebitdaMirror.changed) formUpdates.ebitda = ebitdaMirror.next

    if (formData.current_year_data && (revenueMirror.changed || ebitdaMirror.changed)) {
      const cydFilingYear = normalizeCurrentYearForFiling(
        formData.current_year_data.year,
        formData.filing_year_confirmed
      )
      if (cydFilingYear === maxHistoricalYear) {
        const keys: Partial<{ revenue: number | undefined; ebitda: number | undefined }> = {}
        if (revenueMirror.changed) keys.revenue = revenueMirror.next
        if (ebitdaMirror.changed) keys.ebitda = ebitdaMirror.next
        const patched = patchCurrentYearDataFromTopLevelFinancials(formData.current_year_data, keys)
        if (patched) {
          formUpdates.current_year_data = patched
        }
      }
    }

    const effectiveRevenue = revenueMirror.changed ? revenueMirror.next : formData.revenue
    const effectiveEbitda = ebitdaMirror.changed ? ebitdaMirror.next : formData.ebitda
    const nextHistRevenue = computeNextHistoricalFromFormData(
      effectiveRevenue,
      historicalInputs[revenueKey] ?? ''
    )
    const nextHistEbitda = computeNextHistoricalFromFormData(
      effectiveEbitda,
      historicalInputs[ebitdaKey] ?? ''
    )

    if (Object.keys(formUpdates).length > 0) {
      updateFormData(formUpdates)
    }
    if (nextHistRevenue !== null || nextHistEbitda !== null) {
      setHistoricalInputs((prev) => ({
        ...prev,
        ...(nextHistRevenue !== null ? { [revenueKey]: nextHistRevenue } : {}),
        ...(nextHistEbitda !== null ? { [ebitdaKey]: nextHistEbitda } : {}),
      }))
    }
  }, [
    formData.current_year_data?.year,
    formData.filing_year_confirmed,
    formData.forecast_years_data,
    formData.historical_years_data,
    formData.revenue,
    formData.ebitda,
    historicalInputs,
    updateFormData,
    formData.current_year_data,
    reportId,
  ])

  return { historicalInputs, setHistoricalInputs }
}
