/**
 * Merge Titan-style imported ledger analysis into `business_context` for persistence
 * (session save, restoration). Aligns in-app accounting batch import with bootstrap prefill.
 */

import type { AccountingBatchPayload } from '../services/api/accounting'
import type { ImportedLedgerAnalysisLike } from './importedLedgerNormalization'

export interface ImportedLedgerProvenance {
  provider: string
  imported_at: string
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

/**
 * Non-destructive merge: keeps unrelated `business_context` keys; deep-merges `_imported_ledger_analysis`
 * and stamps provenance for debugging.
 */
export function mergeImportedLedgerAnalysisIntoBusinessContext(
  prevBusinessContext: Record<string, unknown> | undefined,
  batch: Pick<
    AccountingBatchPayload,
    'dcf_defaults' | 'sde_flags' | 'ev_equity_bridge' | 'latest_fiscal_year'
  >,
  provider: string
): Record<string, unknown> {
  const base = {
    ...(prevBusinessContext && typeof prevBusinessContext === 'object' ? prevBusinessContext : {}),
  }

  const existingRaw = base._imported_ledger_analysis
  const existing = asRecord(existingRaw) as ImportedLedgerAnalysisLike | null

  const nextAnalysis: ImportedLedgerAnalysisLike = {
    ...(existing || {}),
  }

  if (batch.latest_fiscal_year != null) {
    nextAnalysis.latest_fiscal_year = batch.latest_fiscal_year
  }
  if (batch.sde_flags && batch.sde_flags.length > 0) {
    nextAnalysis.sde_flags = batch.sde_flags
  }
  if (batch.ev_equity_bridge && typeof batch.ev_equity_bridge === 'object') {
    nextAnalysis.ev_equity_bridge =
      batch.ev_equity_bridge as unknown as ImportedLedgerAnalysisLike['ev_equity_bridge']
  }
  if (batch.dcf_defaults && typeof batch.dcf_defaults === 'object') {
    nextAnalysis.dcf_defaults = {
      ...nextAnalysis.dcf_defaults,
      ...batch.dcf_defaults,
    }
  }

  base._imported_ledger_analysis = nextAnalysis as unknown as Record<string, unknown>
  base._imported_ledger_provenance = {
    provider,
    imported_at: new Date().toISOString(),
  } satisfies ImportedLedgerProvenance

  return base
}
