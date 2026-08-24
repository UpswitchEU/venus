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
];
export const VALUATION_METHOD_KEYS = [
    'upswitch_adaptive',
    'ebitda_multiple',
    'omzet_multiple',
    'dcf',
    'sde_multiple',
    'arr_multiple',
    'adjusted_nav',
    'real_estate_yield',
    'fiscal_4x',
    'startup_valuation',
    'liquidation_analysis',
];
export const DISTINCT_VALUATION_METHOD_COUNT = 11;
export const VALUATION_METHOD_ALIASES = {
    'revenue_multiple': 'omzet_multiple',
};
export const VALUATION_METHOD_ALIAS_KEYS = [
    'revenue_multiple',
];
export const REVENUE_METHOD_KEYS = [
    'omzet_multiple',
    'revenue_multiple',
];
export const USER_WEIGHT_VALUATION_METHOD_KEYS = [
    'upswitch_adaptive',
    'ebitda_multiple',
    'omzet_multiple',
    'dcf',
    'sde_multiple',
    'arr_multiple',
    'adjusted_nav',
    'real_estate_yield',
    'fiscal_4x',
    'startup_valuation',
    'liquidation_analysis',
    'revenue_multiple',
];
export const NON_COMBINABLE_VALUATION_METHOD_KEYS = [
    'startup_valuation',
    'liquidation_analysis',
    'real_estate_yield',
];
export const VALUATION_PRIMARY_OMNI_METHOD_ORDER = [
    'upswitch_adaptive',
    'arr_multiple',
    'ebitda_multiple',
    'omzet_multiple',
    'revenue_multiple',
    'sde_multiple',
    'dcf',
    'adjusted_nav',
    'real_estate_yield',
    'fiscal_4x',
    'liquidation_analysis',
];
export const OMNI_CALC_PATCHABLE_METHODS = [
    'upswitch_adaptive',
    'ebitda_multiple',
    'dcf',
    'sde_multiple',
    'arr_multiple',
    'omzet_multiple',
    'revenue_multiple',
    'adjusted_nav',
    'real_estate_yield',
    'fiscal_4x',
    'startup_valuation',
    'liquidation_analysis',
];
function includesString(values, value) {
    return values.includes(value);
}
export function normalizeValuationMethodKey(methodKey) {
    if (methodKey === null || methodKey === undefined)
        return '';
    const raw = typeof methodKey === 'string'
        ? methodKey
        : String(methodKey.value ??
            methodKey.name ??
            methodKey);
    const normalized = raw.trim().toLowerCase().replace(/-/g, '_').split(/\s+/).join('_');
    return VALUATION_METHOD_ALIASES[normalized] ?? normalized;
}
export function isCanonicalValuationMethodKey(value) {
    return includesString(VALUATION_METHOD_KEYS, value);
}
export function isUserWeightValuationMethodKey(value) {
    return includesString(USER_WEIGHT_VALUATION_METHOD_KEYS, value);
}
export function isNonCombinableValuationMethodKey(value) {
    return includesString(NON_COMBINABLE_VALUATION_METHOD_KEYS, value);
}
//# sourceMappingURL=valuation-methods.js.map