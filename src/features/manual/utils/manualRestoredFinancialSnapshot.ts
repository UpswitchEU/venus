import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'
import { FINANCIAL_YEAR_AMOUNT_KEYS, restoreFinancialYear } from '@/utils/restoredFinancialYear'
import type { SubmittedFinancialSnapshot } from './manualFinancialSnapshot'
import { buildManualLiveYearlyFinancials } from './manualLiveYearlyFinancials'

export function buildManualRestoredFinancialSnapshot(
  formData: unknown
): SubmittedFinancialSnapshot | null {
  if (!formData || typeof formData !== 'object' || Array.isArray(formData)) return null
  const form = formData as Record<string, unknown>
  const yearlyFinancials = buildManualLiveYearlyFinancials({ formData })
  if (
    !yearlyFinancials.some((row) =>
      FINANCIAL_YEAR_AMOUNT_KEYS.some((key) => row[key] !== undefined)
    )
  )
    return null
  const current = restoreFinancialYear(form.current_year_data)
  return {
    revenue: current ? current.revenue : parseFlexibleNumber(form.revenue),
    ebitda: current ? current.ebitda : parseFlexibleNumber(form.ebitda),
    yearlyFinancials,
  }
}
