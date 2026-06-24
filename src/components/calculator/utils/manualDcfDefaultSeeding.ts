import type { ManualValuationFormData } from '../../../types/valuation'
import { parseFlexibleNumber } from '../../../utils/isFiniteNumeric'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
  DCF_DEFAULT_WACC_PCT,
} from '../sections/dcfEngineDefaults'
import type { DcfSmartDefaults } from '../sections/dcfSmartDefaults'

function assignParsedOrDefault<TField extends keyof ManualValuationFormData>(
  patch: Partial<ManualValuationFormData>,
  formData: ManualValuationFormData,
  field: TField,
  fallback: number
) {
  const parsed = parseFlexibleNumber(formData[field])
  if (parsed == null) {
    patch[field] = fallback as ManualValuationFormData[TField]
    return
  }

  if (formData[field] !== parsed) {
    patch[field] = parsed as ManualValuationFormData[TField]
  }
}

function deriveHistoricalEbitdaMarginPct({
  latestHistoricalRevenue,
  latestHistoricalEbitda,
}: {
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
}) {
  if (
    latestHistoricalRevenue == null ||
    latestHistoricalRevenue <= 0 ||
    latestHistoricalEbitda == null ||
    !Number.isFinite(latestHistoricalEbitda)
  ) {
    return DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT
  }

  return Math.round((latestHistoricalEbitda / latestHistoricalRevenue) * 1000) / 10
}

export function buildManualDcfDefaultsPatch({
  formData,
  hasForecastRows,
  latestHistoricalRevenue,
  latestHistoricalEbitda,
  smartDefaults,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
}: {
  formData: ManualValuationFormData
  hasForecastRows: boolean
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
  smartDefaults: DcfSmartDefaults | null
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
}): Partial<ManualValuationFormData> {
  const patch: Partial<ManualValuationFormData> = {}

  assignParsedOrDefault(
    patch,
    formData,
    'dcf_wacc_pct',
    smartDefaults?.waccPct ?? DCF_DEFAULT_WACC_PCT
  )
  assignParsedOrDefault(
    patch,
    formData,
    'dcf_terminal_growth_pct',
    smartDefaults?.terminalGrowthPct ?? DCF_DEFAULT_TERMINAL_GROWTH_PCT
  )

  if (formData.dcf_input_mode === 'fcff_only' || !hasForecastRows) {
    return patch
  }

  assignParsedOrDefault(
    patch,
    formData,
    'dcf_revenue_growth_pct',
    smartDefaults?.revenueGrowthPct ?? DCF_DEFAULT_REVENUE_GROWTH_PCT
  )
  assignParsedOrDefault(
    patch,
    formData,
    'dcf_ebitda_margin_pct',
    smartDefaults?.ebitdaMarginPct ??
      deriveHistoricalEbitdaMarginPct({
        latestHistoricalRevenue,
        latestHistoricalEbitda,
      })
  )
  assignParsedOrDefault(
    patch,
    formData,
    'dcf_capex_pct',
    integrationDerivedCapexPct ?? smartDefaults?.capexPct ?? DCF_DEFAULT_CAPEX_PCT
  )
  assignParsedOrDefault(
    patch,
    formData,
    'dcf_da_pct',
    integrationDerivedDaPct ?? smartDefaults?.daPct ?? DCF_DEFAULT_DA_PCT
  )
  assignParsedOrDefault(patch, formData, 'dcf_nwc_pct', DCF_DEFAULT_NWC_PCT)
  assignParsedOrDefault(
    patch,
    formData,
    'dcf_tax_rate_pct',
    smartDefaults?.taxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT
  )

  return patch
}
