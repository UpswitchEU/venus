import { dcfSmartDefaultsFromForm } from '../../../lib/methods/dcf/smartDefaultsFromForm'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
} from '../sections/dcfEngineDefaults'
import {
  type DcfForecastModelSnapshot,
  snapshotFromForecastRowLike,
  snapshotsClose,
} from '../sections/dcfForecastModelSync'
import {
  applyDcfProjectionPreviewToForecastRows,
  buildProjectionRowFromForecastRow,
  type DcfProjectionPreviewRow,
  deriveDcfProjectionPreview,
} from '../sections/dcfProjectionPreview'

export type ManualDcfInputMode = 'ebitda' | 'fcff_only'

export function deriveManualDcfProjectionRowsFromForm(
  formData: ManualValuationFormData,
  yearlyFinancials: YearlyFinancials[] = formData.yearlyFinancials
) {
  return deriveDcfProjectionPreview({
    yearlyFinancials,
    smartDefaults: dcfSmartDefaultsFromForm(formData),
    revenueGrowthPct: formData.dcf_revenue_growth_pct,
    ebitdaMarginPct: formData.dcf_ebitda_margin_pct,
    capexPct: formData.dcf_capex_pct,
    daPct: formData.dcf_da_pct,
    nwcPct: formData.dcf_nwc_pct,
    taxRatePct: formData.dcf_tax_rate_pct,
    forecastYears: yearlyFinancials.filter((row) => row.isForecast).map((row) => Number(row.year)),
  })
}

export function countManualDcfForecastManualEdits(yearlyFinancials: YearlyFinancials[]) {
  return yearlyFinancials.filter((row) => {
    if (!row.isForecast) return false
    return (
      (typeof row.capex === 'number' && Number.isFinite(row.capex)) ||
      (typeof row.depreciation === 'number' && Number.isFinite(row.depreciation)) ||
      (typeof row.nwc_change === 'number' && Number.isFinite(row.nwc_change)) ||
      (typeof row.free_cash_flow === 'number' && Number.isFinite(row.free_cash_flow))
    )
  }).length
}

export function applyManualDcfProjectionAutofill(
  formData: ManualValuationFormData
): ManualValuationFormData {
  return {
    ...formData,
    yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
      formData.yearlyFinancials,
      deriveManualDcfProjectionRowsFromForm(formData)
    ) as YearlyFinancials[],
  }
}

export function applyManualDcfSuggestedCapexToBlankForecastRows({
  yearlyFinancials,
  suggestedCapex,
}: {
  yearlyFinancials: YearlyFinancials[]
  suggestedCapex: number
}): { yearlyFinancials: YearlyFinancials[]; changed: boolean } {
  let changed = false
  const nextYearlyFinancials = yearlyFinancials.map((row) => {
    if (row.isForecast && (row.capex == null || row.capex === 0)) {
      changed = true
      return { ...row, capex: suggestedCapex }
    }
    return row
  }) as YearlyFinancials[]

  return {
    yearlyFinancials: changed ? nextYearlyFinancials : yearlyFinancials,
    changed,
  }
}

