/**
 * Version Diff Detection Utility
 *
 * Single Responsibility: Detect and quantify changes between valuation versions
 * Critical for M&A workflow - shows what changed, by how much, and impact
 *
 * @module utils/versionDiffDetection
 */

import { formatCurrency } from '../config/countries'
import type { FieldChange, VersionChanges } from '../types/ValuationVersion'
import type { ValuationRequest } from '../types/valuation'

/**
 * Detect all changes between two valuation data sets
 *
 * Compares old data vs new data and returns detailed change summary.
 * Used for:
 * - Audit trail
 * - Version comparison
 * - Change highlighting in UI
 * - Regeneration confirmation
 *
 * @param oldData - Previous version data
 * @param newData - New version data
 * @returns Comprehensive change summary
 *
 * @example
 * ```typescript
 * const changes = detectVersionChanges(v2.formData, v3.formData)
 * if (changes.revenue) {
 *   console.log(`Revenue changed: ${changes.revenue.from} → ${changes.revenue.to}`)
 *   console.log(`Impact: ${changes.revenue.percentChange}%`)
 * }
 * ```
 */
export function detectVersionChanges(
  oldData: Partial<ValuationRequest>,
  newData: Partial<ValuationRequest>
): VersionChanges {
  const changes: VersionChanges = {
    totalChanges: 0,
    significantChanges: [],
  }

  const timestamp = new Date()

  // Helper to create field change
  function createChange<T>(
    field: keyof VersionChanges,
    oldVal: T,
    newVal: T,
    isSignificant: boolean = false
  ): FieldChange<T> {
    changes.totalChanges++
    if (isSignificant) {
      changes.significantChanges.push(field as string)
    }

    const change: FieldChange<T> = {
      from: oldVal,
      to: newVal,
      timestamp,
    }

    // Calculate percent change for numbers
    if (typeof oldVal === 'number' && typeof newVal === 'number' && oldVal !== 0) {
      change.percentChange = ((newVal - oldVal) / Math.abs(oldVal)) * 100
    }

    return change
  }

  // Financial changes (most critical for M&A)
  const oldRevenue = oldData.current_year_data?.revenue || 0
  const newRevenue = newData.current_year_data?.revenue || 0
  if (oldRevenue !== newRevenue) {
    const percentChange =
      oldRevenue > 0 ? Math.abs(((newRevenue - oldRevenue) / oldRevenue) * 100) : 0
    changes.revenue = createChange('revenue', oldRevenue, newRevenue, percentChange > 10)
  }

  const oldEbitda = oldData.current_year_data?.ebitda || 0
  const newEbitda = newData.current_year_data?.ebitda || 0
  if (oldEbitda !== newEbitda) {
    const percentChange =
      oldEbitda !== 0 ? Math.abs(((newEbitda - oldEbitda) / oldEbitda) * 100) : 0
    changes.ebitda = createChange('ebitda', oldEbitda, newEbitda, percentChange > 10)
  }

  const oldAssets = oldData.current_year_data?.total_assets || 0
  const newAssets = newData.current_year_data?.total_assets || 0
  if (oldAssets !== newAssets) {
    const percentChange = oldAssets > 0 ? Math.abs(((newAssets - oldAssets) / oldAssets) * 100) : 0
    changes.totalAssets = createChange('totalAssets', oldAssets, newAssets, percentChange > 10)
  }

  const oldDebt = oldData.current_year_data?.total_debt || 0
  const newDebt = newData.current_year_data?.total_debt || 0
  if (oldDebt !== newDebt) {
    const percentChange = oldDebt > 0 ? Math.abs(((newDebt - oldDebt) / oldDebt) * 100) : 0
    changes.totalDebt = createChange('totalDebt', oldDebt, newDebt, percentChange > 10)
  }

  const oldCash = oldData.current_year_data?.cash || 0
  const newCash = newData.current_year_data?.cash || 0
  if (oldCash !== newCash) {
    const percentChange = oldCash > 0 ? Math.abs(((newCash - oldCash) / oldCash) * 100) : 0
    changes.cash = createChange('cash', oldCash, newCash, percentChange > 10)
  }

  // Business profile changes
  if (oldData.company_name !== newData.company_name) {
    changes.companyName = createChange(
      'companyName',
      oldData.company_name || '',
      newData.company_name || ''
    )
  }

  if (oldData.founding_year !== newData.founding_year) {
    changes.foundingYear = createChange(
      'foundingYear',
      oldData.founding_year || 0,
      newData.founding_year || 0
    )
  }

  if (oldData.number_of_employees !== newData.number_of_employees) {
    changes.numberOfEmployees = createChange(
      'numberOfEmployees',
      oldData.number_of_employees || 0,
      newData.number_of_employees || 0
    )
  }

  if (oldData.number_of_owners !== newData.number_of_owners) {
    changes.numberOfOwners = createChange(
      'numberOfOwners',
      oldData.number_of_owners || 0,
      newData.number_of_owners || 0
    )
  }

  // Other changes
  if (oldData.business_type_id !== newData.business_type_id) {
    changes.businessTypeId = createChange(
      'businessTypeId',
      oldData.business_type_id || '',
      newData.business_type_id || ''
    )
  }

  if (oldData.country_code !== newData.country_code) {
    changes.countryCode = createChange(
      'countryCode',
      oldData.country_code || '',
      newData.country_code || ''
    )
  }

  // Additional financial fields
  const oldNetIncome = oldData.current_year_data?.net_income || 0
  const newNetIncome = newData.current_year_data?.net_income || 0
  if (oldNetIncome !== newNetIncome) {
    const percentChange =
      oldNetIncome !== 0 ? Math.abs(((newNetIncome - oldNetIncome) / oldNetIncome) * 100) : 0
    changes.netIncome = createChange('netIncome', oldNetIncome, newNetIncome, percentChange > 10)
  }

  // Business structure and ownership
  if (oldData.shares_for_sale !== newData.shares_for_sale) {
    changes.sharesForSale = createChange(
      'sharesForSale',
      oldData.shares_for_sale || 100,
      newData.shares_for_sale || 100
    )
  }

  // Historical years / yearly financials (revenue, ebitda per year)
  const oldYearly =
    (oldData as any).yearlyFinancials ?? oldData.historical_years_data ?? []
  const newYearly =
    (newData as any).yearlyFinancials ?? newData.historical_years_data ?? []
  if (JSON.stringify(oldYearly) !== JSON.stringify(newYearly)) {
    changes.totalChanges++
    changes.significantChanges.push('yearlyFinancials')
  }

  // Industry and business model
  if (oldData.industry !== newData.industry) {
    changes.industry = createChange('industry', oldData.industry || '', newData.industry || '')
  }

  if (oldData.business_model !== newData.business_model) {
    changes.businessModel = createChange(
      'businessModel',
      oldData.business_model || '',
      newData.business_model || ''
    )
  }

  // Business type (string, not just ID)
  if (oldData.business_type !== newData.business_type) {
    changes.businessType = createChange(
      'businessType',
      oldData.business_type || '',
      newData.business_type || ''
    )
  }

  // Recurring revenue percentage
  if (oldData.recurring_revenue_percentage !== newData.recurring_revenue_percentage) {
    const oldPct = oldData.recurring_revenue_percentage || 0
    const newPct = newData.recurring_revenue_percentage || 0
    const percentChange = oldPct !== 0 ? Math.abs(((newPct - oldPct) / oldPct) * 100) : 0
    changes.recurringRevenuePercentage = createChange(
      'recurringRevenuePercentage',
      oldPct,
      newPct,
      percentChange > 10
    )
  }

  return changes
}

