import { PRIMARY_OMNI_METHOD_ORDER } from './omniCalcMethods'
import { revenueMethodologySiblingKey } from '@/utils/extractValuationResultsMap'

/**
 * Method Field Configuration Registry
 *
 * Maps valuation method keys to the bonus input sections that should appear
 * in the ManualInputPanel when that method is pre-selected. Also maps
 * business-type categories to additional contextual input sections.
 *
 * Bonus sections are optional — the engine computes all methods from the base
 * input set (company, financials, ownership). These sections surface extra
 * fields that improve accuracy for the chosen method.
 *
 * Method *labels* (i18n) live in `@/constants/methodLabels.ts` (`METHOD_LABEL_KEYS`),
 * mapped to manualInput.methodSelector.* translation keys.
 */

export type InputSectionKey =
  | 'dcf_projections'
  | 'nav_asset_schedule'
  | 'saas_metrics'
  | 'revenue_quality'
  | 'sde_owner_compensation'

/**
 * Canonical order for bonus sections — matches `AdaptiveSections` JSX order and
 * `adaptiveHeaderSteps` step assignment. Union-of-methods must not depend on
 * arbitrary method-array order.
 */
const BONUS_SECTION_RENDER_ORDER: InputSectionKey[] = [
  'dcf_projections',
  'nav_asset_schedule',
  'saas_metrics',
  'revenue_quality',
  'sde_owner_compensation',
]

function sortBonusSectionsCanonical(sections: InputSectionKey[]): InputSectionKey[] {
  const rank = (k: InputSectionKey) => {
    const i = BONUS_SECTION_RENDER_ORDER.indexOf(k)
    return i === -1 ? BONUS_SECTION_RENDER_ORDER.length : i
  }
  return [...sections].sort((a, b) => rank(a) - rank(b))
}

export interface MethodFieldEntry {
  bonusSections: InputSectionKey[]
}

export const METHOD_FIELD_CONFIG: Record<string, MethodFieldEntry> = {
  upswitch_adaptive: { bonusSections: [] },
  ebitda_multiple: { bonusSections: ['revenue_quality'] },
  omzet_multiple: { bonusSections: ['revenue_quality'] },
  /** English UI / API alias for `omzet_multiple` — same bonus sections (see `extractValuationResultsMap`). */
  revenue_multiple: { bonusSections: ['revenue_quality'] },
  arr_multiple: { bonusSections: ['saas_metrics'] },
  dcf: { bonusSections: ['dcf_projections'] },
  sde_multiple: { bonusSections: ['sde_owner_compensation'] },
  adjusted_nav: { bonusSections: ['nav_asset_schedule'] },
  fiscal_4x: { bonusSections: [] },
  /** Startup engine renders its own dedicated `StartupValuationPanel` — no SME bonus sections. */
  startup_valuation: { bonusSections: [] },
}

export const BUSINESS_TYPE_SECTIONS: Record<string, InputSectionKey[]> = {
  saas: ['saas_metrics'],
  b2b_saas: ['saas_metrics'],
  b2c_saas: ['saas_metrics'],
  saas_software: ['saas_metrics'],
}

