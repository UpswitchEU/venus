import type { StartupStage as StoreStartupStage } from '@/store/manual/useStartupValuationStore'
import { STARTUP_STAGE_DEFAULT_RAISE } from '@/store/manual/useStartupValuationStore'
import type { BusinessTypeSegmentInput, ValuationFormData } from '@/types/valuation'
import { mapLegalFormToBusinessStructure } from '@/utils/legalFormMapping'

export interface LegalFormOption {
  value: string
  label: string
}

/**
 * Country-scoped legal-form enum. Falls back to BE for unknown country
 * codes so legacy payloads keep rendering.
 */
const LEGAL_FORM_OPTIONS_BY_COUNTRY: Record<string, ReadonlyArray<LegalFormOption>> = {
  BE: [
    { value: 'bv', label: 'BV' },
    { value: 'nv', label: 'NV' },
    { value: 'eenmanszaak', label: 'Eenmanszaak' },
    { value: 'vof', label: 'VOF' },
    { value: 'cvba', label: 'CVBA' },
    { value: 'vzw', label: 'VZW' },
  ],
  NL: [
    { value: 'bv', label: 'BV' },
    { value: 'nv', label: 'NV' },
    { value: 'eenmanszaak', label: 'Eenmanszaak' },
    { value: 'vof', label: 'VOF' },
    { value: 'cv', label: 'CV (Coöperatie)' },
    { value: 'stichting', label: 'Stichting' },
  ],
  FR: [
    { value: 'sas', label: 'SAS' },
    { value: 'sasu', label: 'SASU' },
    { value: 'sarl', label: 'SARL' },
    { value: 'eurl', label: 'EURL' },
    { value: 'sa', label: 'SA' },
    { value: 'micro_entreprise', label: 'Micro-entreprise' },
  ],
  DE: [
    { value: 'gmbh', label: 'GmbH' },
    { value: 'ug', label: 'UG (haftungsbeschränkt)' },
    { value: 'ag', label: 'AG' },
    { value: 'gbr', label: 'GbR' },
    { value: 'kg', label: 'KG' },
    { value: 'einzelunternehmen', label: 'Einzelunternehmen' },
  ],
} as const

export function getLegalFormOptions(countryCode: string): LegalFormOption[] {
  return [
    ...(LEGAL_FORM_OPTIONS_BY_COUNTRY[countryCode.toUpperCase()] ??
      LEGAL_FORM_OPTIONS_BY_COUNTRY.BE),
  ]
}

export function resolveStageDefaultRaiseSeed({
  stage,
  raise,
}: {
  stage: StoreStartupStage
  raise: number | null | undefined
}): number | null {
  const stageDefaults = Object.values(STARTUP_STAGE_DEFAULT_RAISE)
  const isOnStageDefault = typeof raise === 'number' && stageDefaults.includes(raise)
  if (raise != null && !isOnStageDefault) return null

  const next = STARTUP_STAGE_DEFAULT_RAISE[stage]
  return raise === next ? null : next
}

export const MATERIAL_REVENUE_MRR_THRESHOLD = 10_000
export const MATERIAL_REVENUE_ARR_THRESHOLD = 120_000

export function hasMaterialRecurringRevenue({
  stage,
  mrr,
  arr,
}: {
  stage: StoreStartupStage
  mrr: number | null | undefined
  arr: number | null | undefined
}): boolean {
  return (
    stage !== 'series_a' &&
    ((typeof mrr === 'number' && mrr >= MATERIAL_REVENUE_MRR_THRESHOLD) ||
      (typeof arr === 'number' && arr >= MATERIAL_REVENUE_ARR_THRESHOLD))
  )
}

export function formatMaterialRevenueNudgeMrr({
  mrr,
  arr,
}: {
  mrr: number | null | undefined
  arr: number | null | undefined
}): string {
  return String(Math.round((mrr ?? (arr ?? 0) / 12) / 100) / 10)
}

export function buildCompanyCardCountryResetPatch(
  countryCode: string
): Partial<ValuationFormData> & Record<string, unknown> {
  return {
    country_code: countryCode.toUpperCase(),
    company_name: '',
    kbo_number: undefined,
    legal_form: undefined,
    business_structure: undefined,
    nace_code: undefined,
    nace_description: undefined,
    business_type_id: undefined,
    industry: undefined,
  }
}

export function buildCompanyCardClearPatch(): Partial<ValuationFormData> & Record<string, unknown> {
  return {
    company_name: '',
    kbo_number: undefined,
    legal_form: undefined,
    business_structure: undefined,
    nace_code: undefined,
    nace_description: undefined,
    business_type_id: undefined,
    business_type_title: undefined,
    business_type_segments: [],
    business_model: undefined,
    industry: undefined,
  }
}

export function buildBusinessStructurePatch(
  legalForm: string | null | undefined
): Partial<ValuationFormData> & Record<string, unknown> {
  const businessStructure = mapLegalFormToBusinessStructure(legalForm ?? '')
  return { business_structure: businessStructure || undefined }
}

export function updateSegmentEarningsValue(
  segments: BusinessTypeSegmentInput[],
  index: number,
  earnings: string
): BusinessTypeSegmentInput[] {
  return segments.map((segment, segmentIndex) =>
    segmentIndex === index
      ? {
          ...segment,
          earnings: earnings.trim() ? earnings : null,
        }
      : segment
  )
}

export function updateSegmentWeightValue(
  segments: BusinessTypeSegmentInput[],
  index: number,
  weight: string
): BusinessTypeSegmentInput[] {
  return segments.map((segment, segmentIndex) =>
    segmentIndex === index
      ? {
          ...segment,
          weight: weight.trim() ? weight : null,
        }
      : segment
  )
}
