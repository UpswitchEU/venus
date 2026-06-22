import type { ValuationMethodResult } from '../../types/valuation'
import { getValuationMethodResultForKey } from '../../utils/extractValuationResultsMap'

export const METHOD_OVERRIDE_REASON_KEYS = [
  'fiscal_compliance',
  'asset_heavy_business',
  'internal_transfer',
  'conservative_anchor',
  'client_preference',
  'regulatory_requirement',
  'other',
] as const

export type ValuationEditMode = 'ai' | 'manual'
export type ValuationEditMethodDataLoadError = 'transient' | 'report_pending' | null
export type ValuationEditTranslationSource = 'modal' | 'omni'
export type ValuationEditGuidanceVariant = 'pending' | 'manual' | 'ai'

export type ValuationEditEmptyState = {
  titleSource: ValuationEditTranslationSource
  titleKey: string
  blurbSource: ValuationEditTranslationSource
  blurbKey: string
  showRetry: boolean
  showImportReviewRecovery: boolean
}

export const VALUATION_EDIT_GUIDANCE_TONE_CLASS: Record<ValuationEditGuidanceVariant, string> = {
  pending: 'border-primary/20 bg-primary/[0.04] text-primary/80',
  manual:
    'border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400',
  ai: 'border-border/60 bg-background/60 text-foreground/60',
}

export function getValuationEditModeForSelectedMethod(selectedMethod: string): ValuationEditMode {
  return selectedMethod !== 'upswitch_adaptive' ? 'manual' : 'ai'
}

export function getValuationEditGuidanceVariant(
  mode: ValuationEditMode,
  pendingMethod: string | null
): ValuationEditGuidanceVariant {
  if (pendingMethod) return 'pending'
  return mode === 'manual' ? 'manual' : 'ai'
}

export function getValuationEditGuidanceTextKey(variant: ValuationEditGuidanceVariant): string {
  if (variant === 'pending') return 'stepExplainReason'
  if (variant === 'manual') return 'stepChooseMethod'
  return 'stepAiActive'
}

export function resolveValuationEditEmptyState({
  isHydratingMethods,
  methodDataLoadError,
  hasImportReviewRecovery,
}: {
  isHydratingMethods: boolean
  methodDataLoadError: ValuationEditMethodDataLoadError
  hasImportReviewRecovery: boolean
}): ValuationEditEmptyState {
  if (isHydratingMethods) {
    return {
      titleSource: 'modal',
      titleKey: 'loadingTitle',
      blurbSource: 'modal',
      blurbKey: 'loadingBlurb',
      showRetry: false,
      showImportReviewRecovery: false,
    }
  }

  if (methodDataLoadError === 'transient') {
    return {
      titleSource: 'omni',
      titleKey: 'transientLoadTitle',
      blurbSource: 'omni',
      blurbKey: 'transientLoadBlurb',
      showRetry: true,
      showImportReviewRecovery: false,
    }
  }

  if (methodDataLoadError === 'report_pending') {
    return {
      titleSource: 'omni',
      titleKey: 'unavailableTitleReportPending',
      blurbSource: 'omni',
      blurbKey: 'unavailableBlurbReportPending',
      showRetry: true,
      showImportReviewRecovery: hasImportReviewRecovery,
    }
  }

  return {
    titleSource: 'omni',
    titleKey: 'unavailableTitleLegacy',
    blurbSource: 'omni',
    blurbKey: 'unavailableBlurbLegacy',
    showRetry: false,
    showImportReviewRecovery: false,
  }
}

export function resolveSelectedValuationMethodLabel({
  adaptiveLabel,
  method,
  valuationResults,
}: {
  adaptiveLabel: string
  method: string
  valuationResults: Record<string, ValuationMethodResult>
}): string {
  if (method === 'upswitch_adaptive') return adaptiveLabel
  return getValuationMethodResultForKey(valuationResults, method)?.label || adaptiveLabel
}

export function sanitizeZeroDraftFilename(rawName: string): string {
  return rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
}
