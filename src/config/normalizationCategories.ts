/**
 * EBITDA Normalization Categories Configuration
 *
 * Defines all 12 adjustment categories with complete metadata for UI and validation
 * These categories transform reported EBITDA to economic truth
 */

import {
  NormalizationCategory,
  NormalizationCategoryDefinition,
} from '../types/ebitdaNormalization'

export const NORMALIZATION_CATEGORIES: NormalizationCategoryDefinition[] = [
  {
    id: NormalizationCategory.OWNER_COMPENSATION,
    label: 'Owner Compensation Adjustment',
    description: 'Adjust owner salary to market rate for equivalent role',
    detailedDescription:
      'SME owners often take below-market salaries to minimize tax. This adjustment normalizes owner compensation to market rates for equivalent roles (CEO, CFO, COO), reflecting true operating costs. If the owner performs billable work or operational duties, this should also include replacement cost.',
    examples: [
      'Owner takes €50k but market is €120k → -€70k (future costs higher)',
      'Owner takes no salary but works full-time → -€120k (add market rate cost)',
      'Owner overpaid at €150k vs €80k market → +€70k (future costs lower)',
      'Family members €100k for minimal work vs €30k market → +€70k (excess add-back)',
      'Multiple owners sharing duties → Adjust each to market rates',
    ],
    marketRateLogic:
      'Query industry salary benchmarks for C-level roles based on company size, industry, and location. Typical CEO salaries range from €60k (micro SME) to €150k+ (larger SME).',
    validationRules: {
      min: -500000,
      max: 500000,
      warningThreshold: 100000,
      warningMessage:
        'Large owner compensation adjustments (>€100k) may be questioned by buyers. Ensure strong documentation and market rate justification.',
    },
    confidenceFactors: [
      'Owner role clarity (single role vs. multiple roles)',
      'Industry benchmark availability',
      'Company size alignment with benchmarks',
      'Geographic location data quality',
    ],
    helpText:
      'SUBTRACT if owner underpaid (future costs higher). ADD if owner/family overpaid (future costs lower).',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Owner/family overpaid for actual work performed',
      negativeScenario: 'Owner takes below-market salary (future replacement costs more)',
    },
  },

  {
    id: NormalizationCategory.ONE_TIME_EXPENSES,
    label: 'One-Time Expenses',
    description: "Remove non-recurring expenses that won't repeat",
    detailedDescription:
      "One-time expenses (legal fees for disputes, restructuring costs, fire damage repairs, moving costs, extraordinary consulting fees) distort true earning power. These should be added back to show normalized performance as they won't recur in future operations.",
    examples: [
      "Legal settlement: €30k → +€30k (won't repeat)",
      'Office relocation: €15k → +€15k (one-time)',
      'Fire damage repairs: €25k → +€25k (extraordinary)',
      'Restructuring consulting: €20k → +€20k (non-recurring)',
      "Contract termination penalty: €10k → +€10k (won't repeat)",
    ],
    marketRateLogic:
      'No market rate - user identifies from financial records. Review income statement for unusual or non-recurring expense items.',
    validationRules: {
      min: 0,
      max: 1000000,
      warningThreshold: 50000,
      warningMessage:
        'One-time expenses >€50k should be clearly documented with supporting evidence for buyer due diligence.',
    },
    helpText:
      "ADD back expenses that won't repeat. These inflated costs and won't affect future performance.",
    adjustmentDirection: 'add',
    visualGuidance: {
      positiveScenario: "Non-recurring expenses that won't repeat in future operations",
      negativeScenario: 'Not applicable - one-time expenses are always add-backs',
    },
  },

  {
    id: NormalizationCategory.PERSONAL_EXPENSES,
    label: 'Personal Expenses',
    description: 'Remove personal expenses run through business',
    detailedDescription:
      "SME owners often run personal expenses through the business for tax optimization (home office beyond reasonable allocation, personal vehicle usage, personal travel labeled as business, family meals, personal insurance). These should be added back as they won't be incurred by the new owner.",
    examples: [
      "Personal vehicle (€10k) → +€10k (new owner won't pay)",
      'Excessive home office (€5k) → +€5k (personal portion)',
      'Personal travel as "business" (€8k) → +€8k (won\'t repeat)',
      'Family vacations (€12k) → +€12k (clearly personal)',
      'Personal phone/internet (€3k) → +€3k (excess allocation)',
    ],
    marketRateLogic:
      'Estimate based on revenue size. Typical range: 1-3% of revenue for micro SMEs (<€1M), 0.5-1.5% for larger SMEs (€1M-€5M).',
    validationRules: {
      min: 0,
      max: 100000,
      warningThreshold: 20000,
      warningMessage:
        'Personal expenses >€20k require detailed documentation and clear business/personal allocation methodology.',
    },
    helpText:
      "ADD back personal expenses. New owner won't incur these, so they don't reduce future EBITDA.",
    adjustmentDirection: 'add',
    visualGuidance: {
      positiveScenario: "Personal expenses run through business that new owner won't incur",
      negativeScenario: 'Not applicable - personal expenses are always add-backs',
    },
  },

  {
    id: NormalizationCategory.RELATED_PARTY,
    label: 'Related Party Transactions',
    description: "Adjust non-arm's length transactions to market rates",
    detailedDescription:
      "Transactions with related parties (family members, other businesses owned by same person, shareholder loans) may not be at market rates. Adjust to arm's length pricing to reflect true cost of operations under independent ownership.",
    examples: [
      'Paying above-market rent to owner (€60k vs €40k) → +€20k (future cost lower)',
      'Below-market rent from owner (€20k vs €40k) → -€20k (future cost higher)',
      'Above-market interest to owner (8% vs 5%) → +€10k (excess add-back)',
      'Below-market services from owner company → -€15k (future pays market)',
      'Management fees to related party above market → +€25k (excess add-back)',
    ],
    marketRateLogic:
      'Compare to market rates for equivalent services, assets, or financing. Use local commercial real estate data for rent, bank rates for loans, and industry rates for services.',
    validationRules: {
      min: -200000,
      max: 200000,
      warningThreshold: 30000,
      warningMessage:
        'Related party adjustments >€30k require clear market rate justification with comparable transaction evidence.',
    },
    helpText:
      'Adjust to market rates. ADD if overpaying (future costs lower). SUBTRACT if underpaying (future costs higher).',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Paying above-market rates to related parties (future owner pays less)',
      negativeScenario: 'Paying below-market rates (future owner pays market rates)',
    },
  },

  {
    id: NormalizationCategory.NON_RECURRING_REVENUE,
    label: 'Non-Recurring Revenue',
    description: "Remove one-time revenue that won't repeat",
    detailedDescription:
      "One-time revenue sources (asset sales, insurance payouts, contract termination payments, government grants, lawsuit settlements) inflate reported EBITDA but won't recur. These must be removed to show sustainable earning power.",
    examples: [
      "Equipment sale: €40k → -€40k (won't repeat)",
      'Insurance payout: €25k → -€25k (one-time)',
      'Contract termination fee: €50k → -€50k (extraordinary)',
      'COVID-19 grants: €30k → -€30k (non-recurring)',
      'Lawsuit settlement: €35k → -€35k (unusual)',
    ],
    marketRateLogic:
      'No market rate - user identifies from financial records. Review income statement for unusual revenue items or other income category.',
    validationRules: {
      min: -1000000,
      max: 0,
      warningThreshold: -50000,
      warningMessage:
        "Removing revenue >€50k significantly reduces EBITDA. Document clearly why this revenue won't recur.",
    },
    helpText:
      "SUBTRACT one-time revenue (enter negative). This removes inflated EBITDA that won't repeat.",
    adjustmentDirection: 'subtract',
    visualGuidance: {
      positiveScenario: 'Not applicable - non-recurring revenue is always subtracted',
      negativeScenario: "One-time revenue that inflated EBITDA but won't recur",
    },
  },

  {
    id: NormalizationCategory.NON_RECURRING_COSTS,
    label: 'Non-Recurring Cost Savings',
    description: "Adjust for temporary cost reductions that won't continue",
    detailedDescription:
      'Temporary cost reductions (COVID rent forgiveness, temporary wage reductions, one-time supplier discounts, deferred maintenance) artificially inflate EBITDA. Future operations will incur costs at normal levels, so these temporary savings must be removed.',
    examples: [
      'COVID rent forgiveness (€15k) → -€15k (costs return to normal)',
      "One-time supplier discount (€10k) → -€10k (won't repeat)",
      'Temporary wage cuts (€25k) → -€25k (costs normalized)',
      'Deferred maintenance showing as "savings" → -€20k (will catch up)',
      'Promotional pricing received (temporary) → adjust accordingly',
    ],
    marketRateLogic:
      'No market rate - user assesses normal cost structure. Compare to historical cost levels and industry norms.',
    validationRules: {
      min: -100000,
      max: 100000,
      warningThreshold: 20000,
      warningMessage:
        'Cost adjustments >€20k should be supported by historical data and explanation of cost normalization.',
    },
    helpText:
      'SUBTRACT temporary cost savings (future costs higher). Rarely ADD for deferred costs coming due.',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Rare: Deferred costs that will be incurred soon',
      negativeScenario: 'Temporary cost savings that artificially inflated EBITDA',
    },
  },

  {
    id: NormalizationCategory.DEPRECIATION,
    label: 'Depreciation & Amortization Adjustment',
    description: 'Adjust D&A to reflect actual capital needs',
    detailedDescription:
      'While EBITDA excludes D&A, significant mismatches between D&A and actual capex requirements affect quality of earnings. Accelerated depreciation for tax purposes or fully-depreciated assets still in use may need adjustment to reflect economic reality.',
    examples: [
      'Accelerated D&A for tax (€30k excess) → +€30k (add back tax timing)',
      'Fully-depreciated assets still in use → May need negative adjustment',
      'Recent large capex not yet in D&A → -€25k (future D&A higher)',
      'Non-cash intangible amortization → +€20k (add back if excessive)',
      'D&A significantly below historical capex → Adjust to normalize',
    ],
    marketRateLogic:
      'Compare annual D&A to actual capital expenditures over 3-5 years. Sustainable capex should approximately equal D&A over time.',
    validationRules: {
      min: -100000,
      max: 100000,
      warningThreshold: 30000,
      warningMessage:
        'D&A adjustments >€30k suggest significant capital structure issues. Provide detailed explanation and capex analysis.',
    },
    helpText:
      'Advanced adjustment. ADD if D&A overstated. SUBTRACT if understated relative to capex needs.',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Accelerated/excessive D&A above actual capital replacement needs',
      negativeScenario: "Understated D&A that doesn't reflect true capital requirements",
    },
  },

  {
    id: NormalizationCategory.FAMILY_EXPENSES,
    label: 'Family & Friends on Payroll',
    description: 'Adjust family member compensation to market rates',
    detailedDescription:
      'Family members on payroll may be overpaid (nepotism) or underpaid (family labor). Adjust to market rates for actual roles performed. This is separate from owner compensation - it covers additional family members who may be overcompensated for minimal work or undercompensated for significant contributions.',
    examples: [
      'Spouse at €80k doing minimal work vs €30k market → +€50k (excess add-back)',
      'Child "learning" at €60k vs €35k market → +€25k (overpaid add-back)',
      'Retired parent as "consultant" not working (€30k) → +€30k (remove entirely)',
      'Family member underpaid (€30k vs €50k market) → -€20k (future costs higher)',
      'Multiple family in nominal roles → Adjust each to market',
    ],
    marketRateLogic:
      'Market rates for actual roles performed, not job titles. Research comparable roles in local market for company size.',
    validationRules: {
      min: -200000,
      max: 200000,
      warningThreshold: 40000,
      warningMessage:
        'Family compensation adjustments >€40k require detailed role descriptions and market rate analysis.',
    },
    helpText:
      'ADD if family overpaid (future costs lower). SUBTRACT if underpaid (future costs higher).',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Family members overpaid relative to actual work performed',
      negativeScenario: 'Family members underpaid (future replacement at market rate)',
    },
  },

  {
    id: NormalizationCategory.UNUSUAL_TRANSACTIONS,
    label: 'Unusual or Distorted Transactions',
    description: 'Remove impact of unusual transactions',
    detailedDescription:
      "Unusual transactions that distort normal operations should be normalized. This includes litigation costs, regulatory penalties, extraordinary gains/losses, significant bad debt write-offs, or accounting adjustments from prior periods. These are non-operating items that don't reflect sustainable earning power.",
    examples: [
      "Regulatory fine (€25k) → +€25k (won't repeat)",
      'Unusual bad debt write-off (€20k) → +€20k (extraordinary)',
      'Business interruption loss (€30k) → +€30k (one-time)',
      'FX gain (€15k) → -€15k (remove windfall)',
      'Prior period adjustment → Normalize to show true performance',
    ],
    marketRateLogic:
      'No market rate - user judgment based on nature and recurrence likelihood of transactions.',
    validationRules: {
      min: -500000,
      max: 500000,
      warningThreshold: 50000,
      warningMessage:
        'Unusual transaction adjustments >€50k require extensive documentation and clear explanation of non-recurring nature.',
    },
    helpText:
      "ADD unusual expenses that won't repeat. SUBTRACT unusual gains. Focus on truly non-recurring items.",
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: "Unusual expenses/losses that won't recur in normal operations",
      negativeScenario: "Unusual gains/windfalls that inflated EBITDA but won't repeat",
    },
  },

  {
    id: NormalizationCategory.TAX_OPTIMIZATION,
    label: 'Tax Optimization Reversal',
    description: 'Reverse aggressive tax optimization strategies',
    detailedDescription:
      'SMEs often optimize for minimum taxes, not accurate EBITDA. Reverse strategies like excessive provisioning, accelerated expense recognition, income deferral, or aggressive bad debt reserves. The goal is to show economic earnings, not tax-minimized earnings.',
    examples: [
      'Excessive bad debt reserves (€10k) → +€10k (reverse overstatement)',
      'Aggressive inventory write-downs (€12k) → +€12k (add back excess)',
      'Front-loaded expenses for tax timing (€15k) → +€15k (normalize)',
      'Excessive warranty reserves (€8k) → +€8k (reduce to normal)',
      'Deferred revenue recognition (€20k) → -€20k (if understated)',
    ],
    marketRateLogic:
      'Compare provisions and reserves to industry norms and historical company patterns. Typical reserves: 1-2% of revenue.',
    validationRules: {
      min: -100000,
      max: 100000,
      warningThreshold: 25000,
      warningMessage:
        'Tax optimization reversals >€25k require comparison to industry norms and historical company averages.',
    },
    helpText:
      'ADD back excessive provisions/reserves. SUBTRACT if income was deferred. Show economic reality.',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: 'Excessive provisions/reserves that minimized taxes but overstate expenses',
      negativeScenario: 'Deferred income recognition or understated expenses for tax optimization',
    },
  },

  {
    id: NormalizationCategory.DISCRETIONARY_EXPENSES,
    label: 'Discretionary Expenses',
    description: 'Adjust discretionary spending above/below normal levels',
    detailedDescription:
      'Discretionary expenses that vary with owner preference (charitable donations, excessive entertainment, luxury perks, club memberships, excessive vehicle costs) should be normalized to industry averages. While legitimate business expenses, they may be higher than necessary based on owner preferences.',
    examples: [
      'Excessive entertainment (€12k above norms) → +€12k (add back excess)',
      'Luxury car lease personal portion (€18k) → +€18k (add back)',
      'Excessive charitable donations (€10k) → +€10k (owner preference)',
      'Country club memberships (€8k limited use) → +€8k (add back)',
      'Premium office space (€15k excess) → +€15k (add back excess)',
    ],
    marketRateLogic:
      'Compare to industry average discretionary spending as % of revenue. Typical range: 0.5-2% of revenue depending on industry.',
    validationRules: {
      min: 0,
      max: 100000,
      warningThreshold: 20000,
      warningMessage:
        'Discretionary expense adjustments >€20k require industry comparison data and clear business vs. personal allocation.',
    },
    helpText:
      "ADD back excessive discretionary spending above industry norms. New owner won't incur these.",
    adjustmentDirection: 'add',
    visualGuidance: {
      positiveScenario: "Excessive discretionary spending that new owner won't incur",
      negativeScenario: 'Not applicable - discretionary expenses are typically add-backs',
    },
  },

  {
    id: NormalizationCategory.OTHER_ADJUSTMENTS,
    label: 'Other Adjustments',
    description: 'Other normalization adjustments not covered above',
    detailedDescription:
      "Catch-all category for adjustments that don't fit other categories. This might include industry-specific adjustments, accounting policy changes, currency adjustments, or other unique items. Require detailed documentation as these will receive extra scrutiny from buyers.",
    examples: [
      'Industry-specific seasonal adjustment → +/-€X',
      'Accounting policy change impact → +/-€X',
      'Currency translation adjustment → +/-€X',
      'Business in transition normalization → +/-€X',
      'Other justified economic adjustments → Explain clearly',
    ],
    marketRateLogic:
      'No standard logic - case-by-case evaluation required. Must be justified with clear rationale.',
    validationRules: {
      min: -500000,
      max: 500000,
      warningThreshold: 30000,
      warningMessage:
        'Other adjustments >€30k require extremely detailed explanation and strong justification. Buyers will scrutinize these heavily.',
    },
    helpText:
      'Use sparingly. Can be ADD or SUBTRACT. Must be extensively documented with clear rationale.',
    adjustmentDirection: 'both',
    visualGuidance: {
      positiveScenario: "Unique expenses that won't recur under new ownership",
      negativeScenario: "Unique revenue/savings that won't continue, or future costs not reflected",
    },
  },
]

