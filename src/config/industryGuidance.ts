/**
 * Industry-Specific Guidance
 *
 * Provides contextual tips and validation for different industries
 * to improve data quality and demonstrate domain expertise.
 */

export interface FieldGuidance {
  tip: string
  why: string
  warning?: string
}

export interface IndustryBenchmarks {
  ebitdaMargin: { min: number; max: number }
  note: string
}

export interface RevenueRanges {
  micro: { min: number; max: number } // <€500K
  small: { min: number; max: number } // €500K-€2M
  medium: { min: number; max: number } // €2M-€10M
  large: { min: number; max: number } // €10M-€50M
}

export interface RevenuePerEmployee {
  min: number // Minimum revenue per employee
  max: number // Maximum revenue per employee
  typical: number // Typical revenue per employee
}

export interface SubIndustryConfig {
  name: string
  revenueRanges: RevenueRanges
  revenuePerEmployee: RevenuePerEmployee
  ebitdaMargin: { min: number; max: number }
  guidance: FieldGuidance
}

export interface IndustryGuidanceConfig {
  revenue: FieldGuidance
  ebitda: FieldGuidance
  benchmarks: IndustryBenchmarks
  subIndustries: SubIndustryConfig[]
}

export const INDUSTRY_GUIDANCE: Record<string, IndustryGuidanceConfig> = {
  technology: {
    revenue: {
      tip: 'Isolate Recurring Revenue (ARR/MRR) from one-time implementation fees',
      why: 'Recurring revenue commands a significantly higher multiple (often 4-8x) vs. one-time revenue (1-1.5x) due to predictability',
      warning: "Don't include one-time setup fees or professional services",
    },
    ebitda: {
      tip: 'Exclude Customer Acquisition Costs (CAC) if capitalization is standard policy',
      why: "High-growth tech often reinvests EBITDA into CAC; 'Normalized EBITDA' reflects true profitability",
    },
    benchmarks: {
      ebitdaMargin: { min: 0.15, max: 0.3 },
      note: 'High-growth SaaS often has negative EBITDA in early stages - this is normal',
    },
    subIndustries: [
      {
        name: 'B2B SaaS',
        revenueRanges: {
          micro: { min: 50000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 10000000 },
          large: { min: 10000000, max: 100000000 },
        },
        revenuePerEmployee: { min: 150000, max: 500000, typical: 300000 },
        ebitdaMargin: { min: 0.15, max: 0.3 },
        guidance: {
          tip: 'Focus on Annual Recurring Revenue (ARR) and Net Dollar Retention (NDR)',
          why: 'Valuation is primarily driven by recurring revenue growth and retention metrics',
        },
      },
      {
        name: 'Software Development',
        revenueRanges: {
          micro: { min: 100000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 10000000 },
          large: { min: 10000000, max: 10000000 },
        },
        revenuePerEmployee: { min: 80000, max: 200000, typical: 120000 },
        ebitdaMargin: { min: 0.2, max: 0.35 },
        guidance: {
          tip: 'Distinguish between Project Revenue (one-off) and Managed Services (recurring)',
          why: 'Recurring managed services revenue reduces volatility discount',
        },
      },
      {
        name: 'IT Services/Consulting',
        revenueRanges: {
          micro: { min: 100000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 100000, max: 150000, typical: 120000 },
        ebitdaMargin: { min: 0.25, max: 0.4 },
        guidance: {
          tip: 'Include all billable hours, retainer fees, and project revenue',
          why: 'IT services revenue should reflect actual client billing and contracts',
        },
      },
      {
        name: 'Cybersecurity',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 5000000 },
          medium: { min: 5000000, max: 20000000 },
          large: { min: 20000000, max: 20000000 },
        },
        revenuePerEmployee: { min: 150000, max: 400000, typical: 250000 },
        ebitdaMargin: { min: 0.2, max: 0.3 },
        guidance: {
          tip: 'Include all security service revenue and recurring contracts',
          why: 'Cybersecurity has high-value recurring revenue streams',
        },
      },
      {
        name: 'AI/ML Services',
        revenueRanges: {
          micro: { min: 100000, max: 1000000 },
          small: { min: 1000000, max: 5000000 },
          medium: { min: 5000000, max: 20000000 },
          large: { min: 20000000, max: 50000000 },
        },
        revenuePerEmployee: { min: 120000, max: 350000, typical: 200000 },
        ebitdaMargin: { min: 0.15, max: 0.25 },
        guidance: {
          tip: 'Include all AI/ML project revenue and data service contracts',
          why: 'AI/ML services often have high-value but variable revenue streams',
        },
      },
    ],
  },

  manufacturing: {
    revenue: {
      tip: 'Report Net Revenue (gross sales minus returns/allowances)',
      why: "Valuation focuses on 'Quality of Revenue'; returns indicate product/market risk",
    },
    ebitda: {
      tip: 'Ensure equipment depreciation is consistent with useful life estimates',
      why: 'For capital-intensive businesses, EBITDA must reflect sustainable capex requirements',
    },
    benchmarks: {
      ebitdaMargin: { min: 0.1, max: 0.2 },
      note: 'Manufacturing margins typically range 10-20% depending on automation level',
    },
    subIndustries: [
      {
        name: 'Food Production',
        revenueRanges: {
          micro: { min: 500000, max: 2000000 },
          small: { min: 2000000, max: 5000000 },
          medium: { min: 5000000, max: 20000000 },
          large: { min: 20000000, max: 20000000 },
        },
        revenuePerEmployee: { min: 80000, max: 150000, typical: 120000 },
        ebitdaMargin: { min: 0.08, max: 0.15 },
        guidance: {
          tip: 'Separate Branded Product sales from White Label/Contract Manufacturing',
          why: 'Branded products command a premium due to intellectual property value',
        },
      },
      {
        name: 'Automotive Parts',
        revenueRanges: {
          micro: { min: 1000000, max: 5000000 },
          small: { min: 5000000, max: 15000000 },
          medium: { min: 15000000, max: 50000000 },
          large: { min: 50000000, max: 50000000 },
        },
        revenuePerEmployee: { min: 100000, max: 200000, typical: 150000 },
        ebitdaMargin: { min: 0.1, max: 0.18 },
        guidance: {
          tip: 'Include all automotive component sales and OEM contracts',
          why: 'Automotive parts revenue should reflect actual component delivery',
        },
      },
      {
        name: 'Electronics Assembly',
        revenueRanges: {
          micro: { min: 500000, max: 2000000 },
          small: { min: 2000000, max: 10000000 },
          medium: { min: 10000000, max: 30000000 },
          large: { min: 30000000, max: 30000000 },
        },
        revenuePerEmployee: { min: 90000, max: 180000, typical: 130000 },
        ebitdaMargin: { min: 0.12, max: 0.2 },
        guidance: {
          tip: 'Include all electronic assembly revenue and component sales',
          why: 'Electronics assembly revenue should reflect actual product delivery',
        },
      },
      {
        name: 'Textiles/Apparel',
        revenueRanges: {
          micro: { min: 300000, max: 1000000 },
          small: { min: 1000000, max: 5000000 },
          medium: { min: 5000000, max: 10000000 },
          large: { min: 10000000, max: 10000000 },
        },
        revenuePerEmployee: { min: 60000, max: 120000, typical: 90000 },
        ebitdaMargin: { min: 0.08, max: 0.14 },
        guidance: {
          tip: 'Include all textile and apparel sales, exclude raw material costs',
          why: 'Textile manufacturing focuses on finished goods revenue',
        },
      },
      {
        name: 'Chemical/Materials',
        revenueRanges: {
          micro: { min: 1000000, max: 5000000 },
          small: { min: 5000000, max: 15000000 },
          medium: { min: 15000000, max: 50000000 },
          large: { min: 50000000, max: 50000000 },
        },
        revenuePerEmployee: { min: 120000, max: 250000, typical: 180000 },
        ebitdaMargin: { min: 0.12, max: 0.22 },
        guidance: {
          tip: 'Include all chemical product sales and material processing revenue',
          why: 'Chemical manufacturing has high-value but capital-intensive operations',
        },
      },
    ],
  },

  services: {
    revenue: {
      tip: 'Distinguish between Contracted Revenue (retainers) and Project Revenue',
      why: 'Contracted revenue reduces future cash flow uncertainty, lowering the discount rate',
    },
    ebitda: {
      tip: 'Normalize Owner Compensation to market-rate replacement cost',
      why: "Reported EBITDA is often distorted by owner drawings; valuation requires 'maintainable earnings' figure",
    },
    benchmarks: {
      ebitdaMargin: { min: 0.25, max: 0.4 },
      note: 'Services/consulting should be high-margin (25-40%) due to low overhead',
    },
    subIndustries: [
      {
        name: 'Management Consulting',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 3000000 },
          medium: { min: 3000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 120000, max: 200000, typical: 160000 },
        ebitdaMargin: { min: 0.3, max: 0.45 },
        guidance: {
          tip: 'Highlight revenue from Repeat Clients vs. New Business',
          why: 'High client retention indicates franchise value beyond individual partners',
        },
      },
      {
        name: 'Accounting/Tax',
        revenueRanges: {
          micro: { min: 150000, max: 500000 },
          small: { min: 500000, max: 1500000 },
          medium: { min: 1500000, max: 3000000 },
          large: { min: 3000000, max: 3000000 },
        },
        revenuePerEmployee: { min: 80000, max: 150000, typical: 120000 },
        ebitdaMargin: { min: 0.25, max: 0.4 },
        guidance: {
          tip: 'Include all accounting fees, tax preparation, and advisory services',
          why: 'Accounting services revenue should reflect actual client service delivery',
        },
      },
      {
        name: 'Legal Services',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 3000000 },
          medium: { min: 3000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 100000, max: 180000, typical: 140000 },
        ebitdaMargin: { min: 0.3, max: 0.5 },
        guidance: {
          tip: 'Include all legal fees, retainer agreements, and case revenue',
          why: 'Legal services revenue should reflect actual legal work performed',
        },
      },
      {
        name: 'Marketing/Advertising',
        revenueRanges: {
          micro: { min: 150000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 80000, max: 150000, typical: 120000 },
        ebitdaMargin: { min: 0.2, max: 0.35 },
        guidance: {
          tip: 'Include all marketing fees, campaign revenue, and creative services',
          why: 'Marketing services revenue should reflect actual campaign and creative work',
        },
      },
      {
        name: 'HR/Recruitment',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 3000000 },
          medium: { min: 3000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 100000, max: 180000, typical: 140000 },
        ebitdaMargin: { min: 0.25, max: 0.4 },
        guidance: {
          tip: 'Include all recruitment fees, placement revenue, and HR consulting',
          why: 'HR/recruitment revenue should reflect actual placement and consulting services',
        },
      },
    ],
  },

  retail: {
    revenue: {
      tip: 'Separate Online (DTC) revenue from Wholesale/Distributor channels',
      why: 'DTC channels typically capture higher margins and customer data value',
    },
    ebitda: {
      tip: 'Adjust for market-rate rent if owning premises (OpCo/PropCo separation)',
      why: 'Valuation must isolate operating business performance from real estate holding',
    },
    benchmarks: {
      ebitdaMargin: { min: 0.05, max: 0.15 },
      note: 'Retail margins are typically 5-15% due to high COGS and overhead',
    },
    subIndustries: [
      {
        name: 'E-commerce',
        revenueRanges: {
          micro: { min: 100000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 10000000 },
          large: { min: 10000000, max: 50000000 },
        },
        revenuePerEmployee: { min: 150000, max: 400000, typical: 250000 },
        ebitdaMargin: { min: 0.05, max: 0.15 },
        guidance: {
          tip: 'Include all online sales revenue, exclude platform fees and payment processing',
          why: 'E-commerce revenue should reflect actual product sales, not platform costs',
        },
      },
      {
        name: 'Fashion/Apparel',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 5000000 },
          medium: { min: 5000000, max: 10000000 },
          large: { min: 10000000, max: 10000000 },
        },
        revenuePerEmployee: { min: 80000, max: 200000, typical: 140000 },
        ebitdaMargin: { min: 0.05, max: 0.12 },
        guidance: {
          tip: 'Include all fashion sales revenue, both retail and wholesale',
          why: 'Fashion retail revenue should reflect actual clothing and accessory sales',
        },
      },
      {
        name: 'Food & Beverage',
        revenueRanges: {
          micro: { min: 300000, max: 1000000 },
          small: { min: 1000000, max: 5000000 },
          medium: { min: 5000000, max: 10000000 },
          large: { min: 10000000, max: 10000000 },
        },
        revenuePerEmployee: { min: 60000, max: 150000, typical: 100000 },
        ebitdaMargin: { min: 0.03, max: 0.1 },
        guidance: {
          tip: 'Include all food and beverage sales revenue, exclude raw material costs',
          why: 'Food retail revenue should reflect actual food sales, not ingredient costs',
        },
      },
      {
        name: 'Electronics',
        revenueRanges: {
          micro: { min: 500000, max: 2000000 },
          small: { min: 2000000, max: 10000000 },
          medium: { min: 10000000, max: 20000000 },
          large: { min: 20000000, max: 20000000 },
        },
        revenuePerEmployee: { min: 200000, max: 500000, typical: 300000 },
        ebitdaMargin: { min: 0.05, max: 0.15 },
        guidance: {
          tip: 'Include all electronics sales revenue, exclude warranty and service costs',
          why: 'Electronics retail revenue should reflect actual product sales',
        },
      },
      {
        name: 'Home & Garden',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 3000000 },
          medium: { min: 3000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 80000, max: 180000, typical: 130000 },
        ebitdaMargin: { min: 0.08, max: 0.15 },
        guidance: {
          tip: 'Include all home and garden sales revenue, exclude installation services',
          why: 'Home & garden retail revenue should reflect actual product sales',
        },
      },
    ],
  },

  healthcare: {
    revenue: {
      tip: 'Split revenue by Payer Mix (Private vs. Public/Insurance)',
      why: 'Diversified payer mix reduces regulatory concentration risk',
    },
    ebitda: {
      tip: "Normalize for clinical owner's production vs. management role",
      why: 'Valuation must assess profitability assuming a non-producing manager replacement',
    },
    benchmarks: {
      ebitdaMargin: { min: 0.15, max: 0.25 },
      note: 'Healthcare margins vary by specialty; private practices typically 15-25%',
    },
    subIndustries: [
      {
        name: 'Medical Practice',
        revenueRanges: {
          micro: { min: 300000, max: 1000000 },
          small: { min: 1000000, max: 2000000 },
          medium: { min: 2000000, max: 3000000 },
          large: { min: 3000000, max: 3000000 },
        },
        revenuePerEmployee: { min: 150000, max: 300000, typical: 200000 },
        ebitdaMargin: { min: 0.2, max: 0.3 },
        guidance: {
          tip: 'Include all patient fees, insurance reimbursements, and medical services',
          why: 'Medical practice revenue should reflect actual patient care delivery',
        },
      },
      {
        name: 'Dental Practice',
        revenueRanges: {
          micro: { min: 400000, max: 1000000 },
          small: { min: 1000000, max: 2000000 },
          medium: { min: 2000000, max: 2000000 },
          large: { min: 2000000, max: 2000000 },
        },
        revenuePerEmployee: { min: 180000, max: 350000, typical: 250000 },
        ebitdaMargin: { min: 0.25, max: 0.35 },
        guidance: {
          tip: 'Include all dental services, procedures, and treatment revenue',
          why: 'Dental practice revenue should reflect actual dental care delivery',
        },
      },
      {
        name: 'Physiotherapy',
        revenueRanges: {
          micro: { min: 150000, max: 500000 },
          small: { min: 500000, max: 1000000 },
          medium: { min: 1000000, max: 1000000 },
          large: { min: 1000000, max: 1000000 },
        },
        revenuePerEmployee: { min: 80000, max: 150000, typical: 120000 },
        ebitdaMargin: { min: 0.2, max: 0.3 },
        guidance: {
          tip: 'Include all physiotherapy sessions, treatments, and rehabilitation services',
          why: 'Physiotherapy revenue should reflect actual treatment delivery',
        },
      },
      {
        name: 'Mental Health',
        revenueRanges: {
          micro: { min: 150000, max: 500000 },
          small: { min: 500000, max: 1500000 },
          medium: { min: 1500000, max: 2000000 },
          large: { min: 2000000, max: 2000000 },
        },
        revenuePerEmployee: { min: 80000, max: 180000, typical: 130000 },
        ebitdaMargin: { min: 0.3, max: 0.45 },
        guidance: {
          tip: 'Include all therapy sessions, counseling, and mental health services',
          why: 'Mental health revenue should reflect actual therapeutic service delivery',
        },
      },
      {
        name: 'Home Care Services',
        revenueRanges: {
          micro: { min: 200000, max: 1000000 },
          small: { min: 1000000, max: 3000000 },
          medium: { min: 3000000, max: 5000000 },
          large: { min: 5000000, max: 5000000 },
        },
        revenuePerEmployee: { min: 50000, max: 100000, typical: 75000 },
        ebitdaMargin: { min: 0.1, max: 0.2 },
        guidance: {
          tip: 'Include all home care services, personal care, and support revenue',
          why: 'Home care revenue should reflect actual care service delivery',
        },
      },
    ],
  },

  // Default guidance for other industries
  other: {
    revenue: {
      tip: 'Exclude non-operating income (e.g., grants, one-off asset sales)',
      why: "Valuation is based on 'Core Operating Revenue' sustainability",
    },
    ebitda: {
      tip: 'Add back non-recurring expenses and normalize owner salaries',
      why: "Valuation requires 'Adjusted EBITDA' representing future maintainable cash flow",
    },
    benchmarks: {
      ebitdaMargin: { min: 0.1, max: 0.25 },
      note: 'EBITDA margins vary widely by industry; 10-25% is typical for SMEs',
    },
    subIndustries: [
      {
        name: 'General Business',
        revenueRanges: {
          micro: { min: 50000, max: 500000 },
          small: { min: 500000, max: 2000000 },
          medium: { min: 2000000, max: 10000000 },
          large: { min: 10000000, max: 50000000 },
        },
        revenuePerEmployee: { min: 80000, max: 200000, typical: 120000 },
        ebitdaMargin: { min: 0.1, max: 0.25 },
        guidance: {
          tip: 'Include all business revenue from your primary activities',
          why: 'General business revenue should reflect your core business operations',
        },
      },
    ],
  },
}

