'use client'

import { useMemo } from 'react'
import { DealStructureCompareSection } from '@/components/calculator/sections/DealStructureCompareSection'
import { NavAssetScheduleSection } from '@/components/calculator/sections/NavAssetScheduleSection'
import {
  computeEquipmentMeerwaarde,
  NavEquipmentLifespanSection,
} from '@/components/calculator/sections/NavEquipmentLifespanSection'
import { NavRealEstateAppraisalSection } from '@/components/calculator/sections/NavRealEstateAppraisalSection'
import { computeNavBookReferences, type NavBookReferenceSnapshot } from '@/lib/omniPreview'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { useAdjustedNavPrefillCoordinator } from './useAdjustedNavPrefillCoordinator'

export interface AdjustedNavSectionStackProps {
  step: number
  formData: ManualValuationFormData
  latestCompleteYearlyFinancial?: YearlyFinancials
  onFieldChange: (field: string, value: number | undefined) => void
  onAnyFieldChange?: (field: string, value: unknown) => void
  disabled?: boolean
}

export function AdjustedNavSectionStack({
  step,
  formData,
  latestCompleteYearlyFinancial,
  onFieldChange,
  onAnyFieldChange,
  disabled,
}: AdjustedNavSectionStackProps) {
  const { navPrefillProvenance } = useAdjustedNavPrefillCoordinator({
    navIsActiveSection: true,
    formData,
    latestCompleteYearlyFinancial,
    onFieldChange,
    onAnyFieldChange,
  })

  const navBookReferences = useMemo<NavBookReferenceSnapshot>(
    () =>
      computeNavBookReferences({
        inventory: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.inventory)
          : null,
        accountsReceivable: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.accounts_receivable)
          : null,
        // Goodwill isn't on the summarised yearly financial today; left
        // null so the schedule's goodwill chip stays hidden until the
        // Hermes detail-account enrichment lands.
        goodwill: null,
        totalAssets: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.total_assets)
          : null,
        totalLiabilities: latestCompleteYearlyFinancial
          ? Number(latestCompleteYearlyFinancial.total_liabilities)
          : null,
      }),
    [latestCompleteYearlyFinancial]
  )

  const realEstateBookValue = formData.nav_real_estate_book_value as number | undefined
  const realEstateAppraisalValue = formData.nav_real_estate_appraisal_value as number | undefined
  const realEstateAppraisalMeerwaarde =
    realEstateBookValue != null &&
    realEstateAppraisalValue != null &&
    Number.isFinite(realEstateBookValue) &&
    Number.isFinite(realEstateAppraisalValue)
      ? realEstateAppraisalValue - realEstateBookValue
      : null
  const equipmentRevaluationMeerwaarde = computeEquipmentMeerwaarde(
    formData.nav_equipment_revaluation,
    latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.year) : undefined
  )
  const hasRealEstateAppraisalSwap =
    realEstateBookValue != null &&
    realEstateAppraisalValue != null &&
    Number.isFinite(realEstateBookValue) &&
    Number.isFinite(realEstateAppraisalValue)

  const perAssetTaxRates = formData.nav_per_asset_tax_rates

  return (
    <>
      <NavAssetScheduleSection
        step={step}
        navRealEstateAdjustment={formData.nav_real_estate_adjustment as number | undefined}
        navInventoryAdjustment={formData.nav_inventory_adjustment as number | undefined}
        navHiddenReserves={formData.nav_hidden_reserves as number | undefined}
        navGoodwillWriteoff={formData.nav_goodwill_writeoff as number | undefined}
        navReceivablesAdjustment={formData.nav_receivables_adjustment as number | undefined}
        navOtherRevaluations={formData.nav_other_revaluations as number | undefined}
        navTaxLatencyPct={formData.nav_tax_latency_pct as number | undefined}
        navOffBalanceItems={formData.nav_off_balance_items as number | undefined}
        countryCode={formData.country?.trim() || 'BE'}
        totalAssets={
          latestCompleteYearlyFinancial
            ? Number(latestCompleteYearlyFinancial.total_assets)
            : undefined
        }
        totalLiabilities={
          latestCompleteYearlyFinancial
            ? Number(latestCompleteYearlyFinancial.total_liabilities)
            : undefined
        }
        businessType={formData.industry || undefined}
        realEstateAppraisalMeerwaarde={realEstateAppraisalMeerwaarde}
        equipmentRevaluationMeerwaarde={equipmentRevaluationMeerwaarde}
        hasRealEstateAppraisalSwap={hasRealEstateAppraisalSwap}
        bookReferences={navBookReferences}
        prefillProvenance={navPrefillProvenance}
        perAssetTaxRates={perAssetTaxRates}
        onPerAssetTaxRateChange={
          onAnyFieldChange
            ? (patch) => {
                const next: Record<string, number> = {}
                for (const [k, v] of Object.entries({ ...(perAssetTaxRates ?? {}), ...patch })) {
                  if (v != null && Number.isFinite(v)) {
                    next[k] = v
                  }
                }
                onAnyFieldChange(
                  'nav_per_asset_tax_rates',
                  Object.keys(next).length > 0 ? next : undefined
                )
              }
            : undefined
        }
        onFieldChange={onFieldChange}
        disabled={disabled}
      />
      <NavRealEstateAppraisalSection
        step={`${step}b`}
        bookValue={formData.nav_real_estate_book_value as number | undefined}
        appraisalValue={formData.nav_real_estate_appraisal_value as number | undefined}
        deferredTaxRatePct={
          (formData.nav_per_asset_tax_rates?.real_estate as number | undefined) ??
          (formData.nav_tax_latency_pct as number | undefined)
        }
        onChange={onFieldChange}
        disabled={disabled}
      />
      {onAnyFieldChange && (
        <NavEquipmentLifespanSection
          step={`${step}c`}
          value={formData.nav_equipment_revaluation}
          reportingYear={
            latestCompleteYearlyFinancial ? Number(latestCompleteYearlyFinancial.year) : undefined
          }
          prefilled={{
            acquisition_year: navPrefillProvenance.nav_equipment_acquisition_year != null,
            economic_useful_life_years:
              navPrefillProvenance.nav_equipment_useful_life_years != null,
          }}
          onChange={(next) => onAnyFieldChange('nav_equipment_revaluation', next)}
          disabled={disabled}
        />
      )}
      {onAnyFieldChange && (
        <DealStructureCompareSection
          step={`${step}d`}
          inputs={{
            dealType: formData.deal_type,
            goodwillAmount: formData.deal_goodwill_amount,
            sellerShareBasis: formData.deal_seller_share_basis,
            sellerIsIndividual: formData.deal_seller_is_individual ?? true,
            buyerDiscountRatePct: formData.deal_buyer_discount_rate_pct,
            registrationDutyPct: formData.deal_registration_duty_pct,
          }}
          prefilled={{
            buyer_discount_rate_pct: navPrefillProvenance.deal_buyer_discount_rate_pct != null,
            registration_duty_pct: navPrefillProvenance.deal_registration_duty_pct != null,
          }}
          onChange={(field, value) => {
            if (typeof value === 'number' || value === undefined) {
              onFieldChange(field, value as number | undefined)
            } else {
              onAnyFieldChange(field, value)
            }
          }}
          disabled={disabled}
        />
      )}
    </>
  )
}
