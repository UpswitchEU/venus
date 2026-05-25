import {
  type GetBonusSectionsSaasSignals,
  getBonusSections,
  getBonusSectionsForMethods,
} from '../../../constants/methodFieldConfig'

export interface ManualInputAdaptiveHeaderSteps {
  dcfGlobal?: number
  fiscal?: number
  nav?: number
  revenue?: number
  saas?: number
  sde?: number
}

export interface BuildManualInputAdaptiveHeaderStepsParams {
  effectiveMethod: string
  effectiveMethods: string[]
  hasDcfForecastWorkspace: boolean
  resolvedBusinessCategory: unknown
  resolvedBusinessTypeId?: string | null
  saasSignals: GetBonusSectionsSaasSignals
}

export function buildManualInputAdaptiveHeaderSteps({
  effectiveMethod,
  effectiveMethods,
  hasDcfForecastWorkspace,
  resolvedBusinessCategory,
  resolvedBusinessTypeId,
  saasSignals,
}: BuildManualInputAdaptiveHeaderStepsParams): ManualInputAdaptiveHeaderSteps {
  const bonus =
    effectiveMethods.length > 1
      ? getBonusSectionsForMethods(
          effectiveMethods,
          resolvedBusinessCategory,
          resolvedBusinessTypeId,
          saasSignals
        )
      : getBonusSections(
          effectiveMethod,
          resolvedBusinessCategory,
          resolvedBusinessTypeId,
          saasSignals
        )
  let nextStep = hasDcfForecastWorkspace ? 8 : 5
  const steps: ManualInputAdaptiveHeaderSteps = {}

  if (bonus.includes('fiscal_inputs')) {
    steps.fiscal = nextStep++
  }
  if (bonus.includes('dcf_projections')) {
    steps.dcfGlobal = hasDcfForecastWorkspace ? 4 : nextStep++
  }
  if (bonus.includes('nav_asset_schedule')) {
    steps.nav = nextStep++
  }
  if (bonus.includes('saas_metrics')) {
    steps.saas = nextStep++
  }
  if (bonus.includes('revenue_quality')) {
    steps.revenue = nextStep++
  }
  if (bonus.includes('sde_owner_compensation')) {
    steps.sde = nextStep++
  }

  return steps
}

export function getManualInputBalanceSheetCarveOutStep(hasDcfForecastWorkspace: boolean): number {
  return hasDcfForecastWorkspace ? 7 : 4
}

export function getManualInputSynthesisStep(
  balanceSheetCarveOutStep: number,
  adaptiveHeaderSteps: ManualInputAdaptiveHeaderSteps
): number {
  const allSteps = [
    3,
    balanceSheetCarveOutStep,
    adaptiveHeaderSteps.dcfGlobal,
    adaptiveHeaderSteps.nav,
    adaptiveHeaderSteps.saas,
    adaptiveHeaderSteps.revenue,
    adaptiveHeaderSteps.sde,
    adaptiveHeaderSteps.fiscal,
  ].filter((step): step is number => step != null)
  return Math.max(...allSteps) + 1
}