/**
 * Get industry-specific guidance for a field
 */
export const getIndustryGuidance = (
  industry: string,
  field: 'revenue' | 'ebitda'
): FieldGuidance => {
  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  return guidance[field]
}

/**
 * Get industry-specific benchmarks
 */
export const getIndustryBenchmarks = (industry: string): IndustryBenchmarks => {
  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  return guidance.benchmarks
}

/**
 * Validate EBITDA margin against industry benchmarks
 */
export const validateEbitdaMargin = (
  revenue: number,
  ebitda: number,
  industry: string
): {
  isValid: boolean
  message: string
  severity: 'success' | 'warning' | 'info'
} => {
  if (!revenue || revenue === 0 || !ebitda) {
    return { isValid: true, message: '', severity: 'info' }
  }

  const margin = ebitda / revenue
  const benchmarks = getIndustryBenchmarks(industry)

  if (margin < 0) {
    return {
      isValid: true,
      message: `Negative EBITDA margin (${(margin * 100).toFixed(1)}%). ${benchmarks.note}`,
      severity: 'info',
    }
  }

  if (margin < benchmarks.ebitdaMargin.min) {
    return {
      isValid: true,
      message: `EBITDA margin is ${(margin * 100).toFixed(1)}% (${industry} average: ${(benchmarks.ebitdaMargin.min * 100).toFixed(0)}-${(benchmarks.ebitdaMargin.max * 100).toFixed(0)}%)`,
      severity: 'warning',
    }
  }

  if (margin > benchmarks.ebitdaMargin.max) {
    return {
      isValid: true,
      message: `EBITDA margin is ${(margin * 100).toFixed(1)}% - excellent! Above ${industry} average (${(benchmarks.ebitdaMargin.min * 100).toFixed(0)}-${(benchmarks.ebitdaMargin.max * 100).toFixed(0)}%)`,
      severity: 'success',
    }
  }

  return {
    isValid: true,
    message: `EBITDA margin is ${(margin * 100).toFixed(1)}% - within ${industry} average (${(benchmarks.ebitdaMargin.min * 100).toFixed(0)}-${(benchmarks.ebitdaMargin.max * 100).toFixed(0)}%)`,
    severity: 'success',
  }
}

