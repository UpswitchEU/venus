import { isVenturePathMethodKey } from '@/lib/methods'
import { explicitlyRequestsDcf, resolveManualDcfReadiness } from '@/utils/dcfReadiness'
import {
  getLatestCompleteYearlyFinancial,
  type YearlyFinancialLike,
} from '@/utils/yearlyFinancials'

export type ManualSubmitValidationIssue =
  | 'companyNameMissing'
  | 'businessTypeMissing'
  | 'employeeCountMissing'
  | 'financialDataIncomplete'
  | 'dcfNotReady'

export const MANUAL_SUBMIT_VALIDATION_TOAST_KEYS = {
  companyNameMissing: {
    title: 'companyNameMissing',
    description: 'companyNameMissingDesc',
  },
  businessTypeMissing: {
    title: 'businessTypeMissing',
    description: 'businessTypeMissingDesc',
  },
  employeeCountMissing: {
    title: 'employeeCountMissing',
    description: 'employeeCountMissingDesc',
  },
  financialDataIncomplete: {
    title: 'financialDataIncomplete',
    description: 'financialDataIncompleteDesc',
  },
  dcfNotReady: {
    title: 'dcfNotReady',
    description: 'dcfNotReadyDesc',
  },
} as const satisfies Record<ManualSubmitValidationIssue, { title: string; description: string }>

export interface ManualSubmitValidationData {
  companyName?: string | null
  businessType?: string | null
  businessTypeCode?: string | null
  businessTypeId?: string | null
  business_type_id?: string | null
  business_type_segments?: Array<{ business_type_id?: string | null } | null> | null
  businessStructure?: string | null
  ownerManagers?: number | null
  fteEmployees?: number | null
  yearlyFinancials?: Array<
    YearlyFinancialLike & { isForecast?: boolean; is_forecast?: boolean }
  > | null
  user_configured_dcf?: boolean | null
  dcf_input_mode?: string | null
  dcf_exit_multiple?: unknown
  dcf_discounting_convention?: string | null
  dcf_tax_shield_projections?: unknown[] | null
  user_weights?: Record<string, number> | null
  methodology?: string | null
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
 * The engine reads the headcount against the owners (owner concentration, sole-trader
 * detection), so a company needs a real count: asked for, never assumed. 0 is a valid
 * answer; sole traders send none.
 */
function isEmployeeCountMissing(data: ManualSubmitValidationData): boolean {
  // The request always carries at least one owner (the mapper sends `ownerManagers || 1`),
  // so a cleared or zero owner count does not make the headcount optional.
  const hasOwnerManagers = (data.ownerManagers || 1) > 0
  if (data.businessStructure === 'sole-trader' || !hasOwnerManagers) return false
  return typeof data.fteEmployees !== 'number' || !Number.isFinite(data.fteEmployees)
}

/**
 * Validates only the minimum submit blockers. Every valuation path needs a
 * resolved business-type identity; venture-path methods only skip the SME
 * headcount and historical-financial blockers because their engine is
 * milestone driven.
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

  if (isEmployeeCountMissing(data)) return 'employeeCountMissing'

  if (!getLatestCompleteYearlyFinancial(data.yearlyFinancials ?? [])) {
    return 'financialDataIncomplete'
  }

  if (
    explicitlyRequestsDcf({
      selectedMethod: effectiveMethod,
      userConfiguredDcf: data.user_configured_dcf,
      dcfInputMode: data.dcf_input_mode,
      exitMultiple: data.dcf_exit_multiple,
      discountingConvention: data.dcf_discounting_convention,
      taxShieldProjectionCount: data.dcf_tax_shield_projections?.length,
      userWeights: data.user_weights,
      methodology: data.methodology,
    })
  ) {
    const readiness = resolveManualDcfReadiness({
      yearlyFinancials: data.yearlyFinancials,
      dcfInputMode: data.dcf_input_mode,
    })
    if (!readiness.ready) {
      return 'dcfNotReady'
    }
  }

  return null
}
