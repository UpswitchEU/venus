import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  type DcfProjectionPreviewRow,
  deriveDcfProjectionPreview,
} from '../sections/dcfProjectionPreview'
import type { DcfSmartDefaults } from '../sections/dcfSmartDefaults'

export interface ManualDcfProjectionAutofillState {
  canApplyDcfProjectionAutofill: boolean
  dcfProjectionAutofillRows: DcfProjectionPreviewRow[]
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function deriveManualDcfProjectionAutofillState({
  formData,
  hasDcfSelected,
  dcfForecastRows,
  dcfSmartDefaultsFromHistory,
}: {
  formData: ManualValuationFormData
  hasDcfSelected: boolean
  dcfForecastRows: YearlyFinancials[]
  dcfSmartDefaultsFromHistory: DcfSmartDefaults | null
}): ManualDcfProjectionAutofillState {
  const dcfProjectionAutofillRows = hasDcfSelected
    ? deriveDcfProjectionPreview({
        yearlyFinancials: formData.yearlyFinancials,
        smartDefaults: dcfSmartDefaultsFromHistory,
        revenueGrowthPct: formData.dcf_revenue_growth_pct,
        ebitdaMarginPct: formData.dcf_ebitda_margin_pct,
        capexPct: formData.dcf_capex_pct,
        daPct: formData.dcf_da_pct,
        nwcPct: formData.dcf_nwc_pct,
        taxRatePct: formData.dcf_tax_rate_pct,
        forecastYears: dcfForecastRows.map((row) => Number(row.year)),
      })
    : []

  return {
    dcfProjectionAutofillRows,
    canApplyDcfProjectionAutofill:
      formData.dcf_input_mode !== 'fcff_only' &&
      dcfForecastRows.length > 0 &&
      isFiniteNumber(formData.dcf_revenue_growth_pct) &&
      isFiniteNumber(formData.dcf_ebitda_margin_pct) &&
      dcfProjectionAutofillRows.length > 0 &&
      dcfProjectionAutofillRows.length === dcfForecastRows.length,
  }
}
