/**
 * Build EBITDA normalization draft items from Titan/Mercury imported-ledger SDE flags.
 * Shared by bootstrap prefill and session restoration so persisted analysis is consistent.
 *
 * SDE “wizard” UX: flags become pending NormalizationItems and are reviewed in UnifiedNormalizationModal
 * (Yes/No per line item), not a separate step-by-step wizard route.
 */

import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { coalesceFiniteNumber } from '../lib/omniPreview'
import { getCurrentFilingYear } from './fiscalYear'

/** Minimal shape for flags from `_imported_ledger_analysis` or bootstrap financials */
export interface ImportedLedgerSdeFlag {
  ledger_code: string
  ledger_name: string
  amount: number
  deviation_pct?: number
  benchmark_median_pct?: number
  benchmark_std_pct?: number
  actual_pct_of_revenue?: number
  z_score?: number
  confidence?: number
  year?: number
  potential_sde_addback?: boolean
  suggested_question: string
  rationale?: string
  category?: string
}

export interface ImportedLedgerAnalysisLike {
  latest_fiscal_year?: number
  sde_flags?: ImportedLedgerSdeFlag[]
  ev_equity_bridge?: Record<string, number>
  dcf_defaults?: { average_depreciation?: number; suggested_capex?: number }
}

function mapImportedLedgerCategory(category?: string): NormalizationItem['category'] {
  switch (category) {
    case 'owner_compensation':
      return 'salary'
    case 'related_party_rent':
      return 'rent'
    case 'discretionary_expense':
      return 'vehicle'
    default:
      return 'other'
  }
}

function mapImportedLedgerBackendCategory(category?: string): string | undefined {
  switch (category) {
    case 'owner_compensation':
      return 'owner_compensation_adjustment'
    case 'related_party_rent':
      return 'related_party_transactions'
    case 'discretionary_expense':
      return 'discretionary_expenses'
    default:
      return undefined
  }
}

function mapImportedLedgerConfidence(confidence?: number): NormalizationItem['confidence'] {
  if ((confidence ?? 0) >= 0.8) return 'high'
  if ((confidence ?? 0) >= 0.6) return 'medium'
  return 'low'
}

export function buildNormalizationItemsFromImportedLedgerAnalysis(
  analysis: ImportedLedgerAnalysisLike
): NormalizationItem[] {
  const flags = analysis.sde_flags
  if (!flags?.length) return []

  return flags.map((flag, index) => ({
    id: `imported_sde_${flag.year ?? 'y'}_${flag.ledger_code}_${index}`,
    ledgerCode: flag.ledger_code,
    ledgerName: flag.ledger_name,
    category: mapImportedLedgerCategory(flag.category),
    backendCategory: mapImportedLedgerBackendCategory(flag.category),
    type: 'add' as const,
    value: coalesceFiniteNumber(flag.amount),
    adjustment: coalesceFiniteNumber(flag.amount),
    reason: flag.rationale || flag.suggested_question,
    source: 'auto' as const,
    sourceRef: `${flag.year ?? ''}:${flag.ledger_code}`,
    status: 'pending' as const,
    applyAllYears: false,
    applyYears: flag.year ? [flag.year] : undefined,
    year: flag.year || getCurrentFilingYear(),
    confidence: mapImportedLedgerConfidence(flag.confidence),
    marketBenchmark: flag.benchmark_median_pct,
  }))
}