function normalizeBusinessSectionKey(value?: string | null): string | null {
  if (!value) return null
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function getBusinessSectionCandidates(
  businessCategory?: string | null,
  businessTypeId?: string | null
): string[] {
  const candidates = [
    normalizeBusinessSectionKey(businessTypeId),
    normalizeBusinessSectionKey(businessCategory),
    businessTypeId?.trim().toLowerCase() ?? null,
    businessCategory?.trim().toLowerCase() ?? null,
  ].filter((value): value is string => Boolean(value))

  const expanded = [...candidates]
  for (const candidate of candidates) {
    if (candidate.includes('saas') && !expanded.includes('saas')) {
      expanded.push('saas')
    }
  }

  return [...new Set(expanded)]
}

/** Optional SaaS hints from session / form (not only business-type registry id). */
export interface GetBonusSectionsSaasSignals {
  businessModel?: string | null
  /** business_context.business_category */
  businessContextCategory?: string | null
  /** business_context.sector_tag */
  sectorTag?: string | null
}

function shouldAddSaasMetricsFromSignals(signals?: GetBonusSectionsSaasSignals | null): boolean {
  if (!signals) return false
  const bm = (signals.businessModel ?? '').trim().toLowerCase()
  if (bm === 'b2b_saas' || bm === 'b2c_saas') return true
  if (bm.includes('saas')) return true
  const cat = (signals.businessContextCategory ?? '').trim().toLowerCase()
  if (cat.includes('saas')) return true
  const tag = (signals.sectorTag ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  if (tag.includes('saas')) return true
  return false
}

/**
 * Extract SaaS signals from valuation form state (aligns with Titan `business_context`).
 */
export function getBonusSectionsSaasSignalsFromFormData(formData: {
  business_model?: string
  business_context?: unknown
}): GetBonusSectionsSaasSignals {
  const ctx =
    formData.business_context && typeof formData.business_context === 'object'
      ? (formData.business_context as Record<string, unknown>)
      : null
  return {
    businessModel: formData.business_model ?? null,
    businessContextCategory:
      typeof ctx?.business_category === 'string' ? ctx.business_category : null,
    sectorTag: typeof ctx?.sector_tag === 'string' ? ctx.sector_tag : null,
  }
}

/**
 * Resolves which business-type id drives adaptive bonus sections: picker object wins,
 * then local `businessType`, then Zustand `business_type_id` when the panel and store
 * briefly disagree (e.g. session restore / async prefill).
 */
export function resolveBusinessTypeIdForBonusSections(
  selectedBusinessTypeId: string | null | undefined,
  formBusinessType: string | null | undefined,
  storeBusinessTypeId: string | null | undefined
): string | null {
  const fromPicker = selectedBusinessTypeId?.trim()
  if (fromPicker) return fromPicker
  const fromForm = formBusinessType?.trim()
  if (fromForm) return fromForm
  const fromStore =
    typeof storeBusinessTypeId === 'string' ? storeBusinessTypeId.trim() : ''
  return fromStore || null
}

/**
 * Methods available for upfront pre-selection in the top-bar dropdown.
 * Subset of PRIMARY_OMNI_METHOD_ORDER — only the methods that meaningfully
 * change the input experience are surfaced here.
 */
export const PRE_SELECTABLE_METHODS = [
  'upswitch_adaptive',
  'omzet_multiple',
  'arr_multiple',
  'ebitda_multiple',
  'dcf',
  'sde_multiple',
  'adjusted_nav',
  'fiscal_4x',
  /** Venture / pre-revenue path — Berkus + Scorecard + VC blend. */
  'startup_valuation',
] as const

export type PreSelectableMethod = (typeof PRE_SELECTABLE_METHODS)[number]

export const PRE_SELECTABLE_METHOD_SET = new Set<string>(PRE_SELECTABLE_METHODS)

/**
 * Market & Income methods that can be combined and weighted in a blended valuation.
 * These all answer "What is the Fair Market Value to an outside buyer?" Includes
 * `adjusted_nav` (corrected NAV) so accountants can blend floor value with multiples/DCF.
 */
export const COMBINABLE_METHODS = new Set([
  'ebitda_multiple',
  'dcf',
  'sde_multiple',
  'omzet_multiple',
  /** Same economics as `omzet_multiple` — must be combinable for blended weights when API uses English key. */
  'revenue_multiple',
  'arr_multiple',
  'adjusted_nav',
])

/**
 * Standalone methods that cannot be blended with other methods.
 * Each serves a distinct legal/financial purpose (tax filing, proprietary algorithm) or
 * is the engine default umbrella (`upswitch_adaptive`).
 */
export const STANDALONE_METHODS = new Set([
  'upswitch_adaptive',
  'fiscal_4x',
  /** Startup engine consumes its own qualitative inputs and cannot be blended with SME methods. */
  'startup_valuation',
])

/**
 * Methods that must not appear together in a blend (double-counting or duplicate lens).
 * - SDE vs EBITDA: different owner-compensation bases.
 * - Omzet vs revenue_multiple: same market approach keyed differently (EN/NL).
 * - SDE vs NAV: SDE excludes balance-sheet-driven valuations (conceptually incompatible).
 */
export const MUTUALLY_EXCLUSIVE_PAIRS: ReadonlyArray<[string, string]> = [
  ['sde_multiple', 'ebitda_multiple'],
  ['omzet_multiple', 'revenue_multiple'],
  ['sde_multiple', 'adjusted_nav'],
]

/**
 * Engine `data_quality_warnings.type` values that have a guided assistant CTA (label + prefilled prompt).
 * Keep in sync with `chatAssistant` message keys via {@link QUALITY_WARNING_ASSISTANT_CTA_CONFIG}.
 */
export const QUALITY_WARNING_ASSISTANT_CTA_KEYS = [
  'thin_comparables_proxy',
  'owner_concentration_skipped_missing_inputs',
  'ebitda_divergence',
] as const

export type QualityWarningAssistantCtaKey = (typeof QUALITY_WARNING_ASSISTANT_CTA_KEYS)[number]

/**
 * i18n keys under `chatAssistant` for each guided CTA — single source for {@link QUALITY_WARNING_ASSISTANT_CTA_KEYS}.
 */
export const QUALITY_WARNING_ASSISTANT_CTA_CONFIG = {
  thin_comparables_proxy: {
    labelKey: 'qualityCtaThinComparablesLabel',
    promptKey: 'qualityCtaThinComparablesPrompt',
  },
  owner_concentration_skipped_missing_inputs: {
    labelKey: 'qualityCtaOwnerConcentrationLabel',
    promptKey: 'qualityCtaOwnerConcentrationPrompt',
  },
  ebitda_divergence: {
    labelKey: 'qualityCtaEbitdaDivergenceLabel',
    promptKey: 'qualityCtaEbitdaDivergencePrompt',
  },
} as const satisfies Record<
  QualityWarningAssistantCtaKey,
  { labelKey: string; promptKey: string }
>

export function isActionableQualityWarningType(type: string | null | undefined): boolean {
  return (
    !!type && Object.prototype.hasOwnProperty.call(QUALITY_WARNING_ASSISTANT_CTA_CONFIG, type)
  )
}

/**
 * Returns the method that conflicts with the given method, or null.
 */
export function getConflictingMethod(method: string): string | null {
  for (const [a, b] of MUTUALLY_EXCLUSIVE_PAIRS) {
    if (method === a) return b
    if (method === b) return a
  }
  return null
}

/**
 * Whether a method is standalone (selecting it deselects everything else).
 */
export function isStandaloneMethod(method: string): boolean {
  return STANDALONE_METHODS.has(method)
}

/**
 * Whether a method is combinable (can be multi-selected and weighted).
 */
export function isCombinableMethod(method: string): boolean {
  return COMBINABLE_METHODS.has(method)
}

/**
 * Sanitizes a method selection array to enforce exclusivity rules.
 * Used when restoring from session or any bulk-set path that bypasses togglePreSelectedMethod.
 *
 * Rules:
 *   1. If any standalone method is present, keep only the first standalone.
 *   2. Among combinable methods, remove one side of each mutually exclusive pair.
 *   3. Empty → fallback to ['upswitch_adaptive'].
 */
export function sanitizeMethodSelection(methods: string[]): string[] {
  if (methods.length === 0) return ['upswitch_adaptive']

  const hasStandalone = methods.some(isStandaloneMethod)
  if (hasStandalone) {
    const first = methods.find(isStandaloneMethod)!
    return [first]
  }

  const seen = new Set<string>()
  const result: string[] = []
  for (const m of methods) {
    if (!isCombinableMethod(m)) continue
    const conflict = getConflictingMethod(m)
    if (conflict && seen.has(conflict)) continue
    seen.add(m)
    result.push(m)
  }

  return result.length === 0 ? ['upswitch_adaptive'] : result
}

/**
 * Method keys for the synthesis weighting UI when blending multiple non-adaptive methods.
 * Does not filter by valuation result availability — the synthesis weighting UI handles
 * missing or partial results. Empty when fewer than two methods or when `upswitch_adaptive` is selected.
 */
export function getSynthesisMethodKeysForUi(preSelectedMethods: string[]): string[] {
  const isMultiMethod =
    preSelectedMethods.length > 1 && !preSelectedMethods.includes('upswitch_adaptive')
  if (!isMultiMethod) return []
  return [...preSelectedMethods]
}

/**
 * Belgian fiscal reference (4× EBITDA) is not offered for Dutch accountant firms.
 * Keeps the nav dropdown aligned with Titan/PDF fiscal gating.
 */
export function getPreSelectableMethodsForFirm(firmCountryCode?: string | null): readonly string[] {
  const code = (firmCountryCode ?? 'BE').trim().toUpperCase().substring(0, 2)
  if (code === 'NL') {
    return PRE_SELECTABLE_METHODS.filter((m) => m !== 'fiscal_4x')
  }
  return PRE_SELECTABLE_METHODS
}

/**
 * Same as {@link getPreSelectableMethodsForFirm} — revenue is accepted for
 * signature compatibility but does not filter any methods.
 */
export function getPreSelectableMethodsForFirmAndRevenue(
  firmCountryCode?: string | null,
  _currentYearRevenue?: number | null
): readonly string[] {
  return getPreSelectableMethodsForFirm(firmCountryCode)
}

/**
 * Whether an upfront nav pick is permitted for the given allowed-method list
 * (from {@link getPreSelectableMethodsForFirmAndRevenue} / {@link getPreSelectableMethodsForFirm}).
 */
export function isUpfrontMethodAllowedForNav(
  method: string,
  allowed: readonly string[]
): boolean {
  return method === 'upswitch_adaptive' || allowed.includes(method)
}

/** Nav label key when the stored upfront pick may be invalid for the current firm/turnover rules. */
export function resolveDisplayPreSelectedMethodKey(
  preSelectedMethod: string | null | undefined,
  allowed: readonly string[]
): string {
  const raw = preSelectedMethod ?? 'upswitch_adaptive'
  return isUpfrontMethodAllowedForNav(raw, allowed) ? raw : 'upswitch_adaptive'
}

if (process.env.NODE_ENV !== 'production') {
  const missingPreselect = PRE_SELECTABLE_METHODS.filter((method) => !(method in METHOD_FIELD_CONFIG))
  if (missingPreselect.length > 0) {
    throw new Error(`Missing METHOD_FIELD_CONFIG entries for: ${missingPreselect.join(', ')}`)
  }
  // Keep in sync with `PRIMARY_OMNI_METHOD_ORDER` so result keys / edit flows always resolve bonus sections.
  const missingPrimary = PRIMARY_OMNI_METHOD_ORDER.filter((method) => !(method in METHOD_FIELD_CONFIG))
  if (missingPrimary.length > 0) {
    throw new Error(
      `Missing METHOD_FIELD_CONFIG entries for primary omni keys: ${missingPrimary.join(', ')}`
    )
  }
}

export function getBonusSections(
  method: string,
  businessCategory?: string | null,
  businessTypeId?: string | null,
  saasSignals?: GetBonusSectionsSaasSignals | null
): InputSectionKey[] {
  const methodSections = METHOD_FIELD_CONFIG[method]?.bonusSections ?? []
  const combined = [...methodSections]

  for (const candidate of getBusinessSectionCandidates(businessCategory, businessTypeId)) {
    for (const section of BUSINESS_TYPE_SECTIONS[candidate] ?? []) {
      if (!combined.includes(section)) combined.push(section)
    }
  }
  if (shouldAddSaasMetricsFromSignals(saasSignals) && !combined.includes('saas_metrics')) {
    combined.push('saas_metrics')
  }
  return sortBonusSectionsCanonical(combined)
}

/**
 * Union of bonus sections across multiple selected methods.
 * Used when accountant selects 2+ methods for blended valuation.
 */
export function getBonusSectionsForMethods(
  methods: string[],
  businessCategory?: string | null,
  businessTypeId?: string | null,
  saasSignals?: GetBonusSectionsSaasSignals | null
): InputSectionKey[] {
  const combined: InputSectionKey[] = []
  for (const method of methods) {
    for (const section of getBonusSections(method, businessCategory, businessTypeId, saasSignals)) {
      if (!combined.includes(section)) combined.push(section)
    }
  }
  return sortBonusSectionsCanonical(combined)
}

/**
 * Distribute 100% weight equally across methods (integer percentages).
 * Remainder is distributed one-by-one to the first methods to ensure exact 100% sum.
 */
export function equalWeightsFor(methods: string[]): Record<string, number> {
  if (methods.length === 0) return {}
  const base = Math.floor(100 / methods.length)
  const remainder = 100 - base * methods.length
  const weights: Record<string, number> = {}
  methods.forEach((m, i) => {
    weights[m] = base + (i < remainder ? 1 : 0)
  })
  return weights
}

/**
 * Integer % weights (sum 100) for Waarderingssynthese → Titan `user_weights` (÷100).
 * - Aligns `omzet_multiple` / `revenue_multiple` when one side is missing (ValuationIQ may echo EN key).
 * - If any selected method has no weight or the sum is not ~100% (±2pp), uses {@link equalWeightsFor}.
 */
export function pickSynthesisPercentWeightForMethod(
  methodKey: string,
  userWeights: Record<string, number>
): number | undefined {
  const v = userWeights[methodKey]
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const sibling = revenueMethodologySiblingKey(methodKey)
  if (sibling) {
    const alt = userWeights[sibling]
    if (typeof alt === 'number' && Number.isFinite(alt)) return alt
  }
  return undefined
}

export function resolveSynthesisPercentWeightsForMethods(
  methods: string[],
  userWeights: Record<string, number>
): Record<string, number> | null {
  if (methods.length < 2) return null
  if (methods.includes('upswitch_adaptive')) return null

  const filtered: Record<string, number> = {}
  for (const m of methods) {
    const v = pickSynthesisPercentWeightForMethod(m, userWeights)
    if (v != null) filtered[m] = v
  }
  const sum = Object.values(filtered).reduce((s, x) => s + x, 0)
  if (Object.keys(filtered).length < methods.length || Math.abs(sum - 100) > 2) {
    return equalWeightsFor(methods)
  }
  return filtered
}

/** Digits only, max length 3 (0–100) for synthesis weight text fields. */
export function sanitizeSynthesisWeightDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 3)
}

