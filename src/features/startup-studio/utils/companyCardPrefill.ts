import type { StartupSector, StartupStage } from '@/store/manual/useStartupValuationStore'
import type { ValuationFormData } from '@/types/valuation'
import {
  isStudioDeepLinkSector,
  isStudioDeepLinkStage,
  normalizeStudioCountryCode,
} from './studioDeepLinkContract'

const COMPANY_NAME_MAX_LENGTH = 120
const PITCH_MAX_LENGTH = 240

export interface CompanyCardPrefillCurrentState {
  companyName?: string | null
  countryCode?: string | null
  mrr?: number | null
  arr?: number | null
  investmentAmountSought?: number | null
  description?: string | null
}

export interface CompanyCardPrefillPlan {
  formPatch: Pick<Partial<ValuationFormData>, 'company_name' | 'country_code'>
  studioPatch: {
    stage?: StartupStage
    sector?: StartupSector
    country_code?: string
    mrr?: number
    arr?: number
    investment_amount_sought?: number
    description?: string
  }
}

function hasText(value: string | null | undefined): boolean {
  return !!value?.trim()
}

function trimmedParam(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim()
  return value || null
}

function positiveIntegerParam(params: URLSearchParams, key: string): number | null {
  const raw = params.get(key)
  if (!raw) return null
  const value = Math.round(Number(raw))
  return Number.isFinite(value) && value > 0 ? value : null
}

export function deriveCompanyCardPrefillPlan(
  search: string,
  current: CompanyCardPrefillCurrentState
): CompanyCardPrefillPlan {
  const params = new URLSearchParams(search)
  const formPatch: CompanyCardPrefillPlan['formPatch'] = {}
  const studioPatch: CompanyCardPrefillPlan['studioPatch'] = {}

  const companyName = trimmedParam(params, 'companyName') ?? trimmedParam(params, 'prefilledQuery')
  if (companyName && !hasText(current.companyName)) {
    formPatch.company_name = companyName.slice(0, COMPANY_NAME_MAX_LENGTH)
  }

  const stage = trimmedParam(params, 'stage')
  if (isStudioDeepLinkStage(stage)) {
    studioPatch.stage = stage
  }

  const sector = trimmedParam(params, 'sector')
  if (isStudioDeepLinkSector(sector)) {
    studioPatch.sector = sector
  }

  const country = normalizeStudioCountryCode(params.get('country'))
  if (country && !hasText(current.countryCode)) {
    formPatch.country_code = country
    studioPatch.country_code = country
  }

  const mrr = positiveIntegerParam(params, 'mrr')
  if (mrr != null && current.mrr == null) {
    studioPatch.mrr = mrr
  }

  const arr = positiveIntegerParam(params, 'arr')
  if (arr != null && current.arr == null) {
    studioPatch.arr = arr
  }

  const raise = positiveIntegerParam(params, 'raise')
  if (raise != null && current.investmentAmountSought == null) {
    studioPatch.investment_amount_sought = raise
  }

  const pitch = trimmedParam(params, 'pitch')
  if (pitch && !hasText(current.description)) {
    studioPatch.description = pitch.slice(0, PITCH_MAX_LENGTH)
  }

  return { formPatch, studioPatch }
}
