/**
 * Spotlight Store — Guided Resolution
 *
 * Flags are addressed by DOM id: `${field}` or `${field}__${fiscalYear}` for multi-year forms.
 */

import { create } from 'zustand'

/** Stable id for data-spotlight-field and spotlight resolution. */
export function spotlightDomId(field: string, fiscalYear?: number | string | null): string {
  if (fiscalYear == null || fiscalYear === '') return field
  return `${field}__${fiscalYear}`
}

export function parseSpotlightDomId(domId: string): { field: string; yearKey: string | null } {
  const idx = domId.indexOf('__')
  if (idx === -1) return { field: domId, yearKey: null }
  return { field: domId.slice(0, idx), yearKey: domId.slice(idx + 2) }
}

export interface SpotlightAuditFlag {
  field: string
  fiscal_year?: number | null
  code: string
  severity: 'error' | 'warning' | 'info'
  message: string
  source_accounts: string[]
}

export interface SpotlightFieldProvenance {
  field: string
  value: number | null
  source_accounts: string[]
  mapping_method: 'direct' | 'computed' | 'fallback' | 'manual'
}

export interface SpotlightAiEnrichment {
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

export interface SpotlightImportQuality {
  confidence_score: number
  audit_flags: SpotlightAuditFlag[]
  field_provenance: SpotlightFieldProvenance[]
  total_accounts_processed: number
  accounts_mapped_directly: number
  accounts_fallback: number
  accounts_skipped: number
  fetched_at?: string | null
  /** Raw ledger rows that fell back / were unmapped in Hermes — for in-app resolution context. */
  unmapped_ledger_lines?: Array<{ account_code: string; description: string }>
  ai_enrichment?: SpotlightAiEnrichment
}

interface SpotlightState {
  isSpotlightActive: boolean
  importQuality: Record<string, SpotlightImportQuality> | null
  /**
   * Accounting integration provider key (e.g. 'yuki', 'exact', 'silverfin').
   * Sourced from `business_context._imported_ledger_provenance.provider` and used
   * by SourceDataPanel to attribute the import. Null when unknown / manual entry.
   */
  provider: string | null
  /** Ordered actionable flag targets (error → warning, then id). */
  orderedFlagDomIds: string[]
  resolvedFields: Set<string>
  /** Currently focused flag in navigation. */
  activeDomId: string | null
  showSourcePanel: boolean

