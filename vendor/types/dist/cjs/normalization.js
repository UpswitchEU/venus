"use strict";
/**
 * Canonical Normalization Types
 *
 * Single source of truth for EBITDA normalization types shared across
 * Venus (calculator UI), Mercury (report), and Titan (backend API).
 *
 * 12 adjustment categories aligned with the DB CHECK constraint
 * on valuation_adjustments.category.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.NORMALIZATION_CATEGORIES = exports.CATEGORY_METADATA = exports.ConfidenceScore = exports.NORMALIZATION_CATEGORY_VALUES = exports.NormalizationCategory = void 0;
var NormalizationCategory;
(function (NormalizationCategory) {
    NormalizationCategory["OWNER_COMPENSATION"] = "owner_compensation_adjustment";
    NormalizationCategory["ONE_TIME_EXPENSES"] = "one_time_expenses";
    NormalizationCategory["PERSONAL_EXPENSES"] = "personal_expenses";
    NormalizationCategory["RELATED_PARTY"] = "related_party_transactions";
    NormalizationCategory["NON_RECURRING_REVENUE"] = "non_recurring_revenue";
    NormalizationCategory["NON_RECURRING_COSTS"] = "non_recurring_costs";
    NormalizationCategory["DEPRECIATION"] = "depreciation_adjustment";
    NormalizationCategory["FAMILY_EXPENSES"] = "family_expenses";
    NormalizationCategory["UNUSUAL_TRANSACTIONS"] = "unusual_transactions";
    NormalizationCategory["TAX_OPTIMIZATION"] = "tax_optimization_reversal";
    NormalizationCategory["DISCRETIONARY_EXPENSES"] = "discretionary_expenses";
    NormalizationCategory["OTHER_ADJUSTMENTS"] = "other_adjustments";
})(NormalizationCategory || (exports.NormalizationCategory = NormalizationCategory = {}));
exports.NORMALIZATION_CATEGORY_VALUES = Object.values(NormalizationCategory);
var ConfidenceScore;
(function (ConfidenceScore) {
    ConfidenceScore["LOW"] = "low";
    ConfidenceScore["MEDIUM"] = "medium";
    ConfidenceScore["HIGH"] = "high";
})(ConfidenceScore || (exports.ConfidenceScore = ConfidenceScore = {}));
exports.CATEGORY_METADATA = {
    [NormalizationCategory.OWNER_COMPENSATION]: {
        id: NormalizationCategory.OWNER_COMPENSATION,
        label: 'Owner Compensation Adjustment',
        description: 'Adjust owner salary to market rate for replacement manager',
        examples: ['Owner paid above/below market rate', 'Excess owner benefits'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 15 },
    },
    [NormalizationCategory.ONE_TIME_EXPENSES]: {
        id: NormalizationCategory.ONE_TIME_EXPENSES,
        label: 'One-Time Expenses',
        description: "Non-recurring expenses that won't repeat",
        examples: ['Legal fees for lawsuit', 'Moving costs', 'Extraordinary repairs'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 10 },
    },
    [NormalizationCategory.PERSONAL_EXPENSES]: {
        id: NormalizationCategory.PERSONAL_EXPENSES,
        label: 'Personal Expenses',
        description: 'Owner personal expenses run through business',
        examples: ['Personal vehicle', 'Family travel', 'Personal insurance'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 5 },
    },
    [NormalizationCategory.RELATED_PARTY]: {
        id: NormalizationCategory.RELATED_PARTY,
        label: 'Related Party Transactions',
        description: 'Transactions with related parties at non-market rates',
        examples: ['Rent to owner-owned property', 'Services from family members'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 8 },
    },
    [NormalizationCategory.NON_RECURRING_REVENUE]: {
        id: NormalizationCategory.NON_RECURRING_REVENUE,
        label: 'Non-Recurring Revenue',
        description: "One-time revenue that won't repeat",
        examples: ['Sale of equipment', 'Insurance proceeds', 'One-time contract'],
        is_addback: false,
        typical_range: { min_percentage: 0, max_percentage: 10 },
    },
    [NormalizationCategory.NON_RECURRING_COSTS]: {
        id: NormalizationCategory.NON_RECURRING_COSTS,
        label: 'Non-Recurring Costs',
        description: "One-time costs that won't repeat",
        examples: ['Restructuring costs', 'One-time consulting', 'Launch costs'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 8 },
    },
    [NormalizationCategory.DEPRECIATION]: {
        id: NormalizationCategory.DEPRECIATION,
        label: 'Depreciation Adjustment',
        description: 'Adjust depreciation to economic reality',
        examples: ['Accelerated depreciation', 'Fully depreciated assets'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 5 },
    },
    [NormalizationCategory.FAMILY_EXPENSES]: {
        id: NormalizationCategory.FAMILY_EXPENSES,
        label: 'Family Expenses',
        description: 'Family member salaries/expenses above market',
        examples: ['Family member overpaid', 'Excess family benefits'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 5 },
    },
    [NormalizationCategory.UNUSUAL_TRANSACTIONS]: {
        id: NormalizationCategory.UNUSUAL_TRANSACTIONS,
        label: 'Unusual Transactions',
        description: 'Atypical transactions outside normal operations',
        examples: ['Sale of division', 'Litigation settlements', 'Write-offs'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 10 },
    },
    [NormalizationCategory.TAX_OPTIMIZATION]: {
        id: NormalizationCategory.TAX_OPTIMIZATION,
        label: 'Tax Optimization Reversal',
        description: 'Reverse tax minimization strategies',
        examples: ['Excessive depreciation', 'Timing differences'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 5 },
    },
    [NormalizationCategory.DISCRETIONARY_EXPENSES]: {
        id: NormalizationCategory.DISCRETIONARY_EXPENSES,
        label: 'Discretionary Expenses',
        description: 'Optional expenses new owner may not incur',
        examples: ['Excessive donations', 'Luxury upgrades', 'Non-essential subscriptions'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 3 },
    },
    [NormalizationCategory.OTHER_ADJUSTMENTS]: {
        id: NormalizationCategory.OTHER_ADJUSTMENTS,
        label: 'Other Adjustments',
        description: 'Other legitimate adjustments not covered above',
        examples: ['Industry-specific adjustments', 'Accounting policy changes'],
        is_addback: true,
        typical_range: { min_percentage: 0, max_percentage: 5 },
    },
};
/** Backward-compatible alias used by Titan. */
exports.NORMALIZATION_CATEGORIES = exports.CATEGORY_METADATA;
//# sourceMappingURL=normalization.js.map