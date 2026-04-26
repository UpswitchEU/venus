/**
 * Canonical Normalization Types (vendored for standalone Venus deploys)
 *
 * Keep in sync with `packages/types/src/normalization.ts` in the monorepo.
 * Venus on Vercel does not have `../../packages/types`; webpack cannot resolve
 * `@upswitch/types/*` without this local copy.
 */

export enum NormalizationCategory {
	OWNER_COMPENSATION = 'owner_compensation_adjustment',
	ONE_TIME_EXPENSES = 'one_time_expenses',
	PERSONAL_EXPENSES = 'personal_expenses',
	RELATED_PARTY = 'related_party_transactions',
	NON_RECURRING_REVENUE = 'non_recurring_revenue',
	NON_RECURRING_COSTS = 'non_recurring_costs',
	DEPRECIATION = 'depreciation_adjustment',
	FAMILY_EXPENSES = 'family_expenses',
	UNUSUAL_TRANSACTIONS = 'unusual_transactions',
	TAX_OPTIMIZATION = 'tax_optimization_reversal',
	DISCRETIONARY_EXPENSES = 'discretionary_expenses',
	OTHER_ADJUSTMENTS = 'other_adjustments',
}

export const NORMALIZATION_CATEGORY_VALUES = Object.values(NormalizationCategory) as string[];

export enum ConfidenceScore {
	LOW = 'low',
	MEDIUM = 'medium',
	HIGH = 'high',
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
	 * Owner role context — only meaningful for OWNER_COMPENSATION items.
	 *
	 * - 'working' : seller is an active operator. Add back the delta between
	 *   actual compensation and a market-rate replacement salary only.
	 * - 'passive' : seller is a non-operating shareholder. The full owner
	 *   compensation (salary + dividend + benefits) is added back to SDE
	 *   because the buyer does not need to replace the role.
	 */
	owner_role?: 'working' | 'passive';
	/**
	 * Replacement-manager benchmark salary used for the working-owner add-back
	 * computation. When present, the engine treats `amount` as the delta
	 * (actual_owner_compensation − replacement_salary).
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

export const CATEGORY_METADATA: Record<NormalizationCategory, NormalizationCategoryMetadata> = {
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