/**
 * When one method’s weight changes, scale the others proportionally and fix rounding so the sum is 100%.
 * Used by Waarderingssynthese sliders and percentage inputs.
 */
export function rebalanceMethodWeights(
  weights: Record<string, number>,
  changedKey: string,
  newValue: number
): Record<string, number> {
  const keys = Object.keys(weights)
  const oldValue = weights[changedKey] ?? 0
  const delta = newValue - oldValue
  const otherKeys = keys.filter((k) => k !== changedKey)

  if (otherKeys.length === 0) {
    return { ...weights, [changedKey]: 100 }
  }

  const result: Record<string, number> = { ...weights, [changedKey]: newValue }
  const otherSum = otherKeys.reduce((s, k) => s + weights[k], 0)

  if (otherSum === 0) {
    const share = Math.max(0, Math.round(-delta / otherKeys.length))
    otherKeys.forEach((k) => {
      result[k] = share
    })
  } else {
    otherKeys.forEach((k) => {
      result[k] = Math.max(0, Math.round(weights[k] - (delta * weights[k]) / otherSum))
    })
  }

  const total = Object.values(result).reduce((s, v) => s + v, 0)
  if (total !== 100 && otherKeys.length > 0) {
    const correction = 100 - total
    const maxKey = otherKeys.reduce((a, b) => (result[a] >= result[b] ? a : b))
    result[maxKey] = Math.max(0, result[maxKey] + correction)
  }

  return result
}

