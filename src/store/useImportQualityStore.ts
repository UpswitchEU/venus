/**
 * Zustand store: Hermes / Titan `import quality` metadata per fiscal year + accounting
 * provider. Consumed by the manual calculator, bootstrap, and session restore.
 *
 * (Legacy name in code reviews: "spotlight" — no UI uses that name anymore.)
 */

import { create } from 'zustand'

export interface ImportQualityAuditFlag {
  field: string
  fiscal_year?: number | null
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  source_accounts: string[]
}

export interface ImportQualityFieldProvenance {
  field: string
  value: number | null
  source_accounts: string[]
  mapping_method: 'direct' | 'computed' | 'fallback' | 'manual'
}

export interface ImportQualityAiEnrichment {
  ledger_mappings: Array<{
    ledger_code: string
    upswitch_field: string
    confidence: number
    rationale_nl: string
    rationale_en: string
  }>
  normalization_hints: Array<{
    hint_code: string
    title_nl: string
    title_en: string
    rationale_nl: string
    rationale_en: string
    confidence: number
  }>
  review_tier: 'high_confidence' | 'needs_verification' | 'manual_required'
  generated_at: string
  model: string
}

/** One fiscal year’s `_import_quality` payload (keyed in `importQuality` by year string). */
export interface ImportQualityPerYear {
  confidence_score: number
  audit_flags: ImportQualityAuditFlag[]
  field_provenance: ImportQualityFieldProvenance[]
  total_accounts_processed: number
  accounts_mapped_directly: number
  accounts_fallback: number
  accounts_skipped: number
  fetched_at?: string | null
  source_provenance?: {
    provider?: string | null
    period_id?: string | null
    period_start_date?: string | null
    period_end_date?: string | null
    is_year_end?: boolean
    is_partial_period?: boolean
    provider_type_accounts?: number
    mapped_code_accounts?: number
    fallback_accounts?: number
    account_mapping_coverage_pct?: number
    source_digest?: string | null
    fetched_at?: string | null
  } | null
  /** Raw ledger rows that fell back / were unmapped in Hermes. */
  unmapped_ledger_lines?: Array<{ account_code: string; description: string }>
  ai_enrichment?: ImportQualityAiEnrichment
}

interface ImportQualityState {
  importQuality: Record<string, ImportQualityPerYear> | null
  /**
   * Accounting integration provider (e.g. yuki, exact). From
   * `business_context._imported_ledger_provenance.provider` when available.
   */
  provider: string | null
  setImportQuality: (
    quality: Record<string, ImportQualityPerYear>,
    opts?: { provider?: string | null }
  ) => void
  setProvider: (provider: string | null) => void
}

export const useImportQualityStore = create<ImportQualityState>((set) => ({
  importQuality: null,
  provider: null,
  setImportQuality: (quality, opts) =>
    set({
      importQuality: quality,
      provider: opts?.provider ?? null,
    }),
  setProvider: (provider) => set({ provider }),
}))
