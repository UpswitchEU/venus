import type { TaxLatencyCandidate } from '../store/useTaxLatencyStore'

export interface ImportedLedgerTaxLatencyCandidate {
  account_code: string
  account_name: string
  description: string
  suggested_question: string
  rationale?: string
  category?: 'real_estate' | 'provision' | 'deferred_tax'
  fiscal_year?: number
  tax_rate?: number
  temporary_difference?: number
  type?: 'active' | 'passive'
  auto_apply?: boolean
  status?: string
  evidence_id?: string
  reviewed_at?: string
  rule_version?: string
  approved_by?: string
  currency?: string
  effective_date?: string
}

export interface ImportedLedgerTaxLatencyAnalysisLike {
  tax_latency_candidates?: ImportedLedgerTaxLatencyCandidate[]
}

// Mirrors the titan-api guard. The matcher there now blocks BE MAR class 6/7/8/9
// (P&L + off-balance) at source, but already-persisted analyses from earlier
// builds still carry false positives like MAR 630200 "Afschrijvingen op
// gebouwen". Filter them defensively on read so the UI cleans itself up
// without forcing a re-import.
const PROFIT_AND_LOSS_OR_OFF_BALANCE_PREFIX = /^[6789]/

export function buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
  analysis: ImportedLedgerTaxLatencyAnalysisLike
): TaxLatencyCandidate[] {
  const candidates = analysis.tax_latency_candidates
  if (!candidates?.length) return []

  return candidates
    .filter((candidate) => {
      const code = String(candidate.account_code ?? '').trim()
      if (!code) return false
      return !PROFIT_AND_LOSS_OR_OFF_BALANCE_PREFIX.test(code)
    })
    .map((candidate, index) => ({
      id: `tax_latency_${candidate.fiscal_year ?? 'y'}_${candidate.account_code}_${index}`,
      type: candidate.type === 'active' ? 'active' : 'passive',
      accountCode: candidate.account_code,
      accountName: candidate.account_name,
      description: candidate.description,
      suggestedQuestion: candidate.suggested_question,
      rationale: candidate.rationale,
      temporaryDifference:
        candidate.temporary_difference != null ? Number(candidate.temporary_difference) : undefined,
      taxRate: candidate.tax_rate != null ? Number(candidate.tax_rate) : 25,
      year: candidate.fiscal_year,
      autoApply: Boolean(candidate.auto_apply),
      ...(candidate.status ? { status: candidate.status } : {}),
      ...(candidate.evidence_id ? { evidence_id: candidate.evidence_id } : {}),
      ...(candidate.reviewed_at ? { reviewed_at: candidate.reviewed_at } : {}),
      ...(candidate.rule_version ? { rule_version: candidate.rule_version } : {}),
      ...(candidate.approved_by ? { approved_by: candidate.approved_by } : {}),
      ...(candidate.currency ? { currency: candidate.currency.toUpperCase() } : {}),
      ...(candidate.fiscal_year != null ? { fiscal_year: candidate.fiscal_year } : {}),
      ...(candidate.effective_date ? { effective_date: candidate.effective_date } : {}),
    }))
}