/**
 * Format changes summary for display
 *
 * Creates human-readable change descriptions.
 *
 * @param changes - Version changes
 * @param countryCode - Country code for currency formatting
 * @returns Array of formatted change descriptions
 *
 * @example
 * ```typescript
 * const descriptions = formatChangesSummary(changes, 'BE')
 * // Returns: ["Revenue +€500,000 (+25%)", "EBITDA +€125,000 (+20%)"]
 * ```
 */
export function formatChangesSummary(
  changes: VersionChanges,
  countryCode: string = 'BE'
): string[] {
  const descriptions: string[] = []

  if (changes.revenue) {
    const { from, to, percentChange } = changes.revenue
    const delta = to - from
    const sign = delta > 0 ? '+' : ''
    const formattedDelta = formatCurrency(Math.abs(delta), countryCode)
    const pct = percentChange?.toFixed(1) || '0.0'
    descriptions.push(`Revenue ${sign}${formattedDelta} (${sign}${pct}%)`)
  }

  if (changes.ebitda) {
    const { from, to, percentChange } = changes.ebitda
    const delta = to - from
    const sign = delta > 0 ? '+' : ''
    const formattedDelta = formatCurrency(Math.abs(delta), countryCode)
    const pct = percentChange?.toFixed(1) || '0.0'
    descriptions.push(`EBITDA ${sign}${formattedDelta} (${sign}${pct}%)`)
  }

  if (changes.totalAssets) {
    const { from, to } = changes.totalAssets
    const delta = to - from
    const sign = delta > 0 ? '+' : ''
    const formattedDelta = formatCurrency(Math.abs(delta), countryCode)
    descriptions.push(`Assets ${sign}${formattedDelta}`)
  }

  if (changes.totalDebt) {
    const { from, to } = changes.totalDebt
    const delta = to - from
    const sign = delta > 0 ? '+' : ''
    const formattedDelta = formatCurrency(Math.abs(delta), countryCode)
    descriptions.push(`Debt ${sign}${formattedDelta}`)
  }

  if (changes.companyName) {
    descriptions.push(`Company name: "${changes.companyName.from}" → "${changes.companyName.to}"`)
  }

  if (changes.foundingYear) {
    descriptions.push(`Founding year: ${changes.foundingYear.from} → ${changes.foundingYear.to}`)
  }

  if (changes.numberOfEmployees) {
    const delta = changes.numberOfEmployees.to - changes.numberOfEmployees.from
    const sign = delta > 0 ? '+' : ''
    descriptions.push(`Employees ${sign}${delta}`)
  }

  return descriptions
}