/**
 * Revenue validation result interface
 */
export interface RevenueValidationResult {
  isValid: boolean
  severity: 'success' | 'warning' | 'error' | 'info'
  message: string
  suggestion?: string
}

/**
 * Multi-parameter revenue validation
 */
export const validateRevenue = (
  revenue: number,
  industry: string,
  subIndustry?: string,
  employees?: number,
  foundingYear?: number,
  _country?: string
): RevenueValidationResult => {
  if (!revenue || !industry) {
    return { isValid: true, message: '', severity: 'info' }
  }

  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  const subIndustryConfig = subIndustry
    ? guidance.subIndustries.find((si) => si.name === subIndustry)
    : guidance.subIndustries[0] // Use first sub-industry as default

  if (!subIndustryConfig) {
    return { isValid: true, message: '', severity: 'info' }
  }

  // Determine company size tier
  let sizeTier: 'micro' | 'small' | 'medium' | 'large'
  if (revenue < 500000) sizeTier = 'micro'
  else if (revenue < 2000000) sizeTier = 'small'
  else if (revenue < 10000000) sizeTier = 'medium'
  else sizeTier = 'large'

  const range = subIndustryConfig.revenueRanges[sizeTier]
  const isWithinRange = revenue >= range.min && revenue <= range.max

  // Revenue per employee analysis
  let employeeAnalysis = ''
  if (employees && employees > 0) {
    const revenuePerEmployee = revenue / employees
    const { min, max } = subIndustryConfig.revenuePerEmployee

    if (revenuePerEmployee < min) {
      employeeAnalysis = ` (€${Math.round(revenuePerEmployee).toLocaleString()}/employee is below typical ${subIndustryConfig.name} range of €${min.toLocaleString()}-€${max.toLocaleString()})`
    } else if (revenuePerEmployee > max) {
      employeeAnalysis = ` (€${Math.round(revenuePerEmployee).toLocaleString()}/employee is above typical ${subIndustryConfig.name} range of €${min.toLocaleString()}-€${max.toLocaleString()})`
    } else {
      employeeAnalysis = ` (€${Math.round(revenuePerEmployee).toLocaleString()}/employee is within typical range)`
    }
  }

  // Business age consideration (startups get wider ranges)
  const currentYear = new Date().getFullYear()
  const businessAge = foundingYear ? currentYear - foundingYear : 0
  const isStartup = businessAge <= 3

  if (!isWithinRange) {
    const suggestion = isStartup
      ? `For a ${businessAge}-year-old ${subIndustryConfig.name} company, this revenue is ${revenue < range.min ? 'below' : 'above'} typical range. Startups often have wider revenue variations.`
      : `For ${subIndustryConfig.name}, typical ${sizeTier} companies have revenue of €${range.min.toLocaleString()}-€${range.max.toLocaleString()}.`

    return {
      isValid: true,
      severity: revenue < range.min ? 'warning' : 'warning',
      message: `Revenue of €${revenue.toLocaleString()} is ${revenue < range.min ? 'below' : 'above'} typical ${subIndustryConfig.name} range (€${range.min.toLocaleString()}-€${range.max.toLocaleString()})${employeeAnalysis}`,
      suggestion,
    }
  }

  return {
    isValid: true,
    severity: 'success',
    message: `Revenue of €${revenue.toLocaleString()} is within typical ${subIndustryConfig.name} range${employeeAnalysis}`,
    suggestion: isStartup
      ? 'Startup revenue can vary significantly - this is normal for early-stage companies.'
      : undefined,
  }
}

