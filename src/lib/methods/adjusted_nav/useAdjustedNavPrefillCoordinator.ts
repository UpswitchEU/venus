/**
 * useAdjustedNavPrefillCoordinator — owns the panel-side Adjusted NAV prefill effect.
 *
 * The pure NAV default engine lives in `@/lib/omniPreview/navPrefill`. This hook is
 * the React-state wrapper: it applies safe defaults only while the NAV section is
 * active, tracks which values it applied, and exposes provenance while the current
 * form values still match those applied defaults.
 */

import { useEffect, useMemo, useRef } from 'react'
import {
  computeNavPrefill,
  type NavPrefillField,
  type NavPrefillProvenanceMap,
} from '@/lib/omniPreview'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'

interface NavEquipmentRevaluation {
  original_cost?: number
  acquisition_year?: number
  tax_book_value?: number
  economic_useful_life_years?: number
  economic_book_value?: number
}

export interface UseAdjustedNavPrefillCoordinatorParams {
  navIsActiveSection: boolean
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFieldChange: (field: string, value: number | undefined) => void
  onAnyFieldChange?: (field: string, value: unknown) => void
}

export interface UseAdjustedNavPrefillCoordinatorResult {
  navPrefillProvenance: NavPrefillProvenanceMap
}

export function useAdjustedNavPrefillCoordinator({
  navIsActiveSection,
  formData,
  latestCompleteYearlyFinancial,
  onFieldChange,
  onAnyFieldChange,
}: UseAdjustedNavPrefillCoordinatorParams): UseAdjustedNavPrefillCoordinatorResult {
  const navDesiredPrefill = useMemo(
    () =>
      computeNavPrefill({
        countryCode: formData.country,
        realEstateCarveOutBookValue:
          (formData.real_estate_book_value as number | undefined) ?? null,
        reportingYear: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.year)
          : null,
        existing: {},
      }),
    [formData.country, formData.real_estate_book_value, latestCompleteYearlyFinancial]
  )

  const navPrefillAppliedRef = useRef<Partial<Record<NavPrefillField, number>>>({})
  const navPrefillProvenanceRef = useRef<NavPrefillProvenanceMap>({})

  const navTaxLatencyPctValue = formData.nav_tax_latency_pct as number | undefined
  const navRealEstateBookValue = formData.nav_real_estate_book_value as number | undefined
  const navEquipmentRevaluation = formData.nav_equipment_revaluation as
    | NavEquipmentRevaluation
    | undefined
  const navEquipmentAcquisitionYear = navEquipmentRevaluation?.acquisition_year
  const navEquipmentUsefulLifeYears = navEquipmentRevaluation?.economic_useful_life_years
  const dealBuyerDiscountRatePct = formData.deal_buyer_discount_rate_pct as number | undefined
  const dealRegistrationDutyPct = formData.deal_registration_duty_pct as number | undefined

  useEffect(() => {
    if (!navIsActiveSection) return
    const { values, provenance } = navDesiredPrefill
    const currentByField: Record<NavPrefillField, number | undefined> = {
      nav_tax_latency_pct: navTaxLatencyPctValue,
      nav_real_estate_book_value: navRealEstateBookValue,
      nav_equipment_acquisition_year: navEquipmentAcquisitionYear,
      nav_equipment_useful_life_years: navEquipmentUsefulLifeYears,
      deal_buyer_discount_rate_pct: dealBuyerDiscountRatePct,
      deal_registration_duty_pct: dealRegistrationDutyPct,
    }

    const equipmentPatch: Partial<NavEquipmentRevaluation> = {}
    const queueWrite = (field: NavPrefillField, desired: number): boolean => {
      if (field === 'nav_equipment_acquisition_year') {
        if (!onAnyFieldChange) return false
        equipmentPatch.acquisition_year = desired
        return true
      }
      if (field === 'nav_equipment_useful_life_years') {
        if (!onAnyFieldChange) return false
        equipmentPatch.economic_useful_life_years = desired
        return true
      }
      onFieldChange(field, desired)
      return true
    }

    for (const [field, desired] of Object.entries(values)) {
      if (desired == null || !Number.isFinite(desired)) continue
      const typedField = field as NavPrefillField
      const current = currentByField[typedField]
      const applied = navPrefillAppliedRef.current[typedField]

      if (current != null && current !== applied) continue
      if (current === desired) continue
      if (!queueWrite(typedField, desired)) continue

      navPrefillAppliedRef.current[typedField] = desired
      navPrefillProvenanceRef.current[typedField] = provenance[typedField]
    }

    if (Object.keys(equipmentPatch).length > 0 && onAnyFieldChange) {
      onAnyFieldChange('nav_equipment_revaluation', {
        ...(navEquipmentRevaluation ?? {}),
        ...equipmentPatch,
      })
    }
  }, [
    navIsActiveSection,
    navDesiredPrefill,
    navTaxLatencyPctValue,
    navRealEstateBookValue,
    navEquipmentAcquisitionYear,
    navEquipmentUsefulLifeYears,
    navEquipmentRevaluation,
    dealBuyerDiscountRatePct,
    dealRegistrationDutyPct,
    onFieldChange,
    onAnyFieldChange,
  ])

  const navPrefillProvenance = useMemo<NavPrefillProvenanceMap>(() => {
    const result: NavPrefillProvenanceMap = {}
    const applied = navPrefillAppliedRef.current
    const provenance = navPrefillProvenanceRef.current
    const equipment = formData.nav_equipment_revaluation as
      | Pick<NavEquipmentRevaluation, 'acquisition_year' | 'economic_useful_life_years'>
      | undefined
    const currentValues: Record<NavPrefillField, number | undefined> = {
      nav_tax_latency_pct: formData.nav_tax_latency_pct as number | undefined,
      nav_real_estate_book_value: formData.nav_real_estate_book_value as number | undefined,
      nav_equipment_acquisition_year: equipment?.acquisition_year,
      nav_equipment_useful_life_years: equipment?.economic_useful_life_years,
      deal_buyer_discount_rate_pct: formData.deal_buyer_discount_rate_pct as number | undefined,
      deal_registration_duty_pct: formData.deal_registration_duty_pct as number | undefined,
    }
    for (const [field, appliedValue] of Object.entries(applied)) {
      const typedField = field as NavPrefillField
      const currentValue = currentValues[typedField]
      if (currentValue != null && currentValue === appliedValue) {
        const provenanceEntry = provenance[typedField]
        if (provenanceEntry) {
          result[typedField] = provenanceEntry
        }
      }
    }
    return result
  }, [
    formData.nav_tax_latency_pct,
    formData.nav_real_estate_book_value,
    formData.nav_equipment_revaluation,
    formData.deal_buyer_discount_rate_pct,
    formData.deal_registration_duty_pct,
  ])

  return { navPrefillProvenance }
}
