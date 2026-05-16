import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import type { MethodKey } from './types'

export interface ManualInputMethodAdapterBase {
  key: MethodKey
}

export interface ManualInputHistoricalMetrics {
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
}

export interface ManualInputProjectionAutofillState<TProjectionRow> {
  canApply: boolean
  rows: TProjectionRow[]
}

export interface ManualInputDefaultsPatchArgs<TSmartDefaults> {
  formData: ManualValuationFormData
  hasForecastRows: boolean
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
  smartDefaults: TSmartDefaults
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
}

export interface ManualInputDefaultsProvenanceArgs<TSmartDefaults> {
  smartDefaults: TSmartDefaults
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
}

export interface ManualInputIntegrationPercentArgs<TImportBatchData> {
  businessContext: ManualValuationFormData['business_context']
  importBatchData: TImportBatchData
  latestHistoricalRevenue?: number
}

export interface ManualInputProjectionAutofillArgs<TSmartDefaults> {
  formData: ManualValuationFormData
  hasMethodSelected: boolean
  forecastRows: YearlyFinancials[]
  smartDefaults: TSmartDefaults
}

export interface ForecastManualInputMethodAdapter<
  TSmartDefaults,
  TImportBatchData,
  TInputMode extends string,
  TProjectionRow,
  TDefaultsProvenance extends string,
> extends ManualInputMethodAdapterBase {
  buildDefaultsPatch(
    args: ManualInputDefaultsPatchArgs<TSmartDefaults>
  ): Partial<ManualValuationFormData>
  deriveDefaultsProvenance(
    args: ManualInputDefaultsProvenanceArgs<TSmartDefaults>
  ): TDefaultsProvenance
  deriveForecastRows(
    hasMethodSelected: boolean,
    sortedYearlyFinancials: YearlyFinancials[]
  ): YearlyFinancials[]
  deriveIntegrationCapexPct(
    args: ManualInputIntegrationPercentArgs<TImportBatchData>
  ): number | null
  deriveIntegrationDaPct(args: ManualInputIntegrationPercentArgs<TImportBatchData>): number | null
  deriveLatestHistoricalMetrics(
    sortedYearlyFinancials: YearlyFinancials[]
  ): ManualInputHistoricalMetrics
  deriveProjectionAutofillState(
    args: ManualInputProjectionAutofillArgs<TSmartDefaults>
  ): ManualInputProjectionAutofillState<TProjectionRow>
  switchInputMode(formData: ManualValuationFormData, mode: TInputMode): ManualValuationFormData
}

export interface OwnerCompensationManualInputMethodAdapter extends ManualInputMethodAdapterBase {
  deriveOwnerCompensationSectionActive(activeMethods: readonly MethodKey[]): boolean
}

export type ManualInputMethodAdapter =
  | ForecastManualInputMethodAdapter<unknown, unknown, string, unknown, string>
  | OwnerCompensationManualInputMethodAdapter
