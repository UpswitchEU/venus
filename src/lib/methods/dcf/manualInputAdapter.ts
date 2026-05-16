import type { DcfProjectionPreviewRow } from '@/components/calculator/sections/dcfProjectionPreview'
import type { DcfSmartDefaults } from '@/components/calculator/sections/dcfSmartDefaults'
import { buildManualDcfDefaultsPatch } from '@/components/calculator/utils/manualDcfDefaultSeeding'
import {
  deriveManualDcfDefaultsProvenance,
  deriveManualDcfIntegrationCapexPct,
  deriveManualDcfIntegrationDaPct,
  getLatestManualDcfHistoricalMetrics,
  getManualDcfForecastRows,
  type ManualDcfDefaultsProvenance,
  type ManualDcfImportBatchData,
} from '@/components/calculator/utils/manualDcfForecastDerivations'
import {
  type ManualDcfInputMode,
  switchManualDcfInputMode,
} from '@/components/calculator/utils/manualDcfForecastTransforms'
import { deriveManualDcfProjectionAutofillState } from '@/components/calculator/utils/manualDcfProjectionPreview'

import type { ManualInputMethodAdapter } from '../manualInputAdapterTypes'
import { DCF_METHOD_KEY } from './spec'

export type { ManualDcfImportBatchData, ManualDcfInputMode }

/**
 * DCF's manual-input adapter keeps method-specific valuation rules behind the
 * method module instead of scattering them through the panel controller.
 */
export const dcfManualInputAdapter: ManualInputMethodAdapter<
  DcfSmartDefaults | null,
  ManualDcfImportBatchData | null,
  ManualDcfInputMode,
  DcfProjectionPreviewRow,
  ManualDcfDefaultsProvenance
> = {
  key: DCF_METHOD_KEY,
  buildDefaultsPatch: buildManualDcfDefaultsPatch,
  deriveDefaultsProvenance: ({
    smartDefaults,
    integrationDerivedCapexPct,
    integrationDerivedDaPct,
  }) =>
    deriveManualDcfDefaultsProvenance({
      dcfSmartDefaultsFromHistory: smartDefaults,
      integrationDerivedCapexPct,
      integrationDerivedDaPct,
    }),
  deriveForecastRows: getManualDcfForecastRows,
  deriveIntegrationCapexPct: deriveManualDcfIntegrationCapexPct,
  deriveIntegrationDaPct: deriveManualDcfIntegrationDaPct,
  deriveLatestHistoricalMetrics: getLatestManualDcfHistoricalMetrics,
  deriveProjectionAutofillState: ({ formData, hasMethodSelected, forecastRows, smartDefaults }) => {
    const state = deriveManualDcfProjectionAutofillState({
      formData,
      hasDcfSelected: hasMethodSelected,
      dcfForecastRows: forecastRows,
      dcfSmartDefaultsFromHistory: smartDefaults,
    })
    return {
      canApply: state.canApplyDcfProjectionAutofill,
      rows: state.dcfProjectionAutofillRows,
    }
  },
  switchInputMode: switchManualDcfInputMode,
}