/**
 * Get revenue per employee analysis
 */
export const getRevenuePerEmployeeAnalysis = (
  revenuePerEmployee: number,
  industry: string,
  subIndustry?: string
): string => {
  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  const subIndustryConfig = subIndustry
    ? guidance.subIndustries.find((si) => si.name === subIndustry)
    : guidance.subIndustries[0]

  if (!subIndustryConfig) return ''

  const { min, max } = subIndustryConfig.revenuePerEmployee

  if (revenuePerEmployee < min) {
    return ` - Below typical ${subIndustryConfig.name} range (€${min.toLocaleString()}-€${max.toLocaleString()})`
  } else if (revenuePerEmployee > max) {
    return ` - Above typical ${subIndustryConfig.name} range (€${min.toLocaleString()}-€${max.toLocaleString()})`
  } else {
    return ` - Within typical ${subIndustryConfig.name} range`
  }
}

/**
 * Get sub-industry options for a main industry
 */
export const getSubIndustryOptions = (
  industry: string
): Array<{ value: string; label: string }> => {
  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  return guidance.subIndustries.map((si) => ({
    value: si.name,
    label: si.name,
  }))
}

/**
 * Get revenue range guidance for a sub-industry
 */
export const getRevenueRangeGuidance = (
  industry: string,
  subIndustry?: string,
  employees?: number
): { min: number; max: number; message: string } => {
  const guidance = INDUSTRY_GUIDANCE[industry] || INDUSTRY_GUIDANCE.other
  const subIndustryConfig = subIndustry
    ? guidance.subIndustries.find((si) => si.name === subIndustry)
    : guidance.subIndustries[0]

  if (!subIndustryConfig) {
    return { min: 0, max: 0, message: '' }
  }

  // Determine size tier based on employees if provided
  let sizeTier: 'micro' | 'small' | 'medium' | 'large' = 'small'
  if (employees) {
    if (employees <= 5) sizeTier = 'micro'
    else if (employees <= 20) sizeTier = 'small'
    else if (employees <= 50) sizeTier = 'medium'
    else sizeTier = 'large'
  }

  const range = subIndustryConfig.revenueRanges[sizeTier]
  const message = employees
    ? `Typical revenue for ${employees}-person ${subIndustryConfig.name} companies: €${range.min.toLocaleString()}-€${range.max.toLocaleString()}`
    : `Typical ${subIndustryConfig.name} revenue range: €${range.min.toLocaleString()}-€${range.max.toLocaleString()}`

  return { min: range.min, max: range.max, message }
}
