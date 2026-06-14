/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 *
 * Source: apps/valuation-iq/src/domain/method_keys.py
 * Regenerate with: upswitch-platform sync:valuation-method-contracts
 */

export const VALUATION_RESULT_METHOD_KEYS = [
  'dcf',
  'ebitda_multiple',
  'omzet_multiple',
  'revenue_multiple',
  'sde_multiple',
  'adjusted_nav',
  'upswitch_adaptive',
  'arr_multiple',
  'fiscal_4x',
  'liquidation_analysis',
  'startup_valuation',
  'pe_ratio',
  'owner_adaptive',
  'custom_weighted',
  'real_estate_yield',
  'upswitch_adaptive_multiples_only',
] as const;

export type ValuationResultMethodKey = (typeof VALUATION_RESULT_METHOD_KEYS)[number];

export const VALUATION_METHOD_KEYS = [
  'upswitch_adaptive',
  'ebitda_multiple',
  'omzet_multiple',
  'dcf',
  'sde_multiple',
  'arr_multiple',
  'adjusted_nav',
  'fiscal_4x',
  'startup_valuation',
  'liquidation_analysis',
] as const;

export type ValuationMethodKey = (typeof VALUATION_METHOD_KEYS)[number];

export const DISTINCT_VALUATION_METHOD_COUNT = 10 as const;

export const VALUATION_METHOD_ALIASES = {
  'revenue_multiple': 'omzet_multiple',
} as const;

export type ValuationMethodAliasKey = keyof typeof VALUATION_METHOD_ALIASES;

export const VALUATION_METHOD_ALIAS_KEYS = [
  'revenue_multiple',
] as const;

export const REVENUE_METHOD_KEYS = [
  'omzet_multiple',
  'revenue_multiple',
] as const;

export const USER_WEIGHT_VALUATION_METHOD_KEYS = [
  'upswitch_adaptive',
  'ebitda_multiple',
  'omzet_multiple',
  'dcf',
  'sde_multiple',
  'arr_multiple',
  'adjusted_nav',
  'fiscal_4x',
  'startup_valuation',
  'liquidation_analysis',
  'revenue_multiple',
] as const;

export type UserWeightValuationMethodKey = (typeof USER_WEIGHT_VALUATION_METHOD_KEYS)[number];

export const NON_COMBINABLE_VALUATION_METHOD_KEYS = [
  'startup_valuation',
  'liquidation_analysis',
] as const;

export type NonCombinableValuationMethodKey =
  (typeof NON_COMBINABLE_VALUATION_METHOD_KEYS)[number];

export const VALUATION_PRIMARY_OMNI_METHOD_ORDER = [
  'upswitch_adaptive',
  'arr_multiple',
  'ebitda_multiple',
  'omzet_multiple',
  'revenue_multiple',
  'sde_multiple',
  'dcf',
  'adjusted_nav',
  'fiscal_4x',
  'liquidation_analysis',
] as const;

export type ValuationPrimaryOmniMethodKey =
  (typeof VALUATION_PRIMARY_OMNI_METHOD_ORDER)[number];

export const OMNI_CALC_PATCHABLE_METHODS = [
  'upswitch_adaptive',
  'ebitda_multiple',
  'dcf',
  'sde_multiple',
  'arr_multiple',
  'omzet_multiple',
  'revenue_multiple',
  'adjusted_nav',
  'fiscal_4x',
  'startup_valuation',
  'liquidation_analysis',
] as const;

export type OmniCalcPatchableMethod = (typeof OMNI_CALC_PATCHABLE_METHODS)[number];

function includesString(values: readonly string[], value: string): boolean {
  return values.includes(value);
}

export function normalizeValuationMethodKey(methodKey: unknown): string {
  if (methodKey === null || methodKey === undefined) return '';
  const raw =
    typeof methodKey === 'string'
      ? methodKey
      : String(
          (methodKey as { value?: unknown; name?: unknown }).value ??
            (methodKey as { value?: unknown; name?: unknown }).name ??
            methodKey,
        );
  const normalized = raw.trim().toLowerCase().replace(/-/g, '_').split(/\s+/).join('_');
  return VALUATION_METHOD_ALIASES[normalized as ValuationMethodAliasKey] ?? normalized;
}

export function isCanonicalValuationMethodKey(value: string): value is ValuationMethodKey {
  return includesString(VALUATION_METHOD_KEYS, value);
}

export function isUserWeightValuationMethodKey(
  value: string,
): value is UserWeightValuationMethodKey {
  return includesString(USER_WEIGHT_VALUATION_METHOD_KEYS, value);
}

export function isNonCombinableValuationMethodKey(
  value: string,
): value is NonCombinableValuationMethodKey {
  return includesString(NON_COMBINABLE_VALUATION_METHOD_KEYS, value);
}
