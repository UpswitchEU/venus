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
  businessTypeCode?: string | null
  businessTypeId?: string | null
  business_type_id?: string | null
  business_type_segments?: Array<{ business_type_id?: string | null } | null> | null
  yearlyFinancials?: YearlyFinancialLike[] | null
}

function hasResolvedBusinessType(
  data: ManualSubmitValidationData,
  options: { allowLooseBusinessTypeLabel?: boolean } = {}
): boolean {
  const hasSegment = data.business_type_segments?.some((segment) =>
    Boolean(segment?.business_type_id?.trim())
  )
  const hasCanonicalIdentity = Boolean(
    hasSegment ||
      data.businessTypeCode?.trim() ||
      data.businessTypeId?.trim() ||
      data.business_type_id?.trim()
  )
  if (hasCanonicalIdentity) return true
  if (!options.allowLooseBusinessTypeLabel) return false
  return Boolean(data.businessType?.trim())
}

/**
 * Validates only the minimum submit blockers. Every valuation path needs a
 * resolved business-type identity; venture-path methods only skip SME
 * historical-financial blockers because their engine is milestone driven.
 */
export function getManualSubmitValidationIssue(
  data: ManualSubmitValidationData,
  effectiveMethod: string | null | undefined
): ManualSubmitValidationIssue | null {
  if (!data.companyName?.trim()) return 'companyNameMissing'

  const isVenturePath = isVenturePathMethodKey(effectiveMethod)
  if (!hasResolvedBusinessType(data, { allowLooseBusinessTypeLabel: !isVenturePath })) {
    return 'businessTypeMissing'
  }

  if (isVenturePath) return null

  if (!getLatestCompleteYearlyFinancial(data.yearlyFinancials ?? [])) {
    return 'financialDataIncomplete'
  }

  return null
}
