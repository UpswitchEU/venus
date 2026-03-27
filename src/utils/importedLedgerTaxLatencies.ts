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
}

export interface ImportedLedgerTaxLatencyAnalysisLike {
  tax_latency_candidates?: ImportedLedgerTaxLatencyCandidate[]
}

export function buildTaxLatencyCandidatesFromImportedLedgerAnalysis(
  analysis: ImportedLedgerTaxLatencyAnalysisLike
): TaxLatencyCandidate[] {
  const candidates = analysis.tax_latency_candidates
  if (!candidates?.length) return []

  return candidates.map((candidate, index) => ({
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
  }))
}