/**
 * Check if changes are significant enough to warrant new version
 *
 * Prevents creating versions for trivial changes.
 *
 * @param changes - Version changes
 * @returns true if changes warrant new version
 */
export function areChangesSignificant(changes: VersionChanges): boolean {
  // Any significant change (>10% financial change)
  if (changes.significantChanges.length > 0) return true

  // Multiple non-significant changes
  if (changes.totalChanges >= 3) return true

  // Any financial change
  if (changes.revenue || changes.ebitda || changes.totalAssets || changes.totalDebt) {
    return true
  }

  return false
}

/**
 * Generate auto-label from changes
 *
 * Creates descriptive label for version based on what changed.
 *
 * @param versionNumber - Version number
 * @param changes - Version changes
 * @returns Auto-generated label
 *
 * @example
 * ```typescript
 * generateAutoLabel(3, changes)
 * // Returns: "v3 - Adjusted revenue, ebitda"
 * ```
 */
export function generateAutoLabel(versionNumber: number, changes: VersionChanges): string {
  if (changes.totalChanges === 0) {
    return `Version ${versionNumber}`
  }

  if (changes.significantChanges.length > 0) {
    const fields = changes.significantChanges.join(', ')
    return `v${versionNumber} - Adjusted ${fields}`
  }

  if (changes.totalChanges === 1) {
    // Single change - be specific
    if (changes.revenue) return `v${versionNumber} - Updated revenue`
    if (changes.ebitda) return `v${versionNumber} - Updated EBITDA`
    if (changes.companyName) return `v${versionNumber} - Renamed company`
  }

  return `v${versionNumber} - ${changes.totalChanges} changes`
}
