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
} from './dcfEngineDefaults'
import type { DcfSmartDefaults } from './dcfSmartDefaults'

export type TerminalValueMethod = 'perpetual_growth' | 'exit_multiple'
export type DcfDiscountingConvention = 'mid_year' | 'year_end'

/** `full` = single block (AdaptiveSections). Embedded DCF uses `forecastDefaultsOnly` then `discountTerminalOnly` after the forecast table. */
export type DcfGlobalAssumptionsVariant = 'full' | 'forecastDefaultsOnly' | 'discountTerminalOnly'

export type DcfInputMode = 'ebitda' | 'fcff_only'

export const TERMINAL_METHOD_VALUES = ['perpetual_growth', 'exit_multiple'] as const
export const DCF_DISCOUNTING_CONVENTION_VALUES = ['mid_year', 'year_end'] as const

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
  repairZeroEbitdaMarginPlaceholder?: boolean
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

interface BuildDcfGlobalAssumptionsSectionStateParams {
  variant: DcfGlobalAssumptionsVariant
  dcfInputMode: DcfInputMode
  terminalValueMethod: TerminalValueMethod
  dcfRevenueGrowthPct?: number
  dcfEbitdaMarginPct?: number
  dcfWaccPct?: number
  dcfTerminalGrowthPct?: number
  dcfExitMultiple?: number
}

export interface DcfGlobalAssumptionsSectionState {
  sectionComplete: boolean
  showForecastDefaultsBlock: boolean
  showDiscountTerminalBlock: boolean
}

function toFinite(value: unknown): number | undefined {
  return parseFlexibleNumber(value)
}

function finite(value: unknown): boolean {
  return toFinite(value) !== undefined
}

function pickFinite(...sources: Array<unknown>): number | undefined {
  for (const source of sources) {
    const parsed = toFinite(source)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function seedIfMissing(
  patch: DcfGlobalAssumptionsSeedPatch,
  current: number | undefined,
  field: DcfGlobalAssumptionsSeedField,
  value: number | undefined,
  options?: { treatZeroAsMissing?: boolean }
) {
  const currentParsed = toFinite(current)
  if (
    currentParsed !== undefined &&
    !(options?.treatZeroAsMissing === true && currentParsed === 0 && (value ?? 0) > 0)
  ) {
    if (current !== currentParsed) patch[field] = currentParsed
    return
  }
  if (value === undefined) return
  patch[field] = value
}

function isPositiveFinite(value: unknown): boolean {
  const parsed = toFinite(value)
  return parsed !== undefined && parsed > 0
}

export function isDcfPerpetualSpreadValid(
  dcfWaccPct: unknown,
  dcfTerminalGrowthPct: unknown
): boolean {
  const wacc = toFinite(dcfWaccPct)
  const terminalGrowth = toFinite(dcfTerminalGrowthPct)
  if (wacc === undefined || terminalGrowth === undefined) return true
  return terminalGrowth < wacc
}

export function buildDcfGlobalAssumptionsSectionState({
  variant,
  dcfInputMode,
  terminalValueMethod,
  dcfRevenueGrowthPct,
  dcfEbitdaMarginPct,
  dcfWaccPct,
  dcfTerminalGrowthPct,
  dcfExitMultiple,
}: BuildDcfGlobalAssumptionsSectionStateParams): DcfGlobalAssumptionsSectionState {
  const showForecastDefaultsBlock = variant === 'full' || variant === 'forecastDefaultsOnly'
  const showDiscountTerminalBlock = variant === 'full' || variant === 'discountTerminalOnly'

  const forecastDefaultsComplete =
    dcfInputMode === 'fcff_only' || (finite(dcfRevenueGrowthPct) && finite(dcfEbitdaMarginPct))

  const effectiveTerminalMethod =
    dcfInputMode === 'fcff_only' ? 'perpetual_growth' : terminalValueMethod
  const terminalComplete =
    effectiveTerminalMethod === 'perpetual_growth'
      ? finite(dcfTerminalGrowthPct) && isDcfPerpetualSpreadValid(dcfWaccPct, dcfTerminalGrowthPct)
      : isPositiveFinite(dcfExitMultiple)
  const globalAssumptionsComplete = isPositiveFinite(dcfWaccPct) && terminalComplete

  const sectionComplete =
    variant === 'forecastDefaultsOnly' ? forecastDefaultsComplete : globalAssumptionsComplete

  return {
    sectionComplete,
    showForecastDefaultsBlock,
    showDiscountTerminalBlock,
  }
}

export function buildDcfGlobalAssumptionsSeedPatch({
  disabled,
  variant,
  dcfInputMode,
  terminalValueMethod,
  repairZeroEbitdaMarginPlaceholder,
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
      pickFinite(smartDefaults?.ebitdaMarginPct, DCF_DEFAULT_EBITDA_MARGIN_FALLBACK_PCT),
      { treatZeroAsMissing: repairZeroEbitdaMarginPlaceholder }
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
