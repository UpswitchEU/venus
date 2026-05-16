'use client'

import { type Dispatch, type SetStateAction, useCallback, useMemo, useState } from 'react'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import type { ManualValuationFormData } from '../../../types/valuation'
import { canRemoveHistoricalYear } from '../../../utils/forecastYears'
import {
  countNormalizationsBoundToFiscalYear,
  removeNormalizationsForRemovedFiscalYear,
} from '../../../utils/normalizationMath'
import { historicalYearRowNeedsRemovalWarning } from '../../../utils/yearlyFinancials'
import type { NormalizationItem } from '../UnifiedNormalizationModal'
import {
  applyManualFilingYearSelection,
  getManualPartialHistoricalYears,
  removeManualForecastYears,
  removeManualHistoricalYear,
  updateManualYearlyFinancialsRows,
} from '../utils/manualFinancialRowMutations'
import type { UpdateManualYearlyFinancials } from '../utils/manualYearlyFinancialUpdates'

interface UseManualFinancialRowsControllerParams {
  formData: ManualValuationFormData
  normalizationItems: NormalizationItem[]
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
}

export function useManualFinancialRowsController({
  formData,
  normalizationItems,
  setFormData,
}: UseManualFinancialRowsControllerParams) {
  const [showForecastRemovalConfirm, setShowForecastRemovalConfirm] = useState(false)
  const [historicalYearPendingRemove, setHistoricalYearPendingRemove] = useState<string | null>(
    null
  )

  const commitRemoveHistoricalYear = useCallback(
    (year: string) => {
      let removedFiscalYear: number | undefined
      let didRemove = false
      setFormData((prev) => {
        const result = removeManualHistoricalYear(prev, year)
        didRemove = result.didRemove
        removedFiscalYear = result.removedFiscalYear
        return result.next
      })
      if (didRemove && removedFiscalYear != null) {
        const { items, setItems } = useNormalizationStore.getState()
        setItems(removeNormalizationsForRemovedFiscalYear(items, removedFiscalYear))
      }
      setHistoricalYearPendingRemove(null)
    },
    [setFormData]
  )

  const requestRemoveHistoricalYear = useCallback(
    (year: string) => {
      if (!canRemoveHistoricalYear(formData.yearlyFinancials)) return
      const row = formData.yearlyFinancials.find(
        (financialRow) => String(financialRow.year) === year && !financialRow.isForecast
      )
      if (!row) return
      const yearNumber = Number.parseInt(year, 10)
      const normBoundCount = Number.isFinite(yearNumber)
        ? countNormalizationsBoundToFiscalYear(normalizationItems, yearNumber)
        : 0
      if (historicalYearRowNeedsRemovalWarning(row, normBoundCount)) {
        setHistoricalYearPendingRemove(year)
        return
      }
      commitRemoveHistoricalYear(year)
    },
    [commitRemoveHistoricalYear, formData.yearlyFinancials, normalizationItems]
  )

  const updateYearlyFinancials: UpdateManualYearlyFinancials = useCallback(
    (year, isForecast, field, value) => {
      setFormData((prev) => ({
        ...prev,
        yearlyFinancials: updateManualYearlyFinancialsRows({
          field,
          isForecast,
          value,
          year,
          yearlyFinancials: prev.yearlyFinancials,
        }),
      }))
    },
    [setFormData]
  )

  const handleSelectFilingYear = useCallback(
    (selectedYear: number) => {
      setFormData((prev) => applyManualFilingYearSelection(prev, selectedYear))
    },
    [setFormData]
  )

  const confirmRemoveForecastYears = useCallback(() => {
    setFormData((current) => removeManualForecastYears(current))
    setShowForecastRemovalConfirm(false)
  }, [setFormData])

  const partialYears = useMemo(
    () => getManualPartialHistoricalYears(formData.yearlyFinancials),
    [formData.yearlyFinancials]
  )

  return {
    commitRemoveHistoricalYear,
    confirmRemoveForecastYears,
    handleSelectFilingYear,
    historicalYearPendingRemove,
    partialYears,
    requestRemoveHistoricalYear,
    setHistoricalYearPendingRemove,
    setShowForecastRemovalConfirm,
    showForecastRemovalConfirm,
    updateYearlyFinancials,
  }
}
