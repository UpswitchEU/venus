/**
 * GENERATED FILE - DO NOT EDIT DIRECTLY.
 *
 * Source: apps/valuation-iq/src/domain/method_keys.py
 * Regenerate with: upswitch-platform sync:valuation-method-contracts
 */
export declare const VALUATION_RESULT_METHOD_KEYS: readonly ["dcf", "ebitda_multiple", "omzet_multiple", "revenue_multiple", "sde_multiple", "adjusted_nav", "upswitch_adaptive", "arr_multiple", "fiscal_4x", "liquidation_analysis", "startup_valuation", "pe_ratio", "owner_adaptive", "custom_weighted", "real_estate_yield", "upswitch_adaptive_multiples_only"];
export type ValuationResultMethodKey = (typeof VALUATION_RESULT_METHOD_KEYS)[number];
export declare const VALUATION_METHOD_KEYS: readonly ["upswitch_adaptive", "ebitda_multiple", "omzet_multiple", "dcf", "sde_multiple", "arr_multiple", "adjusted_nav", "real_estate_yield", "fiscal_4x", "startup_valuation", "liquidation_analysis"];
export type ValuationMethodKey = (typeof VALUATION_METHOD_KEYS)[number];
export declare const DISTINCT_VALUATION_METHOD_COUNT: 11;
export declare const VALUATION_METHOD_ALIASES: {
    readonly revenue_multiple: "omzet_multiple";
};
export type ValuationMethodAliasKey = keyof typeof VALUATION_METHOD_ALIASES;
export declare const VALUATION_METHOD_ALIAS_KEYS: readonly ["revenue_multiple"];
export declare const REVENUE_METHOD_KEYS: readonly ["omzet_multiple", "revenue_multiple"];
export declare const USER_WEIGHT_VALUATION_METHOD_KEYS: readonly ["upswitch_adaptive", "ebitda_multiple", "omzet_multiple", "dcf", "sde_multiple", "arr_multiple", "adjusted_nav", "real_estate_yield", "fiscal_4x", "startup_valuation", "liquidation_analysis", "revenue_multiple"];
export type UserWeightValuationMethodKey = (typeof USER_WEIGHT_VALUATION_METHOD_KEYS)[number];
export declare const NON_COMBINABLE_VALUATION_METHOD_KEYS: readonly ["startup_valuation", "liquidation_analysis", "real_estate_yield"];
export type NonCombinableValuationMethodKey = (typeof NON_COMBINABLE_VALUATION_METHOD_KEYS)[number];
export declare const VALUATION_PRIMARY_OMNI_METHOD_ORDER: readonly ["upswitch_adaptive", "arr_multiple", "ebitda_multiple", "omzet_multiple", "revenue_multiple", "sde_multiple", "dcf", "adjusted_nav", "real_estate_yield", "fiscal_4x", "liquidation_analysis"];
export type ValuationPrimaryOmniMethodKey = (typeof VALUATION_PRIMARY_OMNI_METHOD_ORDER)[number];
export declare const OMNI_CALC_PATCHABLE_METHODS: readonly ["upswitch_adaptive", "ebitda_multiple", "dcf", "sde_multiple", "arr_multiple", "omzet_multiple", "revenue_multiple", "adjusted_nav", "real_estate_yield", "fiscal_4x", "startup_valuation", "liquidation_analysis"];
export type OmniCalcPatchableMethod = (typeof OMNI_CALC_PATCHABLE_METHODS)[number];
export declare function normalizeValuationMethodKey(methodKey: unknown): string;
export declare function isCanonicalValuationMethodKey(value: string): value is ValuationMethodKey;
export declare function isUserWeightValuationMethodKey(value: string): value is UserWeightValuationMethodKey;
export declare function isNonCombinableValuationMethodKey(value: string): value is NonCombinableValuationMethodKey;
//# sourceMappingURL=valuation-methods.d.ts.map