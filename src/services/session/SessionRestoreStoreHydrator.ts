import { sanitizePreSelectedValuationMethod } from '../../constants/sessionUiKeys'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import type { ValuationResponse } from '../../types/valuation'
import { parseCurrentYearRevenueForMethodNav } from '../../utils/currentYearRevenueForMethodNav'
import {
  hydrateClientValuationResultsMap,
  resolveSelectedValuationMethodForExtraction,
} from '../../utils/extractValuationResultsMap'
import { generalLogger } from '../../utils/logger'
import { buildOptionalSessionGapFillPatch } from '../../utils/mergeOptionalSessionPrefillFields'
import { extractRenderableHtmlFromSessionPayload } from '../../utils/reportHtmlRecovery'
import { seedNbbPrefillFromFormData } from './SessionNbbPrefillHydrator'
import type { NormalizedSessionData } from './SessionNormalizer'
import {
  asFormPatch,
  asFormSnapshotForRevenueNav,
  asString,
  asValuationResultWithAssets,
} from './SessionRestorationCoercion'

type RestorationPhaseGuard = (phase: string) => boolean

interface StepResult {
  stopped: boolean
}

export interface RestoredFormHydrationResult extends StepResult {
  restoredFormFields: number
}

export interface RestoredValuationHydrationResult extends StepResult {
  restoredValuationResult: boolean
  restoredHtmlReport: boolean
  restoredPricingRange: boolean
}

export function hydrateRestoredFormState(
  data: NormalizedSessionData,
  shouldContinue: RestorationPhaseGuard
): RestoredFormHydrationResult {
  let restoredFormFields = 0
  if (data.flowType === 'conversational') return { restoredFormFields, stopped: false }

  try {
    if (!shouldContinue('form')) return { restoredFormFields, stopped: true }
    const { updateFormData } = useManualFormStore.getState()

    if (data.formData && Object.keys(data.formData).length > 0) {
      updateFormData(asFormPatch(data.formData))
      restoredFormFields = Object.keys(data.formData).length

      generalLogger.info('[SessionRestoration] Form data hydrated', {
        reportId: data.reportId?.substring(0, 30),
        fieldCount: restoredFormFields,
        fields: Object.keys(data.formData),
        kboFields: {
          company_name: !!data.formData.company_name,
          kbo_number: !!data.formData.kbo_number,
          vat_number: !!data.formData.vat_number,
        },
      })
    }

    const gapPatch = buildOptionalSessionGapFillPatch(
      data.sessionDataEnvelope,
      useManualFormStore.getState().formData
    )
    if (Object.keys(gapPatch).length > 0) {
      updateFormData(asFormPatch(gapPatch))
      restoredFormFields += Object.keys(gapPatch).length
      generalLogger.debug('[SessionRestoration] Optional envelope gap-fill after restore', {
        reportId: data.reportId?.substring(0, 24),
        keys: Object.keys(gapPatch),
      })
    }

    const fdFinal = useManualFormStore.getState().formData as unknown as Record<string, unknown>
    if (Object.keys(fdFinal).length > 0) {
      seedNbbPrefillFromFormData(fdFinal, data.reportId, 'restore')
    }
  } catch (error) {
    generalLogger.error('[SessionRestoration] Form hydration failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return { restoredFormFields, stopped: false }
}

export function hydrateRestoredMethodSelections(
  data: NormalizedSessionData,
  shouldContinue: RestorationPhaseGuard
): StepResult {
  if (data.flowType === 'conversational') return { stopped: false }

  if (!data.valuationResult && data.preSelectedValuationMethod !== undefined) {
    try {
      if (!shouldContinue('preselected-method')) return { stopped: true }
      if (data.preSelectedValuationMethod === null) {
        useManualResultsStore.getState().setPreSelectedMethod(null)
      } else {
        const revFromForm =
          data.formData && typeof data.formData === 'object'
            ? parseCurrentYearRevenueForMethodNav(asFormSnapshotForRevenueNav(data.formData))
            : undefined
        const parsed = sanitizePreSelectedValuationMethod(
          data.preSelectedValuationMethod,
          null,
          revFromForm
        )
        if (parsed !== null) {
          useManualResultsStore.getState().setPreSelectedMethod(parsed)
        } else {
          useManualResultsStore.getState().setPreSelectedMethod(null)
        }
      }
      generalLogger.debug('[SessionRestoration] Pre-selected valuation method hydrated', {
        reportId: data.reportId?.substring(0, 30),
        raw: data.preSelectedValuationMethod,
      })
    } catch (error) {
      generalLogger.warn('[SessionRestoration] Pre-selected method hydration failed', {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  if (!shouldContinue('preselected-methods')) return { stopped: true }
  const store = useManualResultsStore.getState()
  if (data.preSelectedMethods && data.preSelectedMethods.length > 0) {
    store.setPreSelectedMethods(data.preSelectedMethods)
  }
  if (data.userWeights && Object.keys(data.userWeights).length > 0) {
    store.setUserWeights(data.userWeights)
  }
  if (data.userWeightJustification) {
    store.setUserWeightJustification(data.userWeightJustification)
  }
  if (data.methodDataPlan) {
    store.setMethodDataPlan(data.methodDataPlan)
  }

  return { stopped: false }
}

export function hydrateRestoredValuationResult(
  data: NormalizedSessionData,
  shouldContinue: RestorationPhaseGuard
): RestoredValuationHydrationResult {
  let restoredValuationResult = false
  let restoredHtmlReport = false
  let restoredPricingRange = false
  const sessionHtmlPayload = {
    htmlReport: data.htmlReport,
    valuationResult: data.valuationResult,
    sessionData: data.sessionDataEnvelope,
  }
  const hasOutputAssets = !!extractRenderableHtmlFromSessionPayload(sessionHtmlPayload)
  const hasResult = !!data.valuationResult

  if (!(hasResult || hasOutputAssets)) {
    return {
      restoredValuationResult,
      restoredHtmlReport,
      restoredPricingRange,
      stopped: false,
    }
  }

  try {
    if (!shouldContinue('results')) {
      return {
        restoredValuationResult,
        restoredHtmlReport,
        restoredPricingRange,
        stopped: true,
      }
    }
    const existingResult = asValuationResultWithAssets(useManualResultsStore.getState().result)
    const vr = asValuationResultWithAssets(data.valuationResult)
    const mergeHydrateOpts = {
      selectedValuationMethodOverride:
        resolveSelectedValuationMethodForExtraction(vr) ??
        resolveSelectedValuationMethodForExtraction(existingResult) ??
        vr?.selected_valuation_method ??
        existingResult?.selected_valuation_method,
    }
    const normalizedValuationResults =
      hydrateClientValuationResultsMap(vr, mergeHydrateOpts) ??
      hydrateClientValuationResultsMap(existingResult, mergeHydrateOpts)
    const renderableMergeHtml = extractRenderableHtmlFromSessionPayload(sessionHtmlPayload)
    const fullResult = {
      ...(data.valuationResult || {}),
      valuation_id: asString(vr?.valuation_id) || data.reportId,
      html_report: renderableMergeHtml,
      valuation_results: normalizedValuationResults ?? undefined,
      ...(data.pricingRange && {
        equity_value_low: data.pricingRange.min,
        equity_value_mid: data.pricingRange.mid,
        equity_value_high: data.pricingRange.max,
        currency: data.pricingRange.currency,
      }),
    }

    if (data.flowType === 'conversational') {
      generalLogger.debug(
        '[SessionRestoration] Skipping conversational results hydration - stores removed',
        {
          reportId: data.reportId,
        }
      )
    } else {
      const manualStore = useManualResultsStore.getState()
      manualStore.setResult(fullResult as unknown as ValuationResponse)
      const renderableHtmlReport = extractRenderableHtmlFromSessionPayload({
        htmlReport: data.htmlReport,
        valuationResult: fullResult,
        sessionData: data.sessionDataEnvelope,
      })
      if (renderableHtmlReport) manualStore.setHtmlReport(renderableHtmlReport)
    }

    restoredValuationResult = !!data.valuationResult
    restoredHtmlReport = !!extractRenderableHtmlFromSessionPayload({
      htmlReport: data.htmlReport,
      valuationResult: fullResult,
      sessionData: data.sessionDataEnvelope,
    })
    restoredPricingRange = !!data.pricingRange

    generalLogger.debug('[SessionRestoration] Results hydrated', {
      reportId: data.reportId,
      hasValuationResult: restoredValuationResult,
      hasHtmlReport: restoredHtmlReport,
      hasPricingRange: restoredPricingRange,
    })
  } catch (error) {
    generalLogger.error('[SessionRestoration] Results hydration failed', {
      error: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    restoredValuationResult,
    restoredHtmlReport,
    restoredPricingRange,
    stopped: false,
  }
}