export function syncManualDcfForecastRowsFromProjection({
  yearlyFinancials,
  projectionRows,
  previousModelSnapshots,
}: {
  yearlyFinancials: YearlyFinancials[]
  projectionRows: DcfProjectionPreviewRow[]
  previousModelSnapshots: Record<string, DcfForecastModelSnapshot>
}): {
  yearlyFinancials: YearlyFinancials[]
  modelSnapshots: Record<string, DcfForecastModelSnapshot>
  changed: boolean
} {
  if (projectionRows.length === 0) {
    return {
      yearlyFinancials,
      modelSnapshots: previousModelSnapshots,
      changed: false,
    }
  }

  const projectionByYear = new Map(projectionRows.map((row) => [String(row.year), row]))
  const modelSnapshots = { ...previousModelSnapshots }
  let changed = false

  const nextYearlyFinancials = yearlyFinancials.map((yearlyFinancial) => {
    if (!yearlyFinancial.isForecast) return yearlyFinancial

    const projection = projectionByYear.get(String(yearlyFinancial.year))
    if (!projection) return yearlyFinancial

    const modelSnapshot: DcfForecastModelSnapshot = {
      revenue: projection.revenue,
      ebitda: projection.ebitda,
      capex: projection.capex,
      depreciation: projection.da,
      nwc_change: projection.nwcChange,
    }
    const yearKey = String(yearlyFinancial.year)
    const lastSnapshot = modelSnapshots[yearKey]
    const currentSnapshot = snapshotFromForecastRowLike(yearlyFinancial)

    if (lastSnapshot && !snapshotsClose(currentSnapshot, lastSnapshot)) {
      return yearlyFinancial
    }

    const merged = {
      ...yearlyFinancial,
      revenue: projection.revenue,
      ebitda: projection.ebitda,
      capex: projection.capex,
      depreciation: projection.da,
      nwc_change: projection.nwcChange,
      free_cash_flow: undefined,
    }

    if (
      merged.revenue !== yearlyFinancial.revenue ||
      merged.ebitda !== yearlyFinancial.ebitda ||
      (merged.capex ?? 0) !== (yearlyFinancial.capex ?? 0) ||
      (merged.depreciation ?? 0) !== (yearlyFinancial.depreciation ?? 0) ||
      (merged.nwc_change ?? 0) !== (yearlyFinancial.nwc_change ?? 0)
    ) {
      changed = true
    }

    modelSnapshots[yearKey] = modelSnapshot
    return merged
  }) as YearlyFinancials[]

  return {
    yearlyFinancials: changed ? nextYearlyFinancials : yearlyFinancials,
    modelSnapshots,
    changed,
  }
}

export function switchManualDcfInputMode(
  formData: ManualValuationFormData,
  mode: ManualDcfInputMode
): ManualValuationFormData {
  if (mode === 'fcff_only') {
    const globals = {
      daPct: formData.dcf_da_pct ?? DCF_DEFAULT_DA_PCT,
      capexPct: formData.dcf_capex_pct ?? DCF_DEFAULT_CAPEX_PCT,
      nwcPct: formData.dcf_nwc_pct ?? DCF_DEFAULT_NWC_PCT,
      taxRatePct: formData.dcf_tax_rate_pct ?? DCF_DEFAULT_TAX_RATE_PCT,
    }

    return {
      ...formData,
      dcf_input_mode: 'fcff_only',
      dcf_terminal_value_method: 'perpetual_growth',
      yearlyFinancials: formData.yearlyFinancials.map((row) => {
        if (!row.isForecast) return row
        const fcff = buildProjectionRowFromForecastRow(
          {
            year: String(row.year),
            revenue: row.revenue,
            ebitda: row.ebitda,
            capex: row.capex,
            depreciation: row.depreciation,
            nwc_change: row.nwc_change,
            free_cash_flow: row.free_cash_flow,
          },
          globals
        ).fcff
        return { ...row, revenue: 0, ebitda: 0, free_cash_flow: fcff }
      }),
    }
  }

  const cleared = formData.yearlyFinancials.map((row) =>
    row.isForecast ? { ...row, free_cash_flow: undefined } : row
  ) as YearlyFinancials[]
  const projectionRows = deriveManualDcfProjectionRowsFromForm(formData, cleared)

  if (projectionRows.length === 0) {
    return {
      ...formData,
      dcf_input_mode: 'ebitda',
      yearlyFinancials: cleared,
    }
  }

  return {
    ...formData,
    dcf_input_mode: 'ebitda',
    yearlyFinancials: applyDcfProjectionPreviewToForecastRows(
      cleared,
      projectionRows
    ) as YearlyFinancials[],
  }
}
