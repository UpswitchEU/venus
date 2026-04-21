/**
 * Data Transformation Service
 *
 * Automatically transforms registry financial data into valuation request format
 * This eliminates manual data re-entry and ensures data consistency
 */

import type { CompanyFinancialData, FinancialFilingYear } from '../types/registry'
import { getCurrentFilingYear } from '../utils/fiscalYear'
import { serviceLogger } from '../utils/logger'

/**
 * Valuation Request Format (matches backend API)
 */
export interface YearDataInput {
  year: number
  revenue: number
  ebitda: number
  cogs?: number
  gross_profit?: number
  operating_expenses?: number
  ebit?: number
  depreciation?: number
  amortization?: number
  interest_expense?: number
  tax_expense?: number
  net_income?: number
  total_assets?: number
  current_assets?: number
  cash?: number
  accounts_receivable?: number
  inventory?: number
  total_liabilities?: number
  current_liabilities?: number
  total_debt?: number
  total_equity?: number
  nwc_change?: number
}

export interface ValuationRequest {
  // Company information
  company_name: string
  country_code: string
  industry: string
  business_model: string
  founding_year: number

  // Financial data
  current_year_data: YearDataInput
  historical_years_data: YearDataInput[]

  // Optional details
  number_of_employees?: number
  recurring_revenue_percentage?: number

  // Valuation preferences
  use_dcf?: boolean
  use_multiples?: boolean
  projection_years?: number
}

/**
 * Industry classification mapping
 * Maps common business descriptions to industry codes
 */
const INDUSTRY_MAPPING: Record<string, string> = {
  // Technology
  software: 'TECHNOLOGY_SOFTWARE',
  technology: 'TECHNOLOGY_SOFTWARE',
  'it services': 'TECHNOLOGY_SERVICES',
  saas: 'TECHNOLOGY_SAAS',

  // Retail
  retail: 'RETAIL_GENERAL',
  'e-commerce': 'RETAIL_ECOMMERCE',
  wholesale: 'WHOLESALE',

  // Manufacturing
  manufacturing: 'MANUFACTURING_GENERAL',
  automotive: 'MANUFACTURING_AUTOMOTIVE',
  food: 'MANUFACTURING_FOOD',

  // Services
  consulting: 'SERVICES_CONSULTING',
  'professional services': 'SERVICES_PROFESSIONAL',
  healthcare: 'SERVICES_HEALTHCARE',
  education: 'SERVICES_EDUCATION',

  // Real Estate
  'real estate': 'REAL_ESTATE',
  construction: 'CONSTRUCTION',

  // Finance
  'financial services': 'FINANCIAL_SERVICES',
  insurance: 'INSURANCE',

  // Hospitality
  hospitality: 'HOSPITALITY',
  restaurant: 'HOSPITALITY_FOOD',
  hotel: 'HOSPITALITY_LODGING',

  // Default
  other: 'OTHER',
}

/**
 * Business model classification
 * Infers business model from financial characteristics
 */
const inferBusinessModel = (data: CompanyFinancialData): string => {
  const latest = data.filing_history[0]

  if (!latest) return 'B2B'

  // High margin + recurring revenue indicators = SaaS
  const ebitdaMargin = latest.ebitda && latest.revenue ? latest.ebitda / latest.revenue : 0

  if (ebitdaMargin > 0.3) {
    return 'SAAS'
  }

  // Low margin + high volume = B2C
  if (ebitdaMargin < 0.1 && latest.revenue && latest.revenue > 1000000) {
    return 'B2C'
  }

  // Default to B2B
  return 'B2B'
}

/**
 * Classify industry from description
 */
const classifyIndustry = (industryDescription?: string): string => {
  if (!industryDescription) return 'OTHER'

  const desc = industryDescription.toLowerCase()

  for (const [keyword, code] of Object.entries(INDUSTRY_MAPPING)) {
    if (desc.includes(keyword)) {
      return code
    }
  }

  return 'OTHER'
}

