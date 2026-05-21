'use client'

import { useTranslations } from 'next-intl'
import type React from 'react'
import {
  DcfForecastWorkspace,
  type DcfInputMode,
} from '@/components/calculator/sections/DcfForecastWorkspace'
import type { DcfProjectionPreviewRow } from '@/components/calculator/sections/dcfProjectionPreview'
import type { ManualInputFieldValidation } from '@/components/calculator/utils/manualInputFieldValidation'
import type { UpdateManualYearlyFinancials } from '@/components/calculator/utils/manualYearlyFinancialUpdates'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import {
  appendManualForecastYear,
  canAppendForecastYear,
  getNextForecastYear,
} from '@/utils/forecastYears'

export interface DcfForecastWorkspaceSectionStackProps {
  step: number
  formData: ManualValuationFormData
  forecastRows: YearlyFinancials[]
  projectionAutofillRows: DcfProjectionPreviewRow[]
  fieldValidation: ManualInputFieldValidation
  onDcfInputModeChange: (mode: DcfInputMode) => void
  setFormData: React.Dispatch<React.SetStateAction<ManualValuationFormData>>
  setShowForecastRemovalConfirm: (open: boolean) => void
  updateYearlyFinancials: UpdateManualYearlyFinancials
  disabled?: boolean
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
}

export function DcfForecastWorkspaceSectionStack({
  step,
  formData,
  forecastRows,
  projectionAutofillRows,
  fieldValidation,
  onDcfInputModeChange,
  setFormData,
  setShowForecastRemovalConfirm,
  updateYearlyFinancials,
  disabled,
  latestHistoricalRevenue,
  latestHistoricalEbitda,
}: DcfForecastWorkspaceSectionStackProps) {
  const mi = useTranslations('manualInput')
  const dcfInputMode = formData.dcf_input_mode ?? 'ebitda'

  return (
    <DcfForecastWorkspace
      step={step}
      showModeToggle={false}
      forecastRows={forecastRows}
      derivedProjectionPreview={projectionAutofillRows}
      latestHistoricalRevenue={latestHistoricalRevenue}
      latestHistoricalEbitda={latestHistoricalEbitda}
      fieldValidation={fieldValidation}
      globalCapexPct={formData.dcf_capex_pct}
      globalDaPct={formData.dcf_da_pct}
      globalNwcPct={formData.dcf_nwc_pct}
      globalTaxRatePct={formData.dcf_tax_rate_pct}
      disabled={disabled}
      canAddYear={canAppendForecastYear(formData.yearlyFinancials)}
      nextForecastYear={getNextForecastYear(formData.yearlyFinancials)}
      dcfInputMode={dcfInputMode}
      dcfTaxShieldProjections={formData.dcf_tax_shield_projections}
      onDcfInputModeChange={onDcfInputModeChange}
      onDcfTaxShieldProjectionChange={(index, value) => {
        setFormData((prev) => {
          const existing = Array.isArray(prev.dcf_tax_shield_projections)
            ? prev.dcf_tax_shield_projections
            : []
          const next = Array.from({ length: forecastRows.length }, (_, i) => {
            const current = Number(existing[i])
            return Number.isFinite(current) ? current : 0
          })
          next[index] = value != null && Number.isFinite(value) ? value : 0

          return {
            ...prev,
            dcf_tax_shield_projections: next.some((amount) => amount !== 0) ? next : undefined,
          }
        })
      }}
      onChange={(year, field, value) => updateYearlyFinancials(year, true, field, value)}
      onAddYear={() => {
        setFormData((prev) => {
          const result = appendManualForecastYear(prev.yearlyFinancials)
          if (!result.ok) {
            if (result.reason === 'year_out_of_range') {
              import('sonner').then(({ toast }) =>
                toast.error(mi('forecastYearOutOfRange') || 'Forecast year out of range')
              )
            }
            return prev
          }
          return {
            ...prev,
            yearlyFinancials: result.yearlyFinancials as YearlyFinancials[],
          }
        })
      }}
      onRequestRemoveForecastYears={() => setShowForecastRemovalConfirm(true)}
    />
  )
}
