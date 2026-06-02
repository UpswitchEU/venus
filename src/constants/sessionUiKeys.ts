/**
 * Session JSONB keys for Venus-only UI state (not sent to ValuationIQ).
 */

import {
  getPreSelectableMethodsForFirmAndRevenue,
  isUpfrontMethodAllowedForNav,
} from './methodFieldConfig'

export const SESSION_PRE_SELECTED_VALUATION_METHOD_KEY = '_pre_selected_valuation_method' as const

/** Legacy / alternate key (matches SessionNormalizer). */
export const SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY =
  'pre_selected_valuation_method' as const

/** Multi-method selection for blended valuation. */
export const SESSION_PRE_SELECTED_METHODS_KEY = '_pre_selected_valuation_methods' as const

/** User-configured weights (JSON object: method_key → 0-100). */
export const SESSION_USER_WEIGHTS_KEY = '_user_weights' as const

/** Accountant justification for the chosen weighting. */
export const SESSION_USER_WEIGHT_JUSTIFICATION_KEY = '_user_weight_justification' as const

/**
 * True if session JSONB already carries an upfront method preference (any key variant).
 * Also true when only `_pre_selected_valuation_methods` is present (multi-select persisted
 * without legacy single-key rows) so URL `?selected_method=` seeding does not call
 * `setPreSelectedMethod` and collapse the selection to one method.
 */
export function sessionHasStoredPreSelectedMethod(sessionData: unknown): boolean {
  if (!sessionData || typeof sessionData !== 'object') return false
  const o = sessionData as Record<string, unknown>
  if (
    SESSION_PRE_SELECTED_VALUATION_METHOD_KEY in o ||
    SESSION_PRE_SELECTED_VALUATION_METHOD_ALT_KEY in o
  ) {
    return true
  }
  const multi = o[SESSION_PRE_SELECTED_METHODS_KEY]
  if (Array.isArray(multi) && multi.length > 0) return true
  const flatMulti = o.pre_selected_valuation_methods
  if (Array.isArray(flatMulti) && flatMulti.length > 0) return true
  const selectedMethods = o.selected_methods
  if (Array.isArray(selectedMethods) && selectedMethods.length > 0) return true
  const methods = o.methods
  if (Array.isArray(methods) && methods.length > 0) return true
  const sm = o.selected_method
  return typeof sm === 'string' && sm.trim().length > 0
}

/**
 * Normalize a persisted or URL-provided method key to a valid pre-selectable method, or null.
 *
 * By default, "valid" means present in the firm's calculator-nav list
 * ({@link getPreSelectableMethodsForFirmAndRevenue}). Pass `allowedMethodsOverride`
 * to gate against a narrower list — e.g. an owner/founder visiting the standalone
 * `/calculator` should never have a URL like `?selected_method=dcf` resolve to
 * an active method, because the nav only renders the 3 owner-founder methods
 * and the active selection would otherwise be invisible. The owner-founder
 * intersection is computed in `ManualLayout` (via
 * `filterPreSelectableMethodsForOwnerFounder`) and forwarded into
 * `usePreSelectedMethodSessionSync`.
 */
export function sanitizePreSelectedValuationMethod(
  raw: string | null | undefined,
  firmCountryCode?: string | null,
  currentYearRevenue?: number | null,
  allowedMethodsOverride?: readonly string[] | null
): string | null {
  if (raw == null || typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  const allowed =
    allowedMethodsOverride && allowedMethodsOverride.length > 0
      ? allowedMethodsOverride
      : getPreSelectableMethodsForFirmAndRevenue(firmCountryCode, currentYearRevenue)
  if (!isUpfrontMethodAllowedForNav(lower, allowed)) return null
  return lower === 'upswitch_adaptive' ? null : lower
}

/** Multi-method selection persisted on session / form JSONB (not sent to ValuationIQ). */
export function readPreSelectedValuationMethods(source: object): string[] | undefined {
  const record = source as Record<string, unknown>
  const raw =
    record[SESSION_PRE_SELECTED_METHODS_KEY] ??
    record.pre_selected_valuation_methods ??
    record.selected_methods ??
    record.methods
  if (!Array.isArray(raw)) return undefined
  const methods = raw.filter((method): method is string => typeof method === 'string')
  return methods.length > 0 ? methods : undefined
}

/**
 * JSONB payload for `_pre_selected_valuation_method`: `null` means AI adaptive.
 */
export function toSessionPreSelectedFieldValue(
  preSelectedMethod: string | null,
  selectedMethod: string
): string | null {
  const effective = preSelectedMethod ?? selectedMethod
  return effective === 'upswitch_adaptive' ? null : effective
}
