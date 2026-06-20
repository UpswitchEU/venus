import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_REVENUE_GROWTH_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
  DCF_DEFAULT_TERMINAL_GROWTH_PCT,
  DCF_DEFAULT_WACC_PCT,
} from './dcfEngineDefaults'
import type { DcfSmartDefaults } from './dcfSmartDefaults'

export type TerminalValueMethod = 'perpetual_growth' | 'exit_multiple'
export type DcfDiscountingConvention = 'mid_year' | 'year_end'

/** `full` = single block (AdaptiveSections). Embedded DCF uses `forecastDefaultsOnly` then `discountTerminalOnly` after the forecast table. */
export type DcfGlobalAssumptionsVariant = 'full' | 'forecastDefaultsOnly' | 'discountTerminalOnly'

export type DcfInputMode = 'ebitda' | 'fcff_only'

export type DcfGlobalAssumptionsSeedField =
  | 'dcf_revenue_growth_pct'
  | 'dcf_ebitda_margin_pct'
  | 'dcf_capex_pct'
  | 'dcf_da_pct'
  | 'dcf_nwc_pct'
  | 'dcf_tax_rate_pct'
  | 'dcf_wacc_pct'
  | 'dcf_terminal_growth_pct'
  | 'dcf_exit_multiple'

export type DcfGlobalAssumptionsSeedPatch = Partial<Record<DcfGlobalAssumptionsSeedField, number>>

export type DcfSeedSmartDefaults = Partial<
  Pick<
    DcfSmartDefaults,
    | 'revenueGrowthPct'
    | 'ebitdaMarginPct'
    | 'capexPct'
    | 'daPct'
    | 'nwcPct'
    | 'taxRatePct'
    | 'waccPct'
    | 'terminalGrowthPct'
    | 'exitMultiple'
  >
>

interface BuildDcfGlobalAssumptionsSeedPatchParams {
  disabled?: boolean
  variant: DcfGlobalAssumptionsVariant
  dcfInputMode: DcfInputMode
  terminalValueMethod: TerminalValueMethod
  currentValues: {
    dcfRevenueGrowthPct?: number
    dcfEbitdaMarginPct?: number
    dcfCapexPct?: number
    dcfDaPct?: number
    dcfNwcPct?: number
    dcfTaxRatePct?: number
    dcfWaccPct?: number
    dcfTerminalGrowthPct?: number
    dcfExitMultiple?: number
  }
  smartDefaults?: DcfSeedSmartDefaults | null
  integrationCapexPct?: number | null
  integrationDaPct?: number | null
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function pickFinite(...sources: Array<number | null | undefined>): number | undefined {
  for (const source of sources) {
    if (finite(source)) return source
  }
  return undefined
}

function seedIfMissing(
  patch: DcfGlobalAssumptionsSeedPatch,
  current: number | undefined,
  field: DcfGlobalAssumptionsSeedField,
  value: number | undefined
) {
  if (finite(current) || value === undefined) return
  patch[field] = value
}

export function buildDcfGlobalAssumptionsSeedPatch({
  disabled,
  variant,
  dcfInputMode,
  terminalValueMethod,
  currentValues,
  smartDefaults,
  integrationCapexPct,
  integrationDaPct,
}: BuildDcfGlobalAssumptionsSeedPatchParams): DcfGlobalAssumptionsSeedPatch {
  if (disabled) return {}

  const patch: DcfGlobalAssumptionsSeedPatch = {}
  const inForecastBlock = variant === 'full' || variant === 'forecastDefaultsOnly'
  const inDiscountBlock = variant === 'full' || variant === 'discountTerminalOnly'

  if (inForecastBlock && dcfInputMode === 'ebitda') {
    seedIfMissing(
      patch,
      currentValues.dcfRevenueGrowthPct,
      'dcf_revenue_growth_pct',
      pickFinite(smartDefaults?.revenueGrowthPct, DCF_DEFAULT_REVENUE_GROWTH_PCT)
    )
    seedIfMissing(
      patch,
      currentValues.dcfEbitdaMarginPct,
      'dcf_ebitda_margin_pct',
      pickFinite(smartDefaults?.ebitdaMarginPct, DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT)
    )
    seedIfMissing(
      patch,
      currentValues.dcfCapexPct,
      'dcf_capex_pct',
      pickFinite(integrationCapexPct, smartDefaults?.capexPct, DCF_DEFAULT_CAPEX_PCT)
    )
    seedIfMissing(
      patch,
      currentValues.dcfDaPct,
      'dcf_da_pct',
      pickFinite(integrationDaPct, smartDefaults?.daPct, DCF_DEFAULT_DA_PCT)
    )
    seedIfMissing(
      patch,
      currentValues.dcfNwcPct,
      'dcf_nwc_pct',
      pickFinite(smartDefaults?.nwcPct, DCF_DEFAULT_NWC_PCT)
    )
    seedIfMissing(
      patch,
      currentValues.dcfTaxRatePct,
      'dcf_tax_rate_pct',
      pickFinite(smartDefaults?.taxRatePct, DCF_DEFAULT_TAX_RATE_PCT)
    )
  }

  if (inDiscountBlock) {
    seedIfMissing(
      patch,
      currentValues.dcfWaccPct,
      'dcf_wacc_pct',
      pickFinite(smartDefaults?.waccPct, DCF_DEFAULT_WACC_PCT)
    )

    const onPerpetual = dcfInputMode === 'fcff_only' || terminalValueMethod === 'perpetual_growth'
    if (onPerpetual) {
      seedIfMissing(
        patch,
        currentValues.dcfTerminalGrowthPct,
        'dcf_terminal_growth_pct',
        pickFinite(smartDefaults?.terminalGrowthPct, DCF_DEFAULT_TERMINAL_GROWTH_PCT)
      )
    } else {
      seedIfMissing(
        patch,
        currentValues.dcfExitMultiple,
        'dcf_exit_multiple',
        pickFinite(smartDefaults?.exitMultiple, 6)
      )
    }
  }

  return patch
}
