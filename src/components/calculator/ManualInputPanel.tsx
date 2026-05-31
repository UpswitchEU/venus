'use client'

/**
 * Manual Input Panel
 *
 * Clean, minimal form for bedrijfsschatting data entry.
 * World-class design: progressive disclosure, single primary CTA.
 *
 * KEY FEATURE: Multi-year EBITDA Normalization
 * - Normalizations apply to historical years (3-5 years)
 * - Calculate normalized average EBITDA for valuation
 * - Each year can have its own set of adjustments
 */

import { useLocale, useTranslations } from 'next-intl'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ParsedCSVData } from '@/components/integrations/CSVUploadCard'
import {
  isAccountantFreeOrStarterTier,
  isAccountantTierRole,
} from '@/constants/accountantPlanMethods'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { getValuationMethodResultForKey } from '@/utils/extractValuationResultsMap'

import {
  type GetBonusSectionsSaasSignals,
  getBonusSectionsSaasSignalsFromFormData,
  getSynthesisMethodKeysForUi,
  resolveBusinessTypeIdForBonusSections,
} from '../../constants/methodFieldConfig'
// Round-4 audit: `METHOD_LABEL_KEYS` was imported here to localise the
// BelgianSmeAuditPanel title. Panel moved to the report; import dropped.
import { useAuth } from '../../hooks/useAuth'
import { useCanSave } from '../../hooks/useCanSave'
import { useSyncOfficialVarianceFromForm } from '../../hooks/useSyncOfficialVarianceFromForm'
import { selectionRequiresForecastYears } from '../../lib/methods'
import { useDcfForecastSync } from '../../lib/methods/dcf'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useManualResultsStore } from '../../store/manual/useManualResultsStore'
import { useNormalizationStore } from '../../store/useNormalizationStore'
import { useTaxLatencyStore } from '../../store/useTaxLatencyStore'
import type {
  ManualValuationFormData,
  ValuationMethodResult,
  YearlyFinancials,
} from '../../types/valuation'
import { getCurrentFilingYear } from '../../utils/fiscalYear'
import { getFinancialTerm } from '../../utils/locale/financial-terms'
import { realEstateCarveOutAppliesTo } from '../../utils/realEstateCarveOutDisplay'
import {} from '../../utils/shareholding'
import { isYearRowForecast } from '../../utils/yearData'
import {
  getLatestCompleteYearlyFinancial,
  hasExplicitNumericValue as hasExplicitFinancialValue,
} from '../../utils/yearlyFinancials'
import type { FieldHelpContext } from './FieldHelpTrigger'
import { useApplyAdvisorValuationDefaults } from './hooks/useApplyAdvisorValuationDefaults'
import { useManualAccountingImportController } from './hooks/useManualAccountingImportController'
import { useManualCompanyIdentificationController } from './hooks/useManualCompanyIdentificationController'
import { useManualDcfForecastController } from './hooks/useManualDcfForecastController'
import { useManualFinancialRowsController } from './hooks/useManualFinancialRowsController'
import { useManualInputFormDataSync } from './hooks/useManualInputFormDataSync'
import { useManualInputPrefillSync } from './hooks/useManualInputPrefillSync'
import { ManualInputPanelModals } from './ManualInputPanelModals'
import { ManualInputSubmitBar } from './ManualInputSubmitBar'
import { CompanyIdentificationSection } from './sections/CompanyIdentificationSection'
import { FinancialHistorySection } from './sections/FinancialHistorySection'
import { ManualInputMethodSections } from './sections/ManualInputMethodSections'
import { OwnershipStructureSection } from './sections/OwnershipStructureSection'
import {
  applyManualCurrentYearBalance,
  applyManualFinancialYearSelection,
  type ManualCurrentYearBalance,
} from './utils/manualFinancialRowMutations'
import {
  getSeedBaseFilingYear,
  getSeedYearlyFinancials,
  isSessionSeedYearStale,
} from './utils/manualFinancialSeeds'
import {
  buildManualInputAdaptiveHeaderSteps,
  getManualInputBalanceSheetCarveOutStep,
  getManualInputSynthesisStep,
} from './utils/manualInputAdaptiveSteps'
import { buildManualInputFieldValidation } from './utils/manualInputFieldValidation'
import { buildManualInputInitialFormData } from './utils/manualInputInitialFormData'
import { buildManualInputNormalizedData } from './utils/manualInputNormalizedData'
import { buildManualInputSubmitPayload } from './utils/manualInputSubmitPayload'