  setImportQuality: (
    quality: Record<string, SpotlightImportQuality>,
    opts?: { forceSpotlight?: boolean; provider?: string | null }
  ) => void
  setProvider: (provider: string | null) => void
  applyUrlGuidance: (opts: { focusField?: string; flagYear?: string; forceSpotlight?: boolean }) => void
  activateSpotlight: () => void
  dismissSpotlight: () => void
  resolveField: (domId: string) => void
  nextFlag: () => void
  prevFlag: () => void
  toggleSourcePanel: () => void
  openSourcePanel: () => void
  getFieldProvenance: (field: string, yearKey?: string | null) => SpotlightFieldProvenance | null
  getFlagsForDomId: (domId: string) => SpotlightAuditFlag[]
  getFieldMappingMethod: (field: string, yearKey?: string | null) => 'direct' | 'computed' | 'fallback' | 'manual' | null
}

function severityOrder(sev: string): number {
  if (sev === 'error') return 0
  if (sev === 'warning') return 1
  return 2
}

function buildFlagOrder(quality: Record<string, SpotlightImportQuality>): string[] {
  const entries: { domId: string; severity: string }[] = []
  const seen = new Set<string>()

  for (const [yearKey, yearQuality] of Object.entries(quality)) {
    const yNum = parseInt(yearKey, 10)
    const fallbackYear = Number.isFinite(yNum) ? yNum : undefined
    for (const flag of yearQuality.audit_flags ?? []) {
      if (flag.severity === 'info') continue
      const fy = flag.fiscal_year ?? fallbackYear
      const domId = spotlightDomId(flag.field, fy ?? yearKey)
      if (seen.has(domId)) continue
      seen.add(domId)
      entries.push({ domId, severity: flag.severity })
    }
  }

  entries.sort((a, b) => {
    const d = severityOrder(a.severity) - severityOrder(b.severity)
    if (d !== 0) return d
    return a.domId.localeCompare(b.domId)
  })

  return entries.map(e => e.domId)
}

function unresolvedIds(state: SpotlightState): string[] {
  return state.orderedFlagDomIds.filter(id => !state.resolvedFields.has(id))
}

export const useSpotlightStore = create<SpotlightState>((set, get) => ({
  isSpotlightActive: false,
  importQuality: null,
  provider: null,
  orderedFlagDomIds: [],
  resolvedFields: new Set(),
  activeDomId: null,
  showSourcePanel: false,

  setImportQuality: (quality, opts) => {
    const orderedFlagDomIds = buildFlagOrder(quality)
    const actionable = orderedFlagDomIds.length > 0
    const shouldActivate = opts?.forceSpotlight === true || actionable

    const firstActive = orderedFlagDomIds[0] ?? null

    // Provider is always reset alongside import quality — it belongs to *this* import,
    // not the previous one. Callers without provenance pass null (or omit) and we clear.
    set({
      importQuality: quality,
      orderedFlagDomIds,
      resolvedFields: new Set(),
      activeDomId: firstActive,
      isSpotlightActive: shouldActivate,
      provider: opts?.provider ?? null,
    })
  },

  setProvider: (provider) => set({ provider }),

  applyUrlGuidance: (opts) => {
    const state = get()
    if (!state.importQuality) return

    if (opts.forceSpotlight) {
      set({ isSpotlightActive: true })
    }

    if (!opts.focusField) return

    let domId = spotlightDomId(
      opts.focusField,
      opts.flagYear != null && opts.flagYear !== '' ? opts.flagYear : undefined
    )
    if (!state.orderedFlagDomIds.includes(domId)) {
      domId = spotlightDomId(opts.focusField, undefined)
    }
    if (state.orderedFlagDomIds.includes(domId)) {
      set({ activeDomId: domId })
    }
  },

  activateSpotlight: () => set({ isSpotlightActive: true }),
  dismissSpotlight: () => set({ isSpotlightActive: false }),

  resolveField: (domId) => {
    const { resolvedFields, orderedFlagDomIds, activeDomId } = get()
    const next = new Set(resolvedFields)
    next.add(domId)

    const remaining = orderedFlagDomIds.filter(id => !next.has(id))
    const allResolved = remaining.length === 0

    const nextActive =
      activeDomId && remaining.includes(activeDomId) ? activeDomId : remaining[0] ?? null

    set({
      resolvedFields: next,
      isSpotlightActive: !allResolved,
      activeDomId: nextActive,
    })
  },

  nextFlag: () => {
    const state = get()
    const u = unresolvedIds(state)
    if (u.length === 0) return
    const cur = state.activeDomId && u.includes(state.activeDomId) ? state.activeDomId : u[0]
    const i = u.indexOf(cur)
    set({ activeDomId: u[(i + 1) % u.length] })
  },

  prevFlag: () => {
    const state = get()
    const u = unresolvedIds(state)
    if (u.length === 0) return
    const cur = state.activeDomId && u.includes(state.activeDomId) ? state.activeDomId : u[0]
    const i = u.indexOf(cur)
    set({ activeDomId: u[(i - 1 + u.length) % u.length] })
  },

  toggleSourcePanel: () => set(s => ({ showSourcePanel: !s.showSourcePanel })),
  openSourcePanel: () => set({ showSourcePanel: true }),

  getFieldProvenance: (field, yearKey) => {
    const { importQuality } = get()
    if (!importQuality) return null
    if (yearKey != null && importQuality[yearKey]) {
      return importQuality[yearKey].field_provenance.find(p => p.field === field) ?? null
    }
    for (const yq of Object.values(importQuality)) {
      const prov = yq.field_provenance.find(p => p.field === field)
      if (prov) return prov
    }
    return null
  },

  getFlagsForDomId: (domId) => {
    const { field, yearKey } = parseSpotlightDomId(domId)
    const { importQuality } = get()
    if (!importQuality) return []
    if (yearKey != null && importQuality[yearKey]) {
      return importQuality[yearKey].audit_flags.filter(f => f.field === field)
    }
    const out: SpotlightAuditFlag[] = []
    for (const yq of Object.values(importQuality)) {
      out.push(...yq.audit_flags.filter(f => f.field === field))
    }
    return out
  },

  getFieldMappingMethod: (field, yearKey) => {
    const prov = get().getFieldProvenance(field, yearKey)
    return prov?.mapping_method ?? null
  },
}))
