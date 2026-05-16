'use client'

/**
 * Derives turnover + allowed upfront method keys for the calculator nav and session sanitization.
 * Keeps {@link ManualLayout} free of duplicate useMemos; rules live in {@link methodFieldConfig}.
 */
import { useMemo } from 'react'
import { getPreSelectableMethodsForFirmAndRevenue } from '../constants/methodFieldConfig'
import {
  type FormSnapshotForRevenueNav,
  parseCurrentYearRevenueForMethodNav,
} from '../utils/currentYearRevenueForMethodNav'

export function useUpfrontMethodNavInputs(
  formData: FormSnapshotForRevenueNav,
  firmCountryCode?: string | null
) {
  const currentYearRevenueForMethodNav = useMemo(
    () => parseCurrentYearRevenueForMethodNav(formData),
    [formData.current_year_data, formData.revenue, formData]
  )

  const preSelectableMethodsForNav = useMemo(
    () => getPreSelectableMethodsForFirmAndRevenue(firmCountryCode, currentYearRevenueForMethodNav),
    [firmCountryCode, currentYearRevenueForMethodNav]
  )

  return { currentYearRevenueForMethodNav, preSelectableMethodsForNav }
}
