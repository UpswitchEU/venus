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
  dcf: { bonusSections: ['dcf_projections'] },
  adjusted_nav: { bonusSections: ['nav_asset_schedule'] },
  fiscal_4x: { bonusSections: [] },
}

export const BUSINESS_TYPE_SECTIONS: Record<string, InputSectionKey[]> = {
  saas_software: ['saas_metrics'],
}

/**
 * Methods available for upfront pre-selection in the top-bar dropdown.
 * Subset of PRIMARY_OMNI_METHOD_ORDER — only the methods that meaningfully
 * change the input experience are surfaced here.
 */
export const PRE_SELECTABLE_METHODS = [
  'upswitch_adaptive',
  'ebitda_multiple',
  'dcf',
  'adjusted_nav',
  'fiscal_4x',
] as const

export type PreSelectableMethod = (typeof PRE_SELECTABLE_METHODS)[number]

export const PRE_SELECTABLE_METHOD_SET = new Set<string>(PRE_SELECTABLE_METHODS)

if (process.env.NODE_ENV !== 'production') {
  const missingConfig = PRE_SELECTABLE_METHODS.filter((method) => !(method in METHOD_FIELD_CONFIG))
  if (missingConfig.length > 0) {
    throw new Error(
      `Missing METHOD_FIELD_CONFIG entries for: ${missingConfig.join(', ')}`
    )
  }
}

export function getBonusSections(
  method: string,
  businessCategory?: string | null
): InputSectionKey[] {
  const methodSections = METHOD_FIELD_CONFIG[method]?.bonusSections ?? []
  const businessSections = businessCategory ? (BUSINESS_TYPE_SECTIONS[businessCategory] ?? []) : []
  const combined = [...methodSections]
  for (const s of businessSections) {
    if (!combined.includes(s)) combined.push(s)
  }
  return combined
}