/**
 * Transform a single financial filing year to YearDataInput format
 */
const transformFinancialYear = (year: FinancialFilingYear): YearDataInput => {
  // Ensure year is within valid range (2000-2100 per backend validation)
  const validYear = Math.min(Math.max(year.year, 2000), 2100)

  // Revenue must be > 0 per backend validation, use 1 as minimum if missing
  const validRevenue = Math.max(year.revenue || 1, 1)

  return {
    year: validYear,
    revenue: validRevenue,
    ebitda: year.ebitda !== undefined && year.ebitda !== null ? year.ebitda : 0, // Preserve negative values
    cogs: year.cost_of_goods_sold,
    operating_expenses: year.operating_expenses,
    net_income: year.net_income,
    total_assets: year.total_assets,
    cash: year.cash,
    total_debt: year.total_debt,
  }
}

/**
 * Calculate data quality score
 * Higher score = more complete data = better valuation accuracy
 */
const calculateDataQuality = (data: CompanyFinancialData): number => {
  let score = 0
  let checks = 0

  if (data.filing_history.length > 0) {
    const latest = data.filing_history[0]

    // Required fields (60% weight)
    checks += 6
    if (latest.revenue != null && Number.isFinite(Number(latest.revenue))) score += 1
    if (latest.ebitda != null && Number.isFinite(Number(latest.ebitda))) score += 1
    if (latest.net_income != null && Number.isFinite(Number(latest.net_income))) score += 1
    if (latest.total_assets != null && Number.isFinite(Number(latest.total_assets))) score += 1
    if (latest.total_debt != null && Number.isFinite(Number(latest.total_debt))) score += 1
    if (latest.cash != null && Number.isFinite(Number(latest.cash))) score += 1
  }

  // Historical data (20% weight)
  if (data.filing_history.length >= 3) {
    score += 1.2
    checks += 1.2
  } else if (data.filing_history.length >= 2) {
    score += 0.6
    checks += 1.2
  } else {
    checks += 1.2
  }

  // Metadata (20% weight)
  checks += 1.2
  if (data.industry_description) score += 0.4
  if (data.employees) score += 0.4
  if (data.founding_year) score += 0.4

  return checks > 0 ? score / checks : 0
}

/**
 * Main transformation function
 * Converts CompanyFinancialData from registry to ValuationRequest format
 */
export const transformRegistryDataToValuationRequest = (
  registryData: CompanyFinancialData,
  options?: {
    industry?: string
    businessModel?: string
    useDcf?: boolean
    useMultiples?: boolean
    projectionYears?: number
  }
): ValuationRequest => {
  // Validate input
  if (!registryData.filing_history || registryData.filing_history.length === 0) {
    throw new Error('No financial history available for valuation')
  }

  // Sort filing history by year (most recent first)
  const sortedHistory = [...registryData.filing_history].sort((a, b) => b.year - a.year)
  const filingYear = getCurrentFilingYear()
  const safeHistory = sortedHistory.filter((year) => year.year <= filingYear)

  // Guard clause for empty filing history
  if (safeHistory.length === 0) {
    throw new Error('No filing-safe financial data available for transformation. Please use manual entry.')
  }

  // Extract current year and historical years
  const currentYear = safeHistory[0]
  const historicalYears = safeHistory.slice(1)

  // Validate current year has minimum required data
  if (!currentYear.revenue || currentYear.revenue <= 0) {
    throw new Error('Current year revenue is required for valuation')
  }

  // Infer or use provided industry
  const industry = options?.industry || classifyIndustry(registryData.industry_description)

  // Infer or use provided business model
  const businessModel = options?.businessModel || inferBusinessModel(registryData)

  // Estimate founding year if not available, ensure within valid range (1900-2100)
  const estimatedFoundingYear = currentYear.year - Math.min(historicalYears.length + 5, 20)
  const foundingYear = Math.min(
    Math.max(registryData.founding_year || estimatedFoundingYear, 1900),
    2100
  )

  // Calculate data quality
  const dataQuality = calculateDataQuality(registryData)

  serviceLogger.info('Data transformation completed', {
    company: registryData.company_name,
    industry,
    businessModel,
    dataQuality: `${(dataQuality * 100).toFixed(0)}%`,
    yearsOfData: safeHistory.length,
  })

  // Build valuation request
  const valuationRequest: ValuationRequest = {
    // Company information
    company_name: registryData.company_name,
    country_code: registryData.country_code,
    industry,
    business_model: businessModel,
    founding_year: foundingYear,

    // Financial data
    current_year_data: transformFinancialYear(currentYear),
    historical_years_data: historicalYears.map(transformFinancialYear),

    // Optional details
    number_of_employees: registryData.employees,
    recurring_revenue_percentage: businessModel === 'SAAS' ? 0.8 : 0.0,

    // Valuation preferences
    use_dcf: options?.useDcf ?? true,
    use_multiples: options?.useMultiples ?? true,
    projection_years: options?.projectionYears ?? 5,
  }

  return valuationRequest
}

