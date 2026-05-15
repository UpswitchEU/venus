import { isVenturePathMethodKey } from '@/lib/methods'
import {
  getLatestCompleteYearlyFinancial,
  type YearlyFinancialLike,
} from '@/utils/yearlyFinancials'

export type ManualSubmitValidationIssue =
  | 'companyNameMissing'
  | 'businessTypeMissing'
  | 'financialDataIncomplete'

export const MANUAL_SUBMIT_VALIDATION_TOAST_KEYS = {
  companyNameMissing: {
    title: 'companyNameMissing',
    description: 'companyNameMissingDesc',
  },
  businessTypeMissing: {
    title: 'businessTypeMissing',
    description: 'businessTypeMissingDesc',
  },
  financialDataIncomplete: {
    title: 'financialDataIncomplete',
    description: 'financialDataIncompleteDesc',
  },
} as const satisfies Record<ManualSubmitValidationIssue, { title: string; description: string }>

export interface ManualSubmitValidationData {
  companyName?: string | null
  businessType?: string | null
  yearlyFinancials?: YearlyFinancialLike[] | null
}

/**
 * Validates only the minimum submit blockers. Venture-path methods skip SME
 * historical-financial blockers because their engine is milestone driven.
 */
export function getManualSubmitValidationIssue(
  data: ManualSubmitValidationData,
  effectiveMethod: string | null | undefined
): ManualSubmitValidationIssue | null {
  if (!data.companyName?.trim()) return 'companyNameMissing'

  if (isVenturePathMethodKey(effectiveMethod)) return null

  if (!data.businessType?.trim()) return 'businessTypeMissing'
  if (!getLatestCompleteYearlyFinancial(data.yearlyFinancials ?? [])) {
    return 'financialDataIncomplete'
  }

  return null
}
