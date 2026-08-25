import { isVenturePathMethodKey } from '@/lib/methods'
import { parseFlexibleNumber } from '@/utils/isFiniteNumeric'
import {
  getLatestCompleteYearlyFinancial,
  type YearlyFinancialLike,
} from '@/utils/yearlyFinancials'

export type ManualSubmitValidationIssue =
  | 'companyNameMissing'
  | 'businessTypeMissing'
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
  yearlyFinancials?: Array<
    YearlyFinancialLike & { isForecast?: boolean; is_forecast?: boolean }
  > | null
  user_configured_dcf?: boolean | null
  dcf_input_mode?: string | null
  user_weights?: Record<string, number> | null
  methodology?: string | null
}

const REQUIRED_DCF_ACTUAL_YEARS = 3

function hasPositiveDcfWeight(weights?: Record<string, number> | null): boolean {
  return Object.entries(weights ?? {}).some(
    ([method, rawWeight]) =>
      method.toLowerCase().includes('dcf') &&
      Number.isFinite(Number(rawWeight)) &&
      Number(rawWeight) > 0
  )
}

function hasExplicitDcfIntent(
  data: ManualSubmitValidationData,
  effectiveMethod: string | null | undefined
): boolean {
  return Boolean(
    String(effectiveMethod ?? '').toLowerCase() === 'dcf' ||
      data.user_configured_dcf ||
      data.dcf_input_mode === 'fcff_only' ||
      hasPositiveDcfWeight(data.user_weights) ||
      String(data.methodology ?? '').toUpperCase() === 'DCF'
  )
}

function resolveDcfAdmission(data: ManualSubmitValidationData): {
  actualYears: number[]
  hasExplicitFcffProjections: boolean
} {
  const actualYears = new Set<number>()
  let basisYear = 0

  for (const row of data.yearlyFinancials ?? []) {
    if (row.isForecast || row.is_forecast) continue
    const year = Number(row.year)
    if (Number.isInteger(year)) basisYear = Math.max(basisYear, year)
    const revenue = parseFlexibleNumber(row.revenue)
    const ebitda = parseFlexibleNumber(row.ebitda)
    if (!Number.isInteger(year) || revenue === undefined || revenue <= 0 || ebitda === undefined) {
      continue
    }
    actualYears.add(year)
  }

  const hasExplicitFcffProjections =
    data.dcf_input_mode === 'fcff_only' &&
    (data.yearlyFinancials ?? []).some((row) => {
      const year = Number(row.year)
      const freeCashFlow = parseFlexibleNumber(row.free_cash_flow)
      return (
        Boolean(row.isForecast || row.is_forecast) &&
        Number.isInteger(year) &&
        year > basisYear &&
        freeCashFlow !== undefined
      )
    })

  return {
    actualYears: [...actualYears].sort((left, right) => left - right),
    hasExplicitFcffProjections,
  }
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

  if (hasExplicitDcfIntent(data, effectiveMethod)) {
    const admission = resolveDcfAdmission(data)
    if (
      admission.actualYears.length < REQUIRED_DCF_ACTUAL_YEARS &&
      !admission.hasExplicitFcffProjections
    ) {
      return 'dcfNotReady'
    }
  }

  return null
}