/**
 * Validate that registry data is sufficient for valuation
 */
export const validateDataForValuation = (
  data: CompanyFinancialData
): { valid: boolean; errors: string[]; warnings: string[] } => {
  const errors: string[] = []
  const warnings: string[] = []

  // Check filing history exists
  if (!data.filing_history || data.filing_history.length === 0) {
    errors.push('No financial history available')
    return { valid: false, errors, warnings }
  }

  const latest = data.filing_history[0]

  // Required fields
  if (!latest.revenue || latest.revenue <= 0) {
    errors.push('Revenue is required and must be greater than 0')
  }

  // Warnings for missing optional but important fields
  if (latest.ebitda === undefined || latest.ebitda === null) {
    warnings.push('EBITDA not available - valuation accuracy may be reduced')
  }

  if (!latest.total_assets) {
    warnings.push('Total assets not available - some valuation methods may not be applicable')
  }

  if (data.filing_history.length < 2) {
    warnings.push('Less than 2 years of historical data - trend analysis will be limited')
  }

  if (!data.industry_description) {
    warnings.push('Industry classification not available - using default benchmarks')
  }

  // Calculate overall quality
  const quality = calculateDataQuality(data)
  if (quality < 0.5) {
    warnings.push(
      `Data quality is ${(quality * 100).toFixed(0)}% - consider adding more financial details for better accuracy`
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}

/**
 * Get a human-readable summary of the transformation
 */
export const getTransformationSummary = (
  registryData: CompanyFinancialData,
  valuationRequest: ValuationRequest
): string => {
  const quality = calculateDataQuality(registryData)
  const validation = validateDataForValuation(registryData)

  return `**Data Transformation Summary**

**Company:** ${registryData.company_name}
**Registry:** ${registryData.data_source}
**Data Quality:** ${(quality * 100).toFixed(0)}% ${quality > 0.7 ? '✅' : quality > 0.5 ? '⚠️' : '❌'}

**Financial Data:**
• Current Year: ${valuationRequest.current_year_data.year}
• Revenue: €${valuationRequest.current_year_data.revenue.toLocaleString()}
• EBITDA: €${valuationRequest.current_year_data.ebitda.toLocaleString()}
• Historical Years: ${valuationRequest.historical_years_data.length}

**Classification:**
• Industry: ${valuationRequest.industry}
• Business Model: ${valuationRequest.business_model}
• Employees: ${valuationRequest.number_of_employees || 'N/A'}

${validation.warnings.length > 0 ? `**Warnings:**\n${validation.warnings.map((w) => `⚠️ ${w}`).join('\n')}` : ''}

**Ready for Valuation:** ${validation.valid ? '✅ Yes' : '❌ No'}`
}
