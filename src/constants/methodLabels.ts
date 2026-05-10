/**
 * Valuation method keys → next-intl paths under `manualInput.methodSelector.*`.
 *
 * Single source of truth for labels in the method dropdown, synthesis UI, and docs.
 * Add a new method here when extending `PRE_SELECTABLE_METHODS` / `methodFieldConfig`.
 */

export const METHOD_LABEL_KEYS: Record<string, string> = {
  upswitch_adaptive: 'manualInput.methodSelector.adaptiveRecommended',
  omzet_multiple: 'manualInput.methodSelector.revenueMultiple',
  revenue_multiple: 'manualInput.methodSelector.revenueMultiple',
  arr_multiple: 'manualInput.methodSelector.arrMultiple',
  ebitda_multiple: 'manualInput.methodSelector.ebitdaMultiple',
  dcf: 'manualInput.methodSelector.dcf',
  sde_multiple: 'manualInput.methodSelector.sdeMultiple',
  adjusted_nav: 'manualInput.methodSelector.adjustedNav',
  fiscal_4x: 'manualInput.methodSelector.fiscal4x',
  startup_valuation: 'manualInput.methodSelector.startupValuation',
  liquidation_analysis: 'manualInput.methodSelector.liquidationAnalysis',
}

/** Methods that show an info tooltip in the nav dropdown (long-form i18n description). */
export const METHOD_DESCRIPTION_KEYS: Record<string, string> = {
  upswitch_adaptive: 'manualInput.methodSelector.adaptiveDescription',
  ebitda_multiple: 'manualInput.methodSelector.ebitdaMultipleDescription',
  omzet_multiple: 'manualInput.methodSelector.revenueMultipleDescription',
  revenue_multiple: 'manualInput.methodSelector.revenueMultipleDescription',
  arr_multiple: 'manualInput.methodSelector.arrMultipleDescription',
  dcf: 'manualInput.methodSelector.dcfDescription',
  sde_multiple: 'manualInput.methodSelector.sdeMultipleDescription',
  adjusted_nav: 'manualInput.methodSelector.adjustedNavDescription',
  fiscal_4x: 'manualInput.methodSelector.fiscal4xDescription',
  startup_valuation: 'manualInput.methodSelector.startupValuationDescription',
  liquidation_analysis: 'manualInput.methodSelector.liquidationAnalysisDescription',
}
