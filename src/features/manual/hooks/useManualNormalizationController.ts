import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import type {
  ChatMessage,
  NormalizationItem,
  RightPanelView,
  SuggestedNormalisation,
  ValuationReportData,
} from '../../../components/calculator'
import type { PlanFeatureFlags } from '../../../hooks/useCredits'
import type { SynthesisWeightSelection } from '../../../lib/synthesis/synthesisWeights'
import type { ValuationFormData, ValuationResponse } from '../../../types/valuation'
import type { CollectedData } from '../components/manualLayoutDataTypes'
import type {
  ManualGuidedNormalizationPrefill,
  ManualGuidedNormalizationUrl,
} from '../utils/manualGuidedNormalization'
import type { ManualCalculationIdentifiers } from '../utils/manualValuationRequest'
import { useManualNormalizationImportActions } from './useManualNormalizationImportActions'
import { useManualNormalizationModalController } from './useManualNormalizationModalController'
import { useManualNormalizationRecalculation } from './useManualNormalizationRecalculation'
import { useManualNormalizationReviewActions } from './useManualNormalizationReviewActions'
import type { ManualNormalizationActions } from './useManualNormalizationState'
import { useManualVersionRestoreAction } from './useManualVersionRestoreAction'

type ManualToastTranslator = (
  key: string,
  values?: Record<string, string | number | Date>
) => string
type ManualPreparerTranslator = (key: string) => string

interface UseManualNormalizationControllerParams {
  calculationRequestIdentifiers: ManualCalculationIdentifiers
  collectedData: CollectedData
  currentLocale: string
  financialYears: number[]
  formStoreData: ValuationFormData
  guidedResolutionUrl?: ManualGuidedNormalizationUrl | null
  latestFormDataRef: MutableRefObject<Partial<CollectedData>>
  normalizationActions: ManualNormalizationActions
  openStarterPaywall: (reason: 'normalization') => void
  originalEBITDAByYear: Record<number, number>
  planFeatures: Pick<PlanFeatureFlags, 'ebitda_normalization'> | null
  preSelectedMethod?: string | null
  report: ValuationReportData | null
  reportId: string
  resolvedReportId?: string | null
  resultMultiplesValuation?: ValuationResponse['multiples_valuation']
  selectedMethod?: string | null
  sessionName?: string | null
  durableSaveInFlightRef: MutableRefObject<boolean>
  setChatDrawerOpen: Dispatch<SetStateAction<boolean>>
  setChatMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setDraftStatus: (status: 'draft' | 'saved' | 'saving') => void
  setLastSaved: (date: Date | undefined) => void
  setResult: (result: ValuationResponse | null) => void
  setRightPanelView: Dispatch<SetStateAction<RightPanelView>>
  setSuggestedNormalisations: Dispatch<SetStateAction<SuggestedNormalisation[]>>
  synthesisSelection: SynthesisWeightSelection
  translate: ManualToastTranslator
  translatePreparer: ManualPreparerTranslator
  updateFormData: (patch: Partial<ValuationFormData>) => void
}

export interface UseManualNormalizationControllerResult {
  guidedNormalizationPrefill: ManualGuidedNormalizationPrefill | null
  handleAcceptNormalisation: (id: string) => Promise<void>
  handleCSVImportComplete: ReturnType<
    typeof useManualNormalizationImportActions<CollectedData>
  >['handleCSVImportComplete']
  handleNormalizationsChange: (normalizations: NormalizationItem[]) => Promise<void>
  handleRejectNormalisation: (id: string) => Promise<void>
  handleShowNormalisationReview: () => void
  handleUnifiedNormalizationModalOpenChange: (open: boolean) => void
  handleVersionRestore: (version: unknown) => Promise<void>
  openUnifiedNormalizationModal: ReturnType<
    typeof useManualNormalizationModalController
  >['openUnifiedNormalizationModal']
  showUnifiedNormalizationModal: boolean
}

export function useManualNormalizationController({
  calculationRequestIdentifiers,
  collectedData,
  currentLocale,
  financialYears,
  formStoreData,
  guidedResolutionUrl,
  latestFormDataRef,
  normalizationActions,
  openStarterPaywall,
  originalEBITDAByYear,
  planFeatures,
  preSelectedMethod,
  report,
  reportId,
  resolvedReportId,
  resultMultiplesValuation,
  selectedMethod,
  sessionName,
  durableSaveInFlightRef,
  setChatDrawerOpen,
  setChatMessages,
  setDraftStatus,
  setLastSaved,
  setResult,
  setRightPanelView,
  setSuggestedNormalisations,
  synthesisSelection,
  translate,
  translatePreparer,
  updateFormData,
}: UseManualNormalizationControllerParams): UseManualNormalizationControllerResult {
  const openNormalizationPaywall = () => openStarterPaywall('normalization')
  const {
    showUnifiedNormalizationModal,
    guidedNormalizationPrefill,
    openUnifiedNormalizationModal,
    handleUnifiedNormalizationModalOpenChange,
    handleShowNormalisationReview,
  } = useManualNormalizationModalController({
    guidedResolutionUrl,
    planFeatures,
    openNormalizationPaywall,
    setChatDrawerOpen,
  })

  const { handleNormalizationsChange, recalculateWithNormalizations } =
    useManualNormalizationRecalculation({
      calculationRequestIdentifiers,
      collectedData,
      currentLocale,
      financialYears,
      formStoreData,
      latestFormDataRef,
      originalEBITDAByYear,
      preSelectedMethod,
      report,
      reportId,
      resolvedReportId,
      resultMultiplesValuation,
      selectedMethod,
      sessionName,
      durableSaveInFlightRef,
      setDraftStatus,
      setLastSaved,
      setResult,
      synthesisSelection,
      translate,
      translatePreparer,
    })

  const { handleAcceptNormalisation, handleRejectNormalisation } =
    useManualNormalizationReviewActions({
      reportId,
      resolvedReportId,
      normalizationActions,
      setSuggestedNormalisations,
      financialYears,
      originalEBITDAByYear,
      recalculateWithNormalizations,
      persistFailedTitle: translate('persistFailed'),
      persistFailedDescription: translate('persistFailedDesc'),
    })

  const { handleVersionRestore } = useManualVersionRestoreAction({
    normalizationActions,
    reportId,
    resolvedReportId,
    setResult,
    setRightPanelView,
    translate,
    updateFormData,
  })

  const { handleCSVImportComplete } = useManualNormalizationImportActions({
    collectedData,
    normalizationActions,
    openUnifiedNormalizationModal,
    reportId,
    resolvedReportId,
    setChatDrawerOpen,
    setChatMessages,
    setSuggestedNormalisations,
    translate,
  })

  return {
    guidedNormalizationPrefill,
    handleAcceptNormalisation,
    handleCSVImportComplete,
    handleNormalizationsChange,
    handleRejectNormalisation,
    handleShowNormalisationReview,
    handleUnifiedNormalizationModalOpenChange,
    handleVersionRestore,
    openUnifiedNormalizationModal,
    showUnifiedNormalizationModal,
  }
}
