import type { ManualValuationFormData } from '../../../types/valuation'
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

function isMissingFinite(value: unknown) {
  return typeof value !== 'number' || !Number.isFinite(value)
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

  if (isMissingFinite(formData.dcf_wacc_pct)) {
    patch.dcf_wacc_pct = smartDefaults?.waccPct ?? DCF_DEFAULT_WACC_PCT
  }
  if (isMissingFinite(formData.dcf_terminal_growth_pct)) {
    patch.dcf_terminal_growth_pct =
      smartDefaults?.terminalGrowthPct ?? DCF_DEFAULT_TERMINAL_GROWTH_PCT
  }

  if (formData.dcf_input_mode === 'fcff_only' || !hasForecastRows) {
    return patch
  }

  if (isMissingFinite(formData.dcf_revenue_growth_pct)) {
    patch.dcf_revenue_growth_pct = smartDefaults?.revenueGrowthPct ?? DCF_DEFAULT_REVENUE_GROWTH_PCT
  }
  if (isMissingFinite(formData.dcf_ebitda_margin_pct)) {
    patch.dcf_ebitda_margin_pct =
      smartDefaults?.ebitdaMarginPct ??
      deriveHistoricalEbitdaMarginPct({
        latestHistoricalRevenue,
        latestHistoricalEbitda,
      })
  }
  if (isMissingFinite(formData.dcf_capex_pct)) {
    patch.dcf_capex_pct =
      integrationDerivedCapexPct ?? smartDefaults?.capexPct ?? DCF_DEFAULT_CAPEX_PCT
  }
  if (isMissingFinite(formData.dcf_da_pct)) {
    patch.dcf_da_pct = integrationDerivedDaPct ?? smartDefaults?.daPct ?? DCF_DEFAULT_DA_PCT
  }
  if (isMissingFinite(formData.dcf_nwc_pct)) {
    patch.dcf_nwc_pct = DCF_DEFAULT_NWC_PCT
  }
  if (isMissingFinite(formData.dcf_tax_rate_pct)) {
    patch.dcf_tax_rate_pct = smartDefaults?.taxRatePct ?? DCF_DEFAULT_TAX_RATE_PCT
  }

  return patch
}