// Types — `ManualValuationFormData` = `Partial<` canonical `ValuationFormData` + `ManualValuationFormUiBase` (`src/types/valuation.ts`)
export type { ManualValuationFormData, YearlyFinancials }
/** Back-compat name used throughout this file and `calculator` exports. */
export type ValuationFormData = ManualValuationFormData
export type ManualInputAssistantPatch =
  | {
      id: string
      type: 'select_financial_years'
      years: number[]
    }
  | {
      id: string
      type: 'set_current_year_balance'
      balance: ManualCurrentYearBalance
    }
export { venusLiveBatchImportProvider } from './hooks/useManualAccountingImportController'
export {
  getSeedBaseFilingYear,
  getSeedYearlyFinancials,
  isSessionSeedYearStale,
  shouldAutoConfirmPrefilledFilingYear,
} from './utils/manualFinancialSeeds'

export function getSelectedBelgianAuditEntries({
  valuationResults,
  effectiveMethod,
  effectiveMethods,
}: {
  valuationResults?: Record<string, ValuationMethodResult> | null
  effectiveMethod: string
  effectiveMethods: string[]
}): Array<[string, ValuationMethodResult]> {
  if (!valuationResults) return []
  const methods = (effectiveMethods.length > 0 ? effectiveMethods : [effectiveMethod]).filter(
    Boolean
  )
  const seen = new WeakSet<ValuationMethodResult>()
  const out: Array<[string, ValuationMethodResult]> = []
  for (const key of methods) {
    const row = getValuationMethodResultForKey(valuationResults, key)
    if (!row?.details) continue
    if (seen.has(row)) continue
    seen.add(row)
    out.push([key, row])
  }
  return out
}

interface ManualInputPanelProps {
  onSubmit: (data: ValuationFormData) => void
  onCSVImportComplete?: (
    source: 'yuki' | 'exact' | 'odoo' | 'octopus' | 'expertm' | 'silverfin' | 'accountable',
    fileName?: string
  ) => void
  isCalculating?: boolean
  initialData?: Partial<ValuationFormData>
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  onViewAllNormalizations?: () => void
  /** Called when form data changes (debounced 300ms). Enables AI assistant to access financials before submit. */
  onFormDataChange?: (data: Record<string, unknown>) => void
  /** Optional ref to sync form financials synchronously during render. Used by sibling modals that need latest data without effect delay. */
  formDataRef?: React.MutableRefObject<Record<string, unknown> | null>
  /** One-shot assistant-approved mutation that must land in the same state as the manual controls. */
  assistantPatch?: ManualInputAssistantPatch | null
  /** STP: When true, KBO fields are pre-filled from backend enrichment and shown as read-only */
  readOnlyKbo?: boolean
  /** STP: When true, auto-advance past steps that are fully pre-filled */
  autoAdvancePastPrefilledSteps?: boolean
  /** Synthesis: current weight per method key. */
  synthesisWeights?: Record<string, number>
  /** Synthesis: advisor justification text. */
  synthesisJustification?: string
  /** Synthesis: callback when weights change. */
  onSynthesisWeightsChange?: (weights: Record<string, number>) => void
  /** Synthesis: callback when justification changes. */
  onSynthesisJustificationChange?: (justification: string) => void
  /** Synthesis: whether the feature is unlocked (Starter+). */
  synthesisUnlocked?: boolean
  /** Synthesis: valuation results keyed by method. */
  synthesisValuationResults?: Record<string, ValuationMethodResult> | null
  /** Synthesis: open Starter paywall when locked. */
  onSynthesisPaywall?: () => void
}

