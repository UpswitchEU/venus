import {
  getBonusSectionsSaasSignalsFromFormData,
  getSynthesisMethodKeysForUi,
  resolveBusinessTypeIdForBonusSections,
  type GetBonusSectionsSaasSignals,
} from '../../../constants/methodFieldConfig'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { isYearRowForecast } from '../../../utils/yearData'
import { getSeedBaseFilingYear } from './manualFinancialSeeds'
import {
  buildManualInputAdaptiveHeaderSteps,
  getManualInputBalanceSheetCarveOutStep,
  getManualInputSynthesisStep,
  type ManualInputAdaptiveHeaderSteps,
} from './manualInputAdaptiveSteps'
import {
  buildManualInputNormalizedData,
  type ManualInputNormalizedData,
} from './manualInputNormalizedData'
import { deriveManualInputReadiness, type ManualInputReadiness } from './manualInputReadiness'
import type { NormalizationItem } from '../UnifiedNormalizationModal'

export interface ManualInputBusinessTypeProjection {
  category?: unknown
  id?: string
}

export interface ManualInputPresentationModel {
  acceptedNormCount: number
  adaptiveHeaderSteps: ManualInputAdaptiveHeaderSteps
  balanceSheetCarveOutStep: number
  baseFilingYearForLabels: number
  historicalCardRows: YearlyFinancials[]
  normalizedData: ManualInputNormalizedData
  readiness: ManualInputReadiness
  resolvedBusinessCategoryForBonusSections: unknown
  resolvedBusinessTypeIdForBonusSections?: string | null
  saasSignalsForBonusSections: GetBonusSectionsSaasSignals
  synthesisMethodsForPanel: string[]
  synthesisStep: number
}

export function sortManualInputYearlyFinancials(
  yearlyFinancials: YearlyFinancials[]
): YearlyFinancials[] {
  return [...yearlyFinancials].sort((a, b) => Number(b.year) - Number(a.year))
}

export function getManualInputHistoricalCardRows({
  hasDcfSelected,
  sortedYearlyFinancials,
}: {
  hasDcfSelected: boolean
  sortedYearlyFinancials: YearlyFinancials[]
}): YearlyFinancials[] {
  return hasDcfSelected
    ? sortedYearlyFinancials.filter((year) => !isYearRowForecast(year))
    : sortedYearlyFinancials
}

export function resolveManualInputSelectedBusinessCategory(
  selectedBusinessType?: ManualInputBusinessTypeProjection | null
): unknown {
  return selectedBusinessType?.category ?? null
}

export function buildManualInputPresentationModel({
  canSave,
  effectiveMethod,
  effectiveMethods,
  formData,
  hasDcfForecastWorkspace,
  hasDcfSelected,
  latestCompleteYearlyFinancial,
  normalizationItems,
  selectedBusinessCategoryForMethodInputs,
  selectedBusinessType,
  selectedCompanyPresent,
  sortedYearlyFinancials,
  storeBusinessContext,
  storeBusinessModel,
  storeBusinessTypeId,
}: {
  canSave: boolean
  effectiveMethod: string
  effectiveMethods: string[]
  formData: ManualValuationFormData
  hasDcfForecastWorkspace: boolean
  hasDcfSelected: boolean
  latestCompleteYearlyFinancial?: YearlyFinancials | null
  normalizationItems: NormalizationItem[]
  selectedBusinessCategoryForMethodInputs: unknown
  selectedBusinessType?: ManualInputBusinessTypeProjection | null
  selectedCompanyPresent: boolean
  sortedYearlyFinancials: YearlyFinancials[]
  storeBusinessContext?: unknown
  storeBusinessModel?: unknown
  storeBusinessTypeId?: string
}): ManualInputPresentationModel {
  const acceptedNormCount = normalizationItems.filter((n) => n.status === 'accepted').length
  const normalizedData = buildManualInputNormalizedData({
    estimatedMarketRent: formData.estimated_market_rent,
    excludeRealEstate: formData.exclude_real_estate,
    normalizationItems,
    yearlyFinancials: formData.yearlyFinancials,
  })
  const historicalCardRows = getManualInputHistoricalCardRows({
    hasDcfSelected,
    sortedYearlyFinancials,
  })
  const baseFilingYearForLabels = getSeedBaseFilingYear(formData)
  const resolvedBusinessCategoryForBonusSections = selectedBusinessCategoryForMethodInputs
  const business_model =
    formData.business_model ??
    (typeof storeBusinessModel === 'string' ? storeBusinessModel : undefined)
  const business_context =
    formData.business_context ??
    (storeBusinessContext && typeof storeBusinessContext === 'object'
      ? (storeBusinessContext as Record<string, unknown>)
      : undefined)
  const saasSignalsForBonusSections = getBonusSectionsSaasSignalsFromFormData({
    business_model,
    business_context,
  })
  const resolvedBusinessTypeIdForBonusSections = resolveBusinessTypeIdForBonusSections(
    selectedBusinessType?.id,
    formData.businessType,
    storeBusinessTypeId
  )
  const adaptiveHeaderSteps = buildManualInputAdaptiveHeaderSteps({
    effectiveMethod,
    effectiveMethods,
    hasDcfForecastWorkspace,
    resolvedBusinessCategory: resolvedBusinessCategoryForBonusSections,
    resolvedBusinessTypeId: resolvedBusinessTypeIdForBonusSections,
    saasSignals: saasSignalsForBonusSections,
  })
  const balanceSheetCarveOutStep = getManualInputBalanceSheetCarveOutStep(hasDcfForecastWorkspace)
  const synthesisStep = getManualInputSynthesisStep(balanceSheetCarveOutStep, adaptiveHeaderSteps)
  const readiness = deriveManualInputReadiness({
    canSave,
    formData,
    hasSelectedBusinessType: Boolean(selectedBusinessType),
    hasSelectedCompany: selectedCompanyPresent,
    latestCompleteYearlyFinancial,
    resolvedBusinessTypeId: resolvedBusinessTypeIdForBonusSections,
  })

  return {
    acceptedNormCount,
    adaptiveHeaderSteps,
    balanceSheetCarveOutStep,
    baseFilingYearForLabels,
    historicalCardRows,
    normalizedData,
    readiness,
    resolvedBusinessCategoryForBonusSections,
    resolvedBusinessTypeIdForBonusSections,
    saasSignalsForBonusSections,
    synthesisMethodsForPanel: getSynthesisMethodKeysForUi(effectiveMethods),
    synthesisStep,
  }
}
