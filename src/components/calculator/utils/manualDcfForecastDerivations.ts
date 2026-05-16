import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import type { DcfSmartDefaults } from '../sections/dcfSmartDefaults'

export interface ImportedLedgerAnalysisSummary {
  dcf_defaults?: {
    average_depreciation?: number
    suggested_capex?: number
  }
}

export interface ManualDcfImportBatchData {
  dcf_defaults?: {
    average_depreciation?: number
    suggested_capex?: number
  }
}

export type ManualDcfDefaultsProvenance = 'none' | 'integration' | 'history' | 'both'

export function getManualDcfForecastRows(
  hasDcfSelected: boolean,
  sortedYearlyFinancials: YearlyFinancials[]
) {
  if (!hasDcfSelected) return []
  return [...sortedYearlyFinancials.filter((year) => year.isForecast)].sort(
    (a, b) => Number(a.year) - Number(b.year)
  )
}

export function getLatestManualDcfHistoricalMetrics(sortedYearlyFinancials: YearlyFinancials[]) {
  const historical = sortedYearlyFinancials.filter(
    (row) =>
      !row.isForecast &&
      (Number.isFinite(Number(row.revenue)) || Number.isFinite(Number(row.ebitda)))
  )
  if (historical.length === 0) {
    return {
      latestHistoricalRevenue: undefined as number | undefined,
      latestHistoricalEbitda: undefined as number | undefined,
    }
  }

  const row = historical[0]
  return {
    latestHistoricalRevenue:
      typeof row.revenue === 'number' && Number.isFinite(row.revenue) ? row.revenue : undefined,
    latestHistoricalEbitda:
      typeof row.ebitda === 'number' && Number.isFinite(row.ebitda) ? row.ebitda : undefined,
  }
}

export function getPersistedManualDcfDefaults(
  businessContext: ManualValuationFormData['business_context']
) {
  const raw = businessContext?._imported_ledger_analysis
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as ImportedLedgerAnalysisSummary).dcf_defaults
    : undefined
}

function deriveBoundedImportPercent(
  amount: number | undefined,
  revenue: number | undefined,
  lowerBound: number,
  upperBound: number
) {
  if (amount == null || !Number.isFinite(amount) || revenue == null || revenue <= 0) return null
  const pct = (amount / revenue) * 100
  return Math.round(Math.min(upperBound, Math.max(lowerBound, pct)) * 10) / 10
}

export function deriveManualDcfIntegrationCapexPct({
  businessContext,
  importBatchData,
  latestHistoricalRevenue,
}: {
  businessContext: ManualValuationFormData['business_context']
  importBatchData: ManualDcfImportBatchData | null
  latestHistoricalRevenue?: number
}) {
  const persisted = getPersistedManualDcfDefaults(businessContext)
  const suggestedCapex =
    importBatchData?.dcf_defaults?.suggested_capex ?? persisted?.suggested_capex
  return deriveBoundedImportPercent(suggestedCapex, latestHistoricalRevenue, 2, 8)
}

export function deriveManualDcfIntegrationDaPct({
  businessContext,
  importBatchData,
  latestHistoricalRevenue,
}: {
  businessContext: ManualValuationFormData['business_context']
  importBatchData: ManualDcfImportBatchData | null
  latestHistoricalRevenue?: number
}) {
  const persisted = getPersistedManualDcfDefaults(businessContext)
  const averageDepreciation =
    importBatchData?.dcf_defaults?.average_depreciation ?? persisted?.average_depreciation
  return deriveBoundedImportPercent(averageDepreciation, latestHistoricalRevenue, 2, 5)
}

export function deriveManualDcfDefaultsProvenance({
  dcfSmartDefaultsFromHistory,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
}: {
  dcfSmartDefaultsFromHistory: DcfSmartDefaults | null
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
}): ManualDcfDefaultsProvenance {
  const hasSmart = dcfSmartDefaultsFromHistory != null
  const hasImport = integrationDerivedCapexPct != null || integrationDerivedDaPct != null
  if (hasImport && hasSmart) return 'both'
  if (hasImport) return 'integration'
  if (hasSmart) return 'history'
  return 'none'
}
