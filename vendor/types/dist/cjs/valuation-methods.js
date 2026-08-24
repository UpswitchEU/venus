"use strict";
/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 *
 * Source: apps/valuation-iq/src/domain/method_keys.py
 * Regenerate with: upswitch-platform sync:valuation-method-contracts
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.OMNI_CALC_PATCHABLE_METHODS = exports.VALUATION_PRIMARY_OMNI_METHOD_ORDER = exports.NON_COMBINABLE_VALUATION_METHOD_KEYS = exports.USER_WEIGHT_VALUATION_METHOD_KEYS = exports.REVENUE_METHOD_KEYS = exports.VALUATION_METHOD_ALIAS_KEYS = exports.VALUATION_METHOD_ALIASES = exports.DISTINCT_VALUATION_METHOD_COUNT = exports.VALUATION_METHOD_KEYS = exports.VALUATION_RESULT_METHOD_KEYS = void 0;
exports.normalizeValuationMethodKey = normalizeValuationMethodKey;
exports.isCanonicalValuationMethodKey = isCanonicalValuationMethodKey;
exports.isUserWeightValuationMethodKey = isUserWeightValuationMethodKey;
exports.isNonCombinableValuationMethodKey = isNonCombinableValuationMethodKey;
exports.VALUATION_RESULT_METHOD_KEYS = [
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
exports.VALUATION_METHOD_KEYS = [
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
exports.DISTINCT_VALUATION_METHOD_COUNT = 11;
exports.VALUATION_METHOD_ALIASES = {
    'revenue_multiple': 'omzet_multiple',
};
exports.VALUATION_METHOD_ALIAS_KEYS = [
    'revenue_multiple',
];
exports.REVENUE_METHOD_KEYS = [
    'omzet_multiple',
    'revenue_multiple',
];
exports.USER_WEIGHT_VALUATION_METHOD_KEYS = [
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
exports.NON_COMBINABLE_VALUATION_METHOD_KEYS = [
    'startup_valuation',
    'liquidation_analysis',
    'real_estate_yield',
];
exports.VALUATION_PRIMARY_OMNI_METHOD_ORDER = [
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
exports.OMNI_CALC_PATCHABLE_METHODS = [
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
function normalizeValuationMethodKey(methodKey) {
    if (methodKey === null || methodKey === undefined)
        return '';
    const raw = typeof methodKey === 'string'
        ? methodKey
        : String(methodKey.value ??
            methodKey.name ??
            methodKey);
    const normalized = raw.trim().toLowerCase().replace(/-/g, '_').split(/\s+/).join('_');
    return exports.VALUATION_METHOD_ALIASES[normalized] ?? normalized;
}
function isCanonicalValuationMethodKey(value) {
    return includesString(exports.VALUATION_METHOD_KEYS, value);
}
function isUserWeightValuationMethodKey(value) {
    return includesString(exports.USER_WEIGHT_VALUATION_METHOD_KEYS, value);
}
function isNonCombinableValuationMethodKey(value) {
    return includesString(exports.NON_COMBINABLE_VALUATION_METHOD_KEYS, value);
}
//# sourceMappingURL=valuation-methods.js.map