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
 * Method *labels* (i18n) live in CalculatorNav's METHOD_LABEL_KEYS constant,
 * mapped to manualInput.methodSelector.* translation keys.
 */

export type InputSectionKey =
  | 'dcf_projections'
  | 'nav_asset_schedule'
  | 'saas_metrics'
  | 'revenue_quality'

export interface MethodFieldEntry {
  bonusSections: InputSectionKey[]
}

export const METHOD_FIELD_CONFIG: Record<string, MethodFieldEntry> = {
  upswitch_adaptive: { bonusSections: [] },
  ebitda_multiple: { bonusSections: ['revenue_quality'] },
  omzet_multiple: { bonusSections: ['revenue_quality'] },
  arr_multiple: { bonusSections: ['saas_metrics'] },
  dcf: { bonusSections: ['dcf_projections'] },
  adjusted_nav: { bonusSections: ['nav_asset_schedule'] },
  fiscal_4x: { bonusSections: [] },
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
  'adjusted_nav',
  'fiscal_4x',
] as const

export type PreSelectableMethod = (typeof PRE_SELECTABLE_METHODS)[number]

export const PRE_SELECTABLE_METHOD_SET = new Set<string>(PRE_SELECTABLE_METHODS)

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
 * Same as {@link getPreSelectableMethodsForFirm}, but omits revenue-multiple (omzet) when
 * current-year turnover is known to be ≤ 0 (holdings / asset-led cases).
 */
export function getPreSelectableMethodsForFirmAndRevenue(
  firmCountryCode?: string | null,
  currentYearRevenue?: number | null
): readonly string[] {
  const base = getPreSelectableMethodsForFirm(firmCountryCode)
  if (currentYearRevenue == null || !Number.isFinite(currentYearRevenue)) {
    return base
  }
  if (currentYearRevenue <= 0) {
    return base.filter((m) => m !== 'omzet_multiple')
  }
  return base
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
  const missingConfig = PRE_SELECTABLE_METHODS.filter((method) => !(method in METHOD_FIELD_CONFIG))
  if (missingConfig.length > 0) {
    throw new Error(`Missing METHOD_FIELD_CONFIG entries for: ${missingConfig.join(', ')}`)
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
  return combined
}
