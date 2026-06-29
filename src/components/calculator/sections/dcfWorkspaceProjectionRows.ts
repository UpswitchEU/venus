import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'
import type { DcfForecastRow } from './DcfForecastTypes'
import {
  DCF_DEFAULT_CAPEX_PCT,
  DCF_DEFAULT_DA_PCT,
  DCF_DEFAULT_NWC_PCT,
  DCF_DEFAULT_TAX_RATE_PCT,
} from './dcfEngineDefaults'
import {
  buildProjectionRowFromForecastRow,
  type DcfProjectionPreviewRow,
} from './dcfProjectionPreview'

export type DcfInputMode = 'ebitda' | 'fcff_only'

function finiteValue(value: unknown): number | undefined {
  return parseFlexibleNumber(value)
}

function withoutFcffResidue(row: DcfForecastRow): DcfForecastRow {
  const { free_cash_flow: _staleFreeCashFlow, ...bridgeRow } = row
  return bridgeRow
}

function hasStoredEbitdaModeForecastInput(row: DcfForecastRow): boolean {
  return (
    (finiteValue(row.revenue) ?? 0) !== 0 ||
    (finiteValue(row.ebitda) ?? 0) !== 0 ||
    finiteValue(row.capex) !== undefined ||
    finiteValue(row.depreciation) !== undefined ||
    finiteValue(row.nwc_change) !== undefined
  )
}

export function buildDcfWorkspaceProjectionRows({
  dcfInputMode,
  derivedProjectionPreview,
  globalCapexPct,
  globalDaPct,
  globalNwcPct,
  globalTaxRatePct,
  latestHistoricalRevenue,
  sortedRows,
}: {
  sortedRows: DcfForecastRow[]
  latestHistoricalRevenue?: number
  globalCapexPct?: number
  globalDaPct?: number
  globalNwcPct?: number
  globalTaxRatePct?: number
  dcfInputMode: DcfInputMode
  derivedProjectionPreview?: DcfProjectionPreviewRow[]
}): DcfProjectionPreviewRow[] {
  if (sortedRows.length === 0) return []

  const globals = {
    daPct: finiteValue(globalDaPct) ?? DCF_DEFAULT_DA_PCT,
    capexPct: finiteValue(globalCapexPct) ?? DCF_DEFAULT_CAPEX_PCT,
    nwcPct: finiteValue(globalNwcPct) ?? DCF_DEFAULT_NWC_PCT,
    taxRatePct: finiteValue(globalTaxRatePct) ?? DCF_DEFAULT_TAX_RATE_PCT,
  }
  const build = (row: DcfForecastRow, index: number) => {
    const previousRevenue =
      index === 0
        ? (finiteValue(latestHistoricalRevenue) ?? finiteValue(row.revenue) ?? 0)
        : (finiteValue(sortedRows[index - 1]?.revenue) ??
          finiteValue(latestHistoricalRevenue) ??
          finiteValue(row.revenue) ??
          0)
    const projectionSource = dcfInputMode === 'fcff_only' ? row : withoutFcffResidue(row)
    return buildProjectionRowFromForecastRow(projectionSource, { ...globals, previousRevenue })
  }

  if (dcfInputMode !== 'ebitda' || !derivedProjectionPreview?.length) {
    return sortedRows.map((row, index) => build(row, index))
  }

  const derivedByYear = new Map(derivedProjectionPreview.map((r) => [r.year, r]))
  return sortedRows.map((row, index) => {
    const derivedRow = derivedByYear.get(Number(row.year))
    if (derivedRow && !hasStoredEbitdaModeForecastInput(row)) {
      return derivedRow
    }
    return build(row, index)
  })
}
