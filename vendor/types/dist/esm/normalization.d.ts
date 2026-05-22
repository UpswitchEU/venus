/**
 * Canonical Normalization Types
 *
 * Single source of truth for EBITDA normalization types shared across
 * Venus (calculator UI), Mercury (report), and Titan (backend API).
 *
 * 12 adjustment categories aligned with the DB CHECK constraint
 * on valuation_adjustments.category.
 */
export declare enum NormalizationCategory {
    OWNER_COMPENSATION = "owner_compensation_adjustment",
    ONE_TIME_EXPENSES = "one_time_expenses",
    PERSONAL_EXPENSES = "personal_expenses",
    RELATED_PARTY = "related_party_transactions",
    NON_RECURRING_REVENUE = "non_recurring_revenue",
    NON_RECURRING_COSTS = "non_recurring_costs",
    DEPRECIATION = "depreciation_adjustment",
    FAMILY_EXPENSES = "family_expenses",
    UNUSUAL_TRANSACTIONS = "unusual_transactions",
    TAX_OPTIMIZATION = "tax_optimization_reversal",
    DISCRETIONARY_EXPENSES = "discretionary_expenses",
    OTHER_ADJUSTMENTS = "other_adjustments"
}
export declare const NORMALIZATION_CATEGORY_VALUES: string[];
export declare enum ConfidenceScore {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high"
}
/** String literal union for contexts that only need the value, not the enum. */
export type ConfidenceScoreValue = `${ConfidenceScore}`;
export type NormalizationType = 'add' | 'subtract' | 'add_percent' | 'subtract_percent' | 'absolute';
export type NormalizationStatus = 'pending' | 'accepted' | 'rejected';
export type NormalizationSource = 'manual' | 'suggestion' | 'import' | 'ai';
export interface NormalizationItemBase {
    id: string;
    category: string;
    amount: number;
    is_addback: boolean;
    description?: string;
    note?: string;
    confidence_score?: ConfidenceScore;
    year?: number;
    ledger_code?: string;
    ledger_name?: string;
    /**
     * Owner role context. Only meaningful for owner-compensation items.
     *
     * - working: seller is an active operator; add back only the delta between
     *   actual compensation and a market-rate replacement salary.
     * - passive: seller is a non-operating shareholder; add back the full owner
     *   compensation because the buyer does not need to replace the role.
     */
    owner_role?: 'working' | 'passive';
    /**
     * Replacement-manager benchmark salary used for the working-owner add-back.
     * When present, engines treat `amount` as actual owner compensation minus
     * this benchmark salary.
     */
    replacement_salary_benchmark?: number;
}
export interface NormalizationCategoryMetadata {
    id: NormalizationCategory;
    label: string;
    description: string;
    examples: string[];
    is_addback: boolean;
    typical_range?: {
        min_percentage: number;
        max_percentage: number;
    };
}
export declare const CATEGORY_METADATA: Record<NormalizationCategory, NormalizationCategoryMetadata>;
/** Backward-compatible alias used by Titan. */
export declare const NORMALIZATION_CATEGORIES: Record<NormalizationCategory, NormalizationCategoryMetadata>;
//# sourceMappingURL=normalization.d.ts.map