import {
  deriveCombinableMethods,
  deriveMethodFieldConfig,
  deriveMutuallyExclusivePairs,
  derivePreSelectableMethods,
  deriveStandaloneMethods,
} from '@/lib/methods/registry'
import type { InputSectionKey } from '@/lib/methods/types'
import { businessTypeCategoryStrings } from '@/utils/businessTypeCategory'
import { revenueMethodologySiblingKey } from '@/utils/extractValuationResultsMap'
import { PRIMARY_OMNI_METHOD_ORDER } from './omniCalcMethods'

/**
 * Method Field Configuration — derived view over the canonical method registry.
 *
 * The 10 valuation methods are declared once in `@/lib/methods/registry.ts`
 * (a `MethodSpec` per method). The legacy constants below — `METHOD_FIELD_CONFIG`,
 * `PRE_SELECTABLE_METHODS`, `COMBINABLE_METHODS`, `STANDALONE_METHODS`,
 * `MUTUALLY_EXCLUSIVE_PAIRS` — are *derived* from that registry so adding an
 * 11th method requires editing exactly one entry (the spec) instead of five
 * separate top-level constants.
 *
 * Method *labels* (i18n) live in `@/constants/methodLabels.ts`, also derived
 * from the same registry. `BUSINESS_TYPE_SECTIONS` and the quality-warning CTA
 * config below are independent of the method registry and remain inline.
 */

export type { InputSectionKey }

/**
 * Canonical order for bonus sections — matches `AdaptiveSections` JSX order and
 * `adaptiveHeaderSteps` step assignment. Union-of-methods must not depend on
 * arbitrary method-array order.
 */
const BONUS_SECTION_RENDER_ORDER: InputSectionKey[] = [
  /** Fiscal inputs lead so the meerwaarde dossier reads top-to-bottom:
   * legal context (peildatum / company role / interne meerwaarde / EBITDA
   * basis / aanschaffingswaarde + four-anchor "hoogste van" worksheet)
   * before any going-concern numerics. fiscal_4x is standalone, so this
   * placement only affects pre-Omni order on its own page. */
  'fiscal_inputs',
  'dcf_projections',
  'nav_asset_schedule',
  'saas_metrics',
  'revenue_quality',
  'sde_owner_compensation',
  /** Liquidation-specific bonus section — renders after nav_asset_schedule
   * so the advisor enters general balance-sheet adjustments first, then
   * liquidation-specific overrides (cascade buckets / wind-down / tax). */
  'liquidation_inputs',
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

/**
 * Method → bonus section map. Derived from `@/lib/methods/registry.ts`. Per-method
 * notes (fiscal_4x's Belgian capital-gains worksheet, liquidation_analysis's
 * IVS 104 + Boek-XX + Faillissementswet pipeline) live in each spec's docblock.
 */
export const METHOD_FIELD_CONFIG: Record<string, MethodFieldEntry> = deriveMethodFieldConfig()

export const BUSINESS_TYPE_SECTIONS: Record<string, InputSectionKey[]> = {
  saas: ['saas_metrics'],
  b2b_saas: ['saas_metrics'],
  b2c_saas: ['saas_metrics'],
  saas_software: ['saas_metrics'],
}

function normalizeBusinessSectionKey(value?: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
}

function getNormalizedBusinessSectionKeys(value?: unknown): string[] {
  return businessTypeCategoryStrings(value)
    .map(normalizeBusinessSectionKey)
    .filter((candidate): candidate is string => Boolean(candidate))
}

function getBusinessSectionCandidates(
  businessCategory?: unknown,
  businessTypeId?: unknown
): string[] {
  const candidates = [
    ...getNormalizedBusinessSectionKeys(businessTypeId),
    ...getNormalizedBusinessSectionKeys(businessCategory),
  ]

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
  const fromStore = typeof storeBusinessTypeId === 'string' ? storeBusinessTypeId.trim() : ''
  return fromStore || null
}

/**
 * Methods available for upfront pre-selection in the top-bar dropdown.
 * Subset of PRIMARY_OMNI_METHOD_ORDER — only methods that meaningfully change
 * the input experience are surfaced here. Derived from the method registry.
 */
export const PRE_SELECTABLE_METHODS: readonly string[] = derivePreSelectableMethods()

export type PreSelectableMethod = string

export const PRE_SELECTABLE_METHOD_SET = new Set<string>(PRE_SELECTABLE_METHODS)

/**
 * Market & Income methods that can be combined and weighted in a blended
 * valuation. Derived from the method registry — each spec sets `combinable`.
 */
export const COMBINABLE_METHODS: ReadonlySet<string> = deriveCombinableMethods()

/**
 * Standalone methods that cannot be blended with other methods. Each serves a
 * distinct legal/financial purpose, operates on a different premise of value
 * (IVS 104), or is the engine default umbrella (`upswitch_adaptive`). Derived
 * from the method registry — each spec sets `standalone`.
 */
export const STANDALONE_METHODS: ReadonlySet<string> = deriveStandaloneMethods()

/**
 * Methods that must not appear together in a blend. Derived from the method
 * registry — each spec declares its `mutuallyExclusiveWith` peers and the
 * registry deduplicates them into unique unordered pairs.
 */
export const MUTUALLY_EXCLUSIVE_PAIRS: ReadonlyArray<readonly [string, string]> =
  deriveMutuallyExclusivePairs()

/**
 * Engine `data_quality_warnings.type` values that have a guided assistant CTA (label + prefilled prompt).
 * Keep in sync with `chatAssistant` message keys via {@link QUALITY_WARNING_ASSISTANT_CTA_CONFIG}.
 */
export const QUALITY_WARNING_ASSISTANT_CTA_KEYS = [
  'thin_comparables_proxy',
  'owner_concentration_skipped_missing_inputs',
  'ebitda_divergence',
  'method_substitution',
  'ebitda_benchmark_deviation',
  'net_debt_unavailable',
  'owner_compensation_estimated',
  'book_equity_unavailable',
  // Yuki audit (May 2026): emitted by the business-logic validator when any
  // year shows normalised EBITDA ≥ 100% of revenue. The CTA opens a guided
  // remediation flow in the assistant (verify EBITDA mapping; suggest the
  // Vastgoed carve-out toggle when the entity holds its property).
  'impossible_margin',
] as const

export type QualityWarningAssistantCtaKey = (typeof QUALITY_WARNING_ASSISTANT_CTA_KEYS)[number]

export type ActionableQualityWarningType = QualityWarningAssistantCtaKey

/**
 * i18n keys under `chatAssistant` for each guided CTA — single source for {@link QUALITY_WARNING_ASSISTANT_CTA_KEYS}.
 *
 * Each entry can supply a `titleKey` / `bodyKey` to override the raw engine
 * `warning.message` / `warning.recommendation`. The engine voice tends to
 * lead with the failure ("could not be executed…"); the override copy leads
 * with what actually happened ("substitute method used") so the advisor
 * doesn't read a successful valuation as a broken one. Engine text remains
 * the fallback when no override is present.
 */
export const QUALITY_WARNING_ASSISTANT_CTA_CONFIG = {
  thin_comparables_proxy: {
    labelKey: 'qualityCtaThinComparablesLabel',
    promptKey: 'qualityCtaThinComparablesPrompt',
    titleKey: 'qualityTitleThinComparables',
    bodyKey: 'qualityBodyThinComparables',
  },
  owner_concentration_skipped_missing_inputs: {
    labelKey: 'qualityCtaOwnerConcentrationLabel',
    promptKey: 'qualityCtaOwnerConcentrationPrompt',
    titleKey: 'qualityTitleOwnerConcentration',
    bodyKey: 'qualityBodyOwnerConcentration',
  },
  ebitda_divergence: {
    labelKey: 'qualityCtaEbitdaDivergenceLabel',
    promptKey: 'qualityCtaEbitdaDivergencePrompt',
    titleKey: 'qualityTitleEbitdaDivergence',
    bodyKey: 'qualityBodyEbitdaDivergence',
  },
  method_substitution: {
    labelKey: 'qualityCtaMethodSubstitutionLabel',
    promptKey: 'qualityCtaMethodSubstitutionPrompt',
    titleKey: 'qualityTitleMethodSubstitution',
    bodyKey: 'qualityBodyMethodSubstitution',
  },
  ebitda_benchmark_deviation: {
    labelKey: 'qualityCtaEbitdaBenchmarkDeviationLabel',
    promptKey: 'qualityCtaEbitdaBenchmarkDeviationPrompt',
    titleKey: 'qualityTitleEbitdaBenchmarkDeviation',
    bodyKey: 'qualityBodyEbitdaBenchmarkDeviation',
  },
  // Surfaced when Step 7 had to assume net debt = 0 because no balance
  // sheet was supplied. Owner-managed micro-SMEs hit this constantly because
  // they don't volunteer balance data on a 5-minute valuation; the CTA opens
  // a guided fix in the assistant rather than blocking submit.
  net_debt_unavailable: {
    labelKey: 'qualityCtaNetDebtLabel',
    promptKey: 'qualityCtaNetDebtPrompt',
    titleKey: 'qualityTitleNetDebt',
    bodyKey: 'qualityBodyNetDebt',
  },
  owner_compensation_estimated: {
    labelKey: 'qualityCtaOwnerCompEstimatedLabel',
    promptKey: 'qualityCtaOwnerCompEstimatedPrompt',
    titleKey: 'qualityTitleOwnerCompEstimated',
    bodyKey: 'qualityBodyOwnerCompEstimated',
  },
  book_equity_unavailable: {
    labelKey: 'qualityCtaBookEquityLabel',
    promptKey: 'qualityCtaBookEquityPrompt',
    titleKey: 'qualityTitleBookEquity',
    bodyKey: 'qualityBodyBookEquity',
  },
  // ``impossible_margin`` — emitted when any year shows normalised EBITDA
  // margin ≥ 100% of revenue. The prompt walks the user through the three
  // most common culprits: aggressive normalisations, non-revenue income
  // (rental / intercompany), or an operating entity that holds property
  // inside the same NV (Vastgoed carve-out toggle is the right fix).
  impossible_margin: {
    labelKey: 'qualityCtaImpossibleMarginLabel',
    promptKey: 'qualityCtaImpossibleMarginPrompt',
    titleKey: 'qualityTitleImpossibleMargin',
    bodyKey: 'qualityBodyImpossibleMargin',
  },
} as const satisfies Record<
  QualityWarningAssistantCtaKey,
  { labelKey: string; promptKey: string; titleKey: string; bodyKey: string }
>

/** Same keys as {@link QUALITY_WARNING_ASSISTANT_CTA_KEYS} — use for Set membership / auto-open. */
export const ACTIONABLE_QUALITY_WARNING_TYPES = new Set<string>([
  ...QUALITY_WARNING_ASSISTANT_CTA_KEYS,
])

export function isActionableQualityWarningType(
  type: string | null | undefined
): type is ActionableQualityWarningType {
  return !!type && Object.hasOwn(QUALITY_WARNING_ASSISTANT_CTA_CONFIG, type)
}

/**
 * Engine warning types whose fix is a small set of known financial fields the
 * advisor can fill inline — no chat round-trip, no live session needed. Each
 * field maps to a key on `current_year_data` (the engine's balance source for
 * the EV→Equity bridge) plus i18n label/hint keys under `chatAssistant`.
 *
 * Only the balance gap ships today; the other actionable warnings stay on the
 * guided-chat CTA until their own inline forms land.
 */
export interface QualityWarningInlineFixFieldConfig {
  /** Key on `current_year_data` that is written to the form and sent to the engine. */
  key: 'cash' | 'total_debt' | 'current_liabilities'
  labelKey: string
  hintKey?: string
}

export const QUALITY_WARNING_INLINE_FIX_CONFIG: Partial<
  Record<QualityWarningAssistantCtaKey, QualityWarningInlineFixFieldConfig[]>
> = {
  net_debt_unavailable: [
    { key: 'cash', labelKey: 'qualityFieldCashLabel', hintKey: 'qualityFieldCashHint' },
    {
      key: 'total_debt',
      labelKey: 'qualityFieldTotalDebtLabel',
      hintKey: 'qualityFieldTotalDebtHint',
    },
    {
      key: 'current_liabilities',
      labelKey: 'qualityFieldCurrentLiabilitiesLabel',
      hintKey: 'qualityFieldCurrentLiabilitiesHint',
    },
  ],
}

/** Inline-fix field spec for a warning type, or undefined when it has no inline form. */
export function getQualityWarningInlineFix(
  type: string | null | undefined
): QualityWarningInlineFixFieldConfig[] | undefined {
  return isActionableQualityWarningType(type) ? QUALITY_WARNING_INLINE_FIX_CONFIG[type] : undefined
}

/**
 * Warning types whose fix is an existing form control (a "picker gap"): the CTA
 * scrolls the advisor straight to that control instead of opening a chat turn.
 * Values are DOM ids rendered by the manual input panel — keep in sync with the
 * `id={...}` anchors on those sections.
 */
export const QUALITY_WARNING_JUMP_CONFIG: Partial<Record<QualityWarningAssistantCtaKey, string>> = {
  // "Sector controleren" → the business-type / sector picker.
  thin_comparables_proxy: 'manual-section-company',
  // "Methodekeuze herstellen" → the method-configuration area.
  method_substitution: 'manual-section-methods',
}

/** Scroll-anchor id for a warning's jump-to-control CTA, or undefined. */
export function getQualityWarningJumpAnchor(type: string | null | undefined): string | undefined {
  return isActionableQualityWarningType(type) ? QUALITY_WARNING_JUMP_CONFIG[type] : undefined
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
    const first = methods.find(isStandaloneMethod)
    if (first) return [first]
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
export function isUpfrontMethodAllowedForNav(method: string, allowed: readonly string[]): boolean {
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
  const missingPreselect = PRE_SELECTABLE_METHODS.filter(
    (method) => !(method in METHOD_FIELD_CONFIG)
  )
  if (missingPreselect.length > 0) {
    throw new Error(`Missing METHOD_FIELD_CONFIG entries for: ${missingPreselect.join(', ')}`)
  }
  // Keep in sync with `PRIMARY_OMNI_METHOD_ORDER` so result keys / edit flows always resolve bonus sections.
  const missingPrimary = PRIMARY_OMNI_METHOD_ORDER.filter(
    (method) => !(method in METHOD_FIELD_CONFIG)
  )
  if (missingPrimary.length > 0) {
    throw new Error(
      `Missing METHOD_FIELD_CONFIG entries for primary omni keys: ${missingPrimary.join(', ')}`
    )
  }
}

export function getBonusSections(
  method: string,
  businessCategory?: unknown,
  businessTypeId?: unknown,
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
  businessCategory?: unknown,
  businessTypeId?: unknown,
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
