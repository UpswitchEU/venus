'use client'

import { type Dispatch, type SetStateAction, useCallback, useEffect, useMemo } from 'react'
import { getRequiredManualInputMethodAdapter } from '../../../lib/methods'
import { type ManualDcfImportBatchData, type ManualDcfInputMode } from '../../../lib/methods/dcf'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { deriveDcfSmartDefaults, deriveWaccSectorBand } from '../sections/dcfSmartDefaults'
import { useManualDcfProjectionAutofillAction } from './useManualDcfProjectionAutofillAction'
import { useManualDcfProjectionModelSync } from './useManualDcfProjectionModelSync'
import { useManualDcfSuggestedCapexHydration } from './useManualDcfSuggestedCapexHydration'
import { useManualDcfTerminalValueMethod } from './useManualDcfTerminalValueMethod'

type ManualDcfTranslator = (key: string, values?: Record<string, string | number>) => string

const dcfManualInputAdapter = getRequiredManualInputMethodAdapter('dcf')

interface UseManualDcfForecastControllerParams {
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  hasDcfSelected: boolean
  importBatchData: ManualDcfImportBatchData | null
  selectedBusinessCategory?: unknown
  sortedYearlyFinancials: YearlyFinancials[]
  translate: ManualDcfTranslator
}

export function useManualDcfForecastController({
  formData,
  setFormData,
  hasDcfSelected,
  importBatchData,
  selectedBusinessCategory,
  sortedYearlyFinancials,
  translate,
}: UseManualDcfForecastControllerParams) {
  const dcfForecastRows = useMemo(
    () => dcfManualInputAdapter.deriveForecastRows(hasDcfSelected, sortedYearlyFinancials),
    [hasDcfSelected, sortedYearlyFinancials]
  )

  const { latestHistoricalRevenue, latestHistoricalEbitda } = useMemo(
    () => dcfManualInputAdapter.deriveLatestHistoricalMetrics(sortedYearlyFinancials),
    [sortedYearlyFinancials]
  )

  const dcfSmartDefaultsFromHistory = useMemo(
    () =>
      deriveDcfSmartDefaults({
        yearlyFinancials: formData.yearlyFinancials,
        businessCategory: selectedBusinessCategory ?? formData.industry ?? formData.businessType,
      }),
    [formData.yearlyFinancials, selectedBusinessCategory, formData.industry, formData.businessType]
  )

  const integrationDerivedCapexPct = useMemo(
    () =>
      dcfManualInputAdapter.deriveIntegrationCapexPct({
        businessContext: formData.business_context,
        importBatchData,
        latestHistoricalRevenue,
      }),
    [importBatchData, formData.business_context, latestHistoricalRevenue]
  )

  const integrationDerivedDaPct = useMemo(
    () =>
      dcfManualInputAdapter.deriveIntegrationDaPct({
        businessContext: formData.business_context,
        importBatchData,
        latestHistoricalRevenue,
      }),
    [importBatchData, formData.business_context, latestHistoricalRevenue]
  )

  const waccSectorBand = useMemo(
    () =>
      deriveWaccSectorBand(selectedBusinessCategory ?? formData.industry ?? formData.businessType),
    [selectedBusinessCategory, formData.industry, formData.businessType]
  )

  const dcfDefaultsProvenance = useMemo(
    () =>
      dcfManualInputAdapter.deriveDefaultsProvenance({
        smartDefaults: dcfSmartDefaultsFromHistory,
        integrationDerivedCapexPct,
        integrationDerivedDaPct,
      }),
    [dcfSmartDefaultsFromHistory, integrationDerivedCapexPct, integrationDerivedDaPct]
  )

  const hasDcfForecastWorkspace = hasDcfSelected && dcfForecastRows.length > 0

  const dcfModeSegmentOptions = useMemo(
    () => [
      { value: 'ebitda' as const, label: translate('dcfInputMode.ebitdaShort') },
      { value: 'fcff_only' as const, label: translate('dcfInputMode.fcffOnlyShort') },
    ],
    [translate]
  )

  const { handleTerminalValueMethodChange, markPerpetualGrowthWhenFcffOnly, terminalValueMethod } =
    useManualDcfTerminalValueMethod({ formData, setFormData })

  const { canApply: canApplyDcfProjectionAutofill, rows: dcfProjectionAutofillRows } = useMemo(
    () =>
      dcfManualInputAdapter.deriveProjectionAutofillState({
        formData,
        hasMethodSelected: hasDcfSelected,
        forecastRows: dcfForecastRows,
        smartDefaults: dcfSmartDefaultsFromHistory,
      }),
    [dcfForecastRows, dcfSmartDefaultsFromHistory, formData, hasDcfSelected]
  )

  const handleDcfInputModeChange = useCallback(
    (mode: ManualDcfInputMode) => {
      if (mode === 'fcff_only') {
        markPerpetualGrowthWhenFcffOnly()
      }
      setFormData((prev) => dcfManualInputAdapter.switchInputMode(prev, mode))
    },
    [markPerpetualGrowthWhenFcffOnly, setFormData]
  )

  const handleApplyDcfProjectionAutofill = useManualDcfProjectionAutofillAction({
    canApplyDcfProjectionAutofill,
    dcfForecastRowCount: dcfForecastRows.length,
    setFormData,
    translate,
  })

  // biome-ignore lint/correctness/useExhaustiveDependencies: dcf_input_mode intentionally retriggers the updater when leaving FCFF-only mode.
  useEffect(() => {
    if (!hasDcfSelected) return

    setFormData((prev) => {
      const patch = dcfManualInputAdapter.buildDefaultsPatch({
        formData: prev,
        hasForecastRows: dcfForecastRows.length > 0,
        latestHistoricalRevenue,
        latestHistoricalEbitda,
        smartDefaults: dcfSmartDefaultsFromHistory,
        integrationDerivedCapexPct,
        integrationDerivedDaPct,
      })

      if (Object.keys(patch).length === 0) return prev
      return { ...prev, ...patch }
    })
  }, [
    hasDcfSelected,
    formData.dcf_input_mode,
    dcfForecastRows.length,
    latestHistoricalRevenue,
    latestHistoricalEbitda,
    dcfSmartDefaultsFromHistory,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
    setFormData,
  ])

  useManualDcfProjectionModelSync({
    formData,
    setFormData,
    hasDcfSelected,
    dcfForecastRows,
  })

  useManualDcfSuggestedCapexHydration({
    formData,
    setFormData,
    hasDcfSelected,
    importBatchData,
    dcfForecastRows,
  })

  return {
    canApplyDcfProjectionAutofill,
    dcfDefaultsProvenance,
    dcfForecastRows,
    dcfModeSegmentOptions,
    dcfProjectionAutofillRows,
    dcfSmartDefaultsFromHistory,
    handleApplyDcfProjectionAutofill,
    handleDcfInputModeChange,
    handleTerminalValueMethodChange,
    hasDcfForecastWorkspace,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
    latestHistoricalEbitda,
    latestHistoricalRevenue,
    terminalValueMethod,
    waccSectorBand,
  }
}