/**
 * When 3+ methods are selected, use "remainder on last" instead of proportional rebalance:
 * the last method in `methods` (stable selection order from the manual store) gets
 * `100% − sum(first n−1)` so users can set e.g. 20% / 70% / 10% by editing the first two rows.
 */
export function usesRemainderWeightModel(methods: string[]): boolean {
  return methods.length >= 3
}

/**
 * Ensure last method equals the remainder to 100% after free weights.
 * If free weights sum above 100%, scale them down proportionally (hydration / edge cases).
 */
export function normalizeRemainderWeights(
  methods: string[],
  weights: Record<string, number>
): Record<string, number> {
  if (methods.length < 3) {
    return { ...weights }
  }
  const remainderKey = methods[methods.length - 1]
  const freeMethods = methods.slice(0, -1)
  const result: Record<string, number> = {}

  let sumFree = 0
  for (const k of freeMethods) {
    const w = Math.max(0, Math.round(weights[k] ?? 0))
    result[k] = w
    sumFree += w
  }

  if (sumFree > 100) {
    let acc = 0
    freeMethods.forEach((k, i) => {
      if (i === freeMethods.length - 1) {
        result[k] = Math.max(0, 100 - acc)
      } else {
        const raw = Math.max(0, weights[k] ?? 0)
        const v = Math.max(0, Math.floor((raw * 100) / sumFree))
        result[k] = v
        acc += v
      }
    })
    sumFree = freeMethods.reduce((s, k) => s + result[k], 0)
  }

  result[remainderKey] = Math.max(0, 100 - sumFree)
  return result
}