/**
 * Get category definition by ID
 */
export function getCategoryDefinition(
  categoryId: NormalizationCategory
): NormalizationCategoryDefinition | undefined {
  return NORMALIZATION_CATEGORIES.find((cat) => cat.id === categoryId)
}

/**
 * Get human-readable label for category
 */
export function getCategoryLabel(categoryId: NormalizationCategory): string {
  const definition = getCategoryDefinition(categoryId)
  return definition?.label || categoryId
}

/**
 * Validate adjustment amount against category rules
 */
export function validateAdjustment(
  categoryId: NormalizationCategory,
  amount: number
): { valid: boolean; warning?: string; error?: string } {
  const definition = getCategoryDefinition(categoryId)
  if (!definition) {
    return { valid: false, error: 'Unknown category' }
  }

  const { validationRules } = definition

  // Check min/max bounds
  if (amount < validationRules.min || amount > validationRules.max) {
    return {
      valid: false,
      error: `Amount must be between €${validationRules.min.toLocaleString()} and €${validationRules.max.toLocaleString()}`,
    }
  }

  // Check warning threshold
  if (validationRules.warningThreshold && Math.abs(amount) > validationRules.warningThreshold) {
    return {
      valid: true,
      warning: validationRules.warningMessage,
    }
  }

  return { valid: true }
}