export function ManualInputPanel({
  onSubmit,
  onCSVImportComplete,
  isCalculating = false,
  initialData = {},
  onFieldHelpRequest,
  onViewAllNormalizations,
  onFormDataChange,
  formDataRef,
  assistantPatch,
  readOnlyKbo = false,
  autoAdvancePastPrefilledSteps = false,
  synthesisWeights = {},
  synthesisJustification = '',
  onSynthesisWeightsChange,
  onSynthesisJustificationChange,
  synthesisUnlocked = false,
  synthesisValuationResults,
  onSynthesisPaywall,
}: ManualInputPanelProps) {
  const { user } = useAuth()
  const t = useTranslations()
  const mi = useTranslations('manualInput')
  const tKbo = useTranslations('forms.kboLookup')
  const locale = useLocale()
  const { currency: panelCurrencyFormatter } = useManualPreviewFormatters()
  const taxLatencyCount = useTaxLatencyStore((s) => s.items.length)
  const normalizationItems = useNormalizationStore((s) => s.items)
  const hasExplicitNumericValue = useCallback(
    (value: unknown) => hasExplicitFinancialValue(value),
    []
  )
  const acceptedNormCount = normalizationItems.filter((n) => n.status === 'accepted').length

  const formatCurrency = useCallback(
    (amount: number) => panelCurrencyFormatter.format(Number.isFinite(amount) ? amount : 0),
    [panelCurrencyFormatter]
  )
  const [formData, setFormData] = useState<ValuationFormData>(() =>
    buildManualInputInitialFormData(initialData)
  )
  const appliedAssistantPatchIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!assistantPatch || appliedAssistantPatchIdRef.current === assistantPatch.id) return
    appliedAssistantPatchIdRef.current = assistantPatch.id

    if (assistantPatch.type === 'select_financial_years') {
      setFormData((prev) => applyManualFinancialYearSelection(prev, assistantPatch.years).next)
    }

    if (assistantPatch.type === 'set_current_year_balance') {
      setFormData((prev) => applyManualCurrentYearBalance(prev, assistantPatch.balance))
    }
  }, [assistantPatch])
  const { appliedFields: advisorDefaultsAppliedFields } = useApplyAdvisorValuationDefaults({
    enabled: isAccountantTierRole(user?.role),
    formData,
    setFormData,
  })
  const currentFilingYear = getCurrentFilingYear()
  const accountingImportMessages = useMemo(
    () => ({
      importUnavailable: mi('importFromAccountingUnavailable'),
      importFailedTitle: mi('importFromAccountingError') || 'Import failed',
      bizzcontrolForecastImportedDescription: mi('bizzcontrol.forecastImportedDescription'),
      octopusForecastImportedDescription: mi('octopus.forecastImportedDescription'),
      batchSuccessDescription: (score: number) =>
        mi('silverfin.importBatchSuccessDescription', { score }),
      batchSuccessTitle: ({ years, provider }: { years: number; provider: string }) =>
        mi('silverfin.importBatchSuccessTitle', { years, provider }),
    }),
    [mi]
  )
  const {
    bizzcontrolImport,
    handleOpenLiveAccountingImport,
    importAccountingError,
    importBatchData,
    liveImportProviderName,
    octopusImport,
    openingLiveAccountingImport,
  } = useManualAccountingImportController({
    currentFilingYear,
    messages: accountingImportMessages,
    setFormData,
  })
  const activityCodeTerm = getFinancialTerm(
    'activityCode',
    formData.country,
    locale === 'en' ? 'en' : 'nl'
  )
  const activityCodeShort = activityCodeTerm.replace(/-code$/i, '').trim()
  const localizeActivityCodeCopy = useCallback(
    (copy: string) =>
      copy
        .replace(/NACE-code/g, activityCodeTerm)
        .replace(/NACE code/g, activityCodeTerm)
        .replace(/NACE/g, activityCodeShort)
        .replace(/KBO-nummer/g, getFinancialTerm('registrationNumber', formData.country))
        .replace(/KBO number/g, getFinancialTerm('registrationNumber', formData.country, 'en')),
    [activityCodeShort, activityCodeTerm, formData.country]
  )

  const latestCompleteYearlyFinancial = useMemo(
    () => getLatestCompleteYearlyFinancial(formData.yearlyFinancials ?? []),
    [formData.yearlyFinancials]
  )

  const updateFormData = useManualFormStore((s) => s.updateFormData)
  const storeBusinessTypeId = useManualFormStore((s) => s.formData.business_type_id)
  const storeBusinessModel = useManualFormStore((s) => s.formData.business_model)
  const storeBusinessContext = useManualFormStore((s) => s.formData.business_context)
  useSyncOfficialVarianceFromForm()

  const {
    companySearchValue,
    countryUserOverrideRef,
    executePrefillCompanyReset,
    financialsStepRef,
    prefillCompanyRef,
    selectedCompany,
    setCompanySearchValue,
    setSelectedCompany,
    setShowChangeCompanyWarning,
    showChangeCompanyWarning,
  } = useManualInputPrefillSync({
    autoAdvancePastPrefilledSteps,
    currentFilingYear,
    formData,
    initialData,
    setFormData,
    updateFormData,
  })

  useManualInputFormDataSync({
    formData,
    formDataRef,
    latestCompleteYearlyFinancial,
    onFormDataChange,
    storeBusinessModel,
  })

  const [showCSVUpload, setShowCSVUpload] = useState(false)
  const {
    commitRemoveHistoricalYear,
    confirmRemoveForecastYears,
    handleSelectFilingYear,
    historicalYearPendingRemove,
    partialYears,
    requestRemoveHistoricalYear,
    setHistoricalYearPendingRemove,
    setShowForecastRemovalConfirm,
    showForecastRemovalConfirm,
    updateYearlyFinancials,
  } = useManualFinancialRowsController({
    formData,
    normalizationItems,
    setFormData,
  })

  const normalizedData = useMemo(
    () =>
      buildManualInputNormalizedData({
        estimatedMarketRent: formData.estimated_market_rent,
        excludeRealEstate: formData.exclude_real_estate,
        normalizationItems,
        yearlyFinancials: formData.yearlyFinancials,
      }),
    [
      formData.estimated_market_rent,
      formData.exclude_real_estate,
      formData.yearlyFinancials,
      normalizationItems,
    ]
  )

  const {
    businessTypesError,
    businessTypesForSearch,
    businessTypesLoading,
    executeClearCompany,
    handleBusinessTypeSelect,
    handleClearCompany,
    handleCompanySelect,
    kboSearchFn,
    nacePrefillError,
    refetchBusinessTypes,
    retryNacePrefill,
    searchCountry,
    selectedBusinessType,
  } = useManualCompanyIdentificationController({
    executePrefillCompanyReset,
    formData,
    initialCountry: initialData.country,
    localizeActivityCodeCopy,
    prefillCompanyRef,
    searchUnavailableMessage: tKbo('searchUnavailable'),
    selectedCompany,
    setCompanySearchValue,
    setFormData,
    setSelectedCompany,
    setShowChangeCompanyWarning,
    translate: t,
    updateFormData,
  })

  const updateField = <K extends keyof ValuationFormData>(
    field: K,
    value: ValuationFormData[K]
  ) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  // DCF auto-injection: add forecast years when DCF is selected, prompt removal on switch-away.
  // Also handles initial mount (e.g. page reload with DCF pre-selected).
  const effectiveMethod = useManualResultsStore((s) => s.preSelectedMethod ?? s.selectedMethod)
  const effectiveMethods = useManualResultsStore((s) => s.preSelectedMethods)
  /** Combinable methods for synthesis weging — derived from store (nav/Titan). */
  const synthesisMethodsForPanel = useMemo(
    () => getSynthesisMethodKeysForUi(effectiveMethods),
    [effectiveMethods]
  )
  const hasDcfSelected = selectionRequiresForecastYears(effectiveMethods)
  /**
   * Whether the real-estate carve-out toggle should be rendered.
   *
   * The carve-out is a going-concern equity-bridge concern — only meaningful
   * for methods that consume EBITDA or run the EV→Equity bridge (DCF,
   * EBITDA-multiple, SDE-multiple, Adaptive). For revenue-multiple / ARR /
   * Adjusted NAV (has own RE section) / fiscal_4x / startup / liquidation
   * the toggle is either a no-op or conceptually wrong — hide it so the
   * advisor doesn't fill in numbers that won't move the report.
   *
   * If the user already turned the toggle ON in a previous method set and
   * then narrowed selection to a non-applicable method, we still surface
   * the panel so they can see (and clear) the stored values rather than
   * having silent state hidden by the UI.
   */
  const hasCarveOutData =
    formData.real_estate_treatment === 'carve_out' ||
    formData.real_estate_treatment === 'included' ||
    Boolean(formData.exclude_real_estate) ||
    formData.real_estate_market_value != null ||
    formData.real_estate_book_value != null ||
    formData.estimated_market_rent != null
  const showRealEstateCarveOut = realEstateCarveOutAppliesTo(effectiveMethods) || hasCarveOutData
  const setSelectedMethod = useManualResultsStore((s) => s.setSelectedMethod)
  // Synthesis weighting rendered as the final step in the left panel (props from ManualLayout)
  const { markPrevMethod: markDcfForecastSyncPrevMethod } = useDcfForecastSync({
    effectiveMethod,
    hasDcfSelected,
    setFormData,
    setShowForecastRemovalConfirm,
    translate: mi,
  })

  const fieldValidation = useMemo(
    () => buildManualInputFieldValidation(formData, mi),
    [formData, mi]
  )

  const sortedYearlyFinancials = useMemo(
    () => [...formData.yearlyFinancials].sort((a, b) => Number(b.year) - Number(a.year)),
    [formData.yearlyFinancials]
  )
  const historicalCardRows = useMemo(
    () =>
      hasDcfSelected
        ? sortedYearlyFinancials.filter((year) => !isYearRowForecast(year))
        : sortedYearlyFinancials,
    [hasDcfSelected, sortedYearlyFinancials]
  )
  const baseFilingYearForLabels = useMemo(() => getSeedBaseFilingYear(formData), [formData])
  const selectedBusinessCategoryForMethodInputs = useMemo(() => {
    return selectedBusinessType?.category ?? null
  }, [selectedBusinessType?.category])

  const {
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
  } = useManualDcfForecastController({
    formData,
    setFormData,
    hasDcfSelected,
    importBatchData,
    selectedBusinessCategory: selectedBusinessCategoryForMethodInputs,
    sortedYearlyFinancials,
    translate: mi,
  })

  const saasSignalsForBonusSections: GetBonusSectionsSaasSignals = useMemo(() => {
    const business_model =
      formData.business_model ??
      (typeof storeBusinessModel === 'string' ? storeBusinessModel : undefined)
    const business_context =
      formData.business_context ??
      (storeBusinessContext && typeof storeBusinessContext === 'object'
        ? (storeBusinessContext as Record<string, unknown>)
        : undefined)
    return getBonusSectionsSaasSignalsFromFormData({ business_model, business_context })
  }, [formData.business_model, formData.business_context, storeBusinessModel, storeBusinessContext])

  /** Prefer picker object; fall back to session `businessType` id before sync completes. */
  const resolvedBusinessCategoryForBonusSections = useMemo(
    () => selectedBusinessCategoryForMethodInputs,
    [selectedBusinessCategoryForMethodInputs]
  )
  const resolvedBusinessTypeIdForBonusSections = useMemo(
    () =>
      resolveBusinessTypeIdForBonusSections(
        selectedBusinessType?.id,
        formData.businessType,
        storeBusinessTypeId
      ),
    [selectedBusinessType?.id, formData.businessType, storeBusinessTypeId]
  )

  const adaptiveHeaderSteps = useMemo(() => {
    return buildManualInputAdaptiveHeaderSteps({
      effectiveMethod,
      effectiveMethods,
      hasDcfForecastWorkspace,
      resolvedBusinessCategory: resolvedBusinessCategoryForBonusSections,
      resolvedBusinessTypeId: resolvedBusinessTypeIdForBonusSections,
      saasSignals: saasSignalsForBonusSections,
    })
  }, [
    effectiveMethod,
    effectiveMethods,
    hasDcfForecastWorkspace,
    resolvedBusinessCategoryForBonusSections,
    resolvedBusinessTypeIdForBonusSections,
    saasSignalsForBonusSections,
  ])

  /** After WACC & terminal (step 6) when DCF forecast exists; else step 4. */
  const balanceSheetCarveOutStep = useMemo(
    () => getManualInputBalanceSheetCarveOutStep(hasDcfForecastWorkspace),
    [hasDcfForecastWorkspace]
  )

  const synthesisStep = useMemo(
    () => getManualInputSynthesisStep(balanceSheetCarveOutStep, adaptiveHeaderSteps),
    [balanceSheetCarveOutStep, adaptiveHeaderSteps]
  )

  const dcfForecastDefaultsStep = 4
  const dcfForecastWorkspaceStep = 5
  const dcfWaccTerminalStep = 6

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (fieldValidation.hasErrors) {
      import('sonner').then(({ toast }) =>
        toast.error(mi('validation.checkFields'), {
          description: Object.values(fieldValidation.errors)[0],
        })
      )
      return
    }
    onSubmit(
      buildManualInputSubmitPayload({
        averageNormalizedEbitda: normalizedData.averageNormalizedEbitda,
        formData,
        trustFormData: useManualFormStore.getState().formData,
      })
    )
  }

  const handleCSVFileSelected = useCallback(
    (_file: File, parsedData: ParsedCSVData) => {
      setShowCSVUpload(false)
      const source = parsedData.detectedType === 'generic' ? 'yuki' : parsedData.detectedType
      onCSVImportComplete?.(source, _file.name)
    },
    [onCSVImportComplete]
  )

  // Check if core fields are filled
  const hasCompanyInfo = !!selectedCompany || formData.companyName.length > 0
  const hasBusinessType =
    !!selectedBusinessType ||
    formData.businessType.length > 0 ||
    !!resolvedBusinessTypeIdForBonusSections
  const hasFinancials = !!latestCompleteYearlyFinancial
  const hasEbitdaValue = formData.yearlyFinancials.some((yf) => hasExplicitNumericValue(yf.ebitda))
  const totalYearsWithEbitda = formData.yearlyFinancials.filter((yf) =>
    hasExplicitNumericValue(yf.ebitda)
  ).length
  const { canSave, reason: canSaveReason } = useCanSave()
  const canSubmit = hasCompanyInfo && hasBusinessType && hasFinancials && canSave

  // Round-4 audit: `selectedBelgianAuditEntries` was used to drive the
  // BelgianSmeAuditPanel mount in this component. That panel was
  // advisory output (SDE bridge ladder, NAV revaluation log, deal
  // structure readout) and now lives in the ValuationIQ report. The
  // memo is dropped here to avoid recomputing the audit selection per
  // render when nothing on the input panel consumes it. The
  // `getSelectedBelgianAuditEntries` helper stays exported for the
  // report-side renderer (the report context aggregator picks the same
  // entries directly from `valuation_results`).

  return (
    <>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
          <form onSubmit={handleSubmit} className="p-6 space-y-6 flex flex-col">
            <CompanyIdentificationSection
              formData={formData}
              initialData={initialData}
              readOnlyKbo={readOnlyKbo}
              isCalculating={isCalculating}
              selectedCompany={selectedCompany}
              setSelectedCompany={setSelectedCompany}
              companySearchValue={companySearchValue}
              setCompanySearchValue={setCompanySearchValue}
              countryUserOverrideRef={countryUserOverrideRef}
              updateField={updateField}
              updateFormData={updateFormData}
              localizeActivityCodeCopy={localizeActivityCodeCopy}
              searchCountry={searchCountry}
              kboSearchFn={kboSearchFn}
              handleCompanySelect={handleCompanySelect}
              handleClearCompany={handleClearCompany}
              showChangeCompanyWarning={showChangeCompanyWarning}
              prefillCompanyRef={prefillCompanyRef}
              setShowChangeCompanyWarning={setShowChangeCompanyWarning}
              executeClearCompany={executeClearCompany}
              businessTypesForSearch={businessTypesForSearch}
              businessTypesLoading={businessTypesLoading}
              businessTypesError={businessTypesError}
              refetchBusinessTypes={refetchBusinessTypes}
              nacePrefillError={nacePrefillError}
              retryNacePrefill={retryNacePrefill}
              selectedBusinessType={selectedBusinessType}
              effectiveMethods={effectiveMethods}
              handleBusinessTypeSelect={handleBusinessTypeSelect}
            />

            <OwnershipStructureSection
              formData={formData}
              selectedCompany={selectedCompany}
              hasBusinessType={hasBusinessType}
              fieldValidation={fieldValidation}
              updateField={updateField}
              onFieldHelpRequest={onFieldHelpRequest}
            />

            <FinancialHistorySection
              acceptedNormCount={acceptedNormCount}
              adaptiveDcfGlobalStep={adaptiveHeaderSteps.dcfGlobal}
              baseFilingYearForLabels={baseFilingYearForLabels}
              bizzcontrolImport={bizzcontrolImport}
              currentFilingYear={currentFilingYear}
              dcfDefaultsProvenance={dcfDefaultsProvenance}
              dcfForecastDefaultsStep={dcfForecastDefaultsStep}
              dcfForecastRows={dcfForecastRows}
              dcfForecastWorkspaceStep={dcfForecastWorkspaceStep}
              dcfModeSegmentOptions={dcfModeSegmentOptions}
              dcfProjectionAutofillRows={dcfProjectionAutofillRows}
              dcfSmartDefaultsFromHistory={dcfSmartDefaultsFromHistory}
              dcfWaccTerminalStep={dcfWaccTerminalStep}
              fieldValidation={fieldValidation}
              financialsStepRef={financialsStepRef}
              formData={formData}
              formatCurrency={formatCurrency}
              handleDcfInputModeChange={handleDcfInputModeChange}
              handleOpenLiveAccountingImport={handleOpenLiveAccountingImport}
              handleSelectFilingYear={handleSelectFilingYear}
              handleTerminalValueMethodChange={handleTerminalValueMethodChange}
              hasBusinessType={hasBusinessType}
              hasDcfSelected={hasDcfSelected}
              hasEbitdaValue={hasEbitdaValue}
              hasFinancials={hasFinancials}
              historicalCardRows={historicalCardRows}
              importAccountingError={importAccountingError}
              integrationDerivedCapexPct={integrationDerivedCapexPct}
              integrationDerivedDaPct={integrationDerivedDaPct}
              isCalculating={isCalculating}
              latestHistoricalEbitda={latestHistoricalEbitda}
              latestHistoricalRevenue={latestHistoricalRevenue}
              liveImportProviderName={liveImportProviderName}
              normalizedData={normalizedData}
              octopusImport={octopusImport}
              onFieldHelpRequest={onFieldHelpRequest}
              onViewAllNormalizations={onViewAllNormalizations}
              openingLiveAccountingImport={openingLiveAccountingImport}
              partialYears={partialYears}
              requestRemoveHistoricalYear={requestRemoveHistoricalYear}
              selectedCompany={selectedCompany}
              setFormData={setFormData}
              setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
              taxLatencyCount={taxLatencyCount}
              terminalValueMethod={terminalValueMethod}
              totalYearsWithEbitda={totalYearsWithEbitda}
              updateYearlyFinancials={updateYearlyFinancials}
              waccSectorBand={waccSectorBand}
            />

            <ManualInputMethodSections
              adaptiveHeaderSteps={adaptiveHeaderSteps}
              advisorDefaultsAppliedFields={advisorDefaultsAppliedFields}
              balanceSheetCarveOutStep={balanceSheetCarveOutStep}
              canApplyDcfProjectionAutofill={canApplyDcfProjectionAutofill}
              disabled={isCalculating}
              effectiveMethod={effectiveMethod}
              effectiveMethods={effectiveMethods}
              firmCountryCode={user?.firm_country_code}
              formData={formData}
              hasDcfForecastWorkspace={hasDcfForecastWorkspace}
              historicalCardRows={historicalCardRows}
              normalizedData={normalizedData}
              onApplyDcfProjectionAutofill={handleApplyDcfProjectionAutofill}
              onSynthesisJustificationChange={onSynthesisJustificationChange}
              onSynthesisPaywall={onSynthesisPaywall}
              onSynthesisWeightsChange={onSynthesisWeightsChange}
              onTerminalValueMethodChange={handleTerminalValueMethodChange}
              onViewAllNormalizations={onViewAllNormalizations}
              previewCurrencyFormatter={panelCurrencyFormatter}
              resolvedBusinessCategory={resolvedBusinessCategoryForBonusSections}
              resolvedBusinessTypeId={resolvedBusinessTypeIdForBonusSections}
              saasSignals={saasSignalsForBonusSections}
              setFormData={setFormData}
              showRealEstateCarveOut={
                Boolean(selectedCompany) &&
                hasBusinessType &&
                hasFinancials &&
                showRealEstateCarveOut
              }
              synthesisJustification={synthesisJustification}
              synthesisMethods={synthesisMethodsForPanel}
              synthesisStep={synthesisStep}
              synthesisUnlocked={synthesisUnlocked}
              synthesisValuationResults={synthesisValuationResults}
              synthesisWeights={synthesisWeights}
              terminalValueMethod={terminalValueMethod}
            />

            <ManualInputSubmitBar
              canSave={canSave}
              canSaveReason={canSaveReason}
              canSubmit={canSubmit}
              hasBusinessType={hasBusinessType}
              hasCompanyInfo={hasCompanyInfo}
              isCalculating={isCalculating}
            />
          </form>
        </div>
      </div>

      <ManualInputPanelModals
        showCSVUpload={showCSVUpload}
        setShowCSVUpload={setShowCSVUpload}
        handleCSVFileSelected={handleCSVFileSelected}
        bizzcontrolImport={bizzcontrolImport}
        octopusImport={octopusImport}
        historicalYearPendingRemove={historicalYearPendingRemove}
        setHistoricalYearPendingRemove={setHistoricalYearPendingRemove}
        commitRemoveHistoricalYear={commitRemoveHistoricalYear}
        showForecastRemovalConfirm={showForecastRemovalConfirm}
        setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
        setSelectedMethod={setSelectedMethod}
        markDcfForecastSyncPrevMethod={markDcfForecastSyncPrevMethod}
        onConfirmRemoveForecastYears={confirmRemoveForecastYears}
      />
    </>
  )
}