/**
 * Apply a change to one method's weight. For 3+ methods, only free methods (all except last)
 * are editable; the last method is always `100 − sum(free)`.
 */
export function applyRemainderRebalance(
  methods: string[],
  weights: Record<string, number>,
  changedKey: string,
  newValue: number
): Record<string, number> {
  if (methods.length < 3) {
    return rebalanceMethodWeights(weights, changedKey, newValue)
  }
  const remainderKey = methods[methods.length - 1]
  const freeMethods = methods.slice(0, -1)
  if (!methods.includes(changedKey)) {
    return normalizeRemainderWeights(methods, weights)
  }
  if (changedKey === remainderKey) {
    return normalizeRemainderWeights(methods, weights)
  }
  const clamped = Math.min(100, Math.max(0, Math.round(newValue)))
  const otherFreeSum = freeMethods
    .filter((k) => k !== changedKey)
    .reduce((s, k) => s + Math.max(0, Math.round(weights[k] ?? 0)), 0)
  const maxForChanged = Math.max(0, 100 - otherFreeSum)
  const v = Math.min(clamped, maxForChanged)

  const result: Record<string, number> = {}
  for (const k of freeMethods) {
    if (k === changedKey) {
      result[k] = v
    } else {
      result[k] = Math.max(0, Math.round(weights[k] ?? 0))
    }
  }
  const sumFree = freeMethods.reduce((s, k) => s + result[k], 0)
  result[remainderKey] = Math.max(0, 100 - sumFree)
  return result
}
