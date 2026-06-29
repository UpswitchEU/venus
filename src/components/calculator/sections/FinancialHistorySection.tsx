'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type React from 'react'
import { useEffect, useRef } from 'react'
import { trackFinancialsStepViewed } from '@/lib/analytics'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { isFilingYearConfirmedValue } from '../../../utils/fiscalYear'
import {
  canAppendHistoricalYear,
  getNextHistoricalYear,
  removeForecastYear,
} from '../../../utils/forecastYears'
import { hasExplicitNumericValue as hasExplicitFinancialValue } from '../../../utils/yearlyFinancials'
import type { FieldHelpContext } from '../FieldHelpTrigger'
import { FilingYearPrompt } from '../FilingYearPrompt'
import type { ManualInputFieldValidation } from '../utils/manualInputFieldValidation'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import type { UpdateManualYearlyFinancials } from '../utils/manualYearlyFinancialUpdates'
import { ConnectAccountingInline } from './ConnectAccountingInline'
import type { DcfInputMode } from './DcfForecastWorkspace'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'
import type { DcfSmartDefaults, WaccSectorBand } from './dcfSmartDefaults'
import { EmbeddedDcfControls } from './EmbeddedDcfControls'
import { HistoricalYearCard } from './HistoricalYearCard'
import { InviteAccountantInline } from './InviteAccountantInline'
import { SECTION_HEADER_ROW_CLASS, SectionStatusCircle } from './index'
import { NormalizedEbitdaSummary } from './NormalizedEbitdaSummary'
import { RegistryEstimateInline } from './RegistryEstimateInline'

interface AccountingImportState {
  isImporting: boolean
}

interface FinancialHistorySectionProps {
  adaptiveDcfGlobalStep?: number
  acceptedNormCount: number
  baseFilingYearForLabels: number
  bizzcontrolImport: AccountingImportState
  currentFilingYear: number
  dcfDefaultsProvenance: 'none' | 'integration' | 'history' | 'both'
  dcfForecastDefaultsStep: number
  dcfForecastRows: YearlyFinancials[]
  dcfForecastWorkspaceStep: number
  dcfModeSegmentOptions: Array<{ label: string; value: DcfInputMode }>
  dcfProjectionAutofillRows: DcfProjectionPreviewRow[]
  dcfSmartDefaultsFromHistory: DcfSmartDefaults | null
  dcfWaccTerminalStep: number
  fieldValidation: ManualInputFieldValidation
  financialsStepRef: React.RefObject<HTMLElement>
  formData: ManualValuationFormData
  formatCurrency: (amount: number) => string
  handleDcfInputModeChange: (mode: DcfInputMode) => void
  handleOpenLiveAccountingImport: () => void | Promise<void>
  handleSelectFilingYear: (selectedYear: number) => void
  handleTerminalValueMethodChange: (method: TerminalValueMethod) => void
  hasBusinessType: boolean
  hasDcfSelected: boolean
  hasEbitdaValue: boolean
  hasFinancials: boolean
  hasImportedAccountingData: boolean
  historicalCardRows: YearlyFinancials[]
  importAccountingError: string | null
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
  integrationsEnabled: boolean
  isCalculating: boolean
  latestHistoricalEbitda?: number
  latestHistoricalRevenue?: number
  liveImportProviderName: string | null
  normalizedData: ManualInputNormalizedData
  octopusImport: AccountingImportState
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  onViewAllNormalizations?: () => void
  openingLiveAccountingImport: boolean
  partialYears: string[]
  requestRemoveHistoricalYear: (year: string) => void
  selectedCompany: unknown
  setFormData: React.Dispatch<React.SetStateAction<ManualValuationFormData>>
  setShowForecastRemovalConfirm: (open: boolean) => void
  /**
   * Owner self-serve autofill doors (connect accounting / invite accountant /
   * registry estimate). These are an owner funnel — hidden when a professional
   * (accountant / advisor acting for a client) is entering the figures directly.
   */
  showOwnerAutofillDoors: boolean
  taxLatencyCount: number
  terminalValueMethod: TerminalValueMethod
  totalYearsWithEbitda: number
  updateYearlyFinancials: UpdateManualYearlyFinancials
  waccSectorBand: WaccSectorBand | null
}

export function FinancialHistorySection({
  adaptiveDcfGlobalStep,
  acceptedNormCount,
  baseFilingYearForLabels,
  bizzcontrolImport,
  currentFilingYear,
  dcfDefaultsProvenance,
  dcfForecastDefaultsStep,
  dcfForecastRows,
  dcfForecastWorkspaceStep,
  dcfModeSegmentOptions,
  dcfProjectionAutofillRows,
  dcfSmartDefaultsFromHistory,
  dcfWaccTerminalStep,
  fieldValidation,
  financialsStepRef,
  formData,
  formatCurrency,
  handleDcfInputModeChange,
  handleOpenLiveAccountingImport,
  handleSelectFilingYear,
  handleTerminalValueMethodChange,
  hasBusinessType,
  hasDcfSelected,
  hasEbitdaValue,
  hasFinancials,
  hasImportedAccountingData,
  historicalCardRows,
  importAccountingError,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
  integrationsEnabled,
  isCalculating,
  latestHistoricalEbitda,
  latestHistoricalRevenue,
  liveImportProviderName,
  normalizedData,
  octopusImport,
  onFieldHelpRequest,
  onViewAllNormalizations,
  openingLiveAccountingImport,
  partialYears,
  requestRemoveHistoricalYear,
  selectedCompany,
  setFormData,
  setShowForecastRemovalConfirm,
  showOwnerAutofillDoors,
  taxLatencyCount,
  terminalValueMethod,
  totalYearsWithEbitda,
  updateYearlyFinancials,
  waccSectorBand,
}: FinancialHistorySectionProps) {
  const mi = useTranslations('manualInput')

  // BET-315 — financials-step funnel impression (entry → here → submit). Fire
  // once per mount, only when the step is actually shown (past the guard below).
  const viewedRef = useRef(false)
  useEffect(() => {
    if (viewedRef.current || !selectedCompany || !hasBusinessType) return
    viewedRef.current = true
    trackFinancialsStepViewed({
      hasFinancials,
      hasConnectedProvider: liveImportProviderName != null,
    })
  }, [selectedCompany, hasBusinessType, hasFinancials, liveImportProviderName])

  if (!selectedCompany || !hasBusinessType) return null

  return (
    <motion.section
      ref={financialsStepRef}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4 pt-2"
    >
      <div className={SECTION_HEADER_ROW_CLASS}>
        <SectionStatusCircle step={3} complete={hasFinancials} className="flex" />
        <h3 className="text-sm font-medium text-foreground">{mi('sections.financialHistory')}</h3>
      </div>

      {importAccountingError && (
        <p className="text-xs text-destructive ml-8">{importAccountingError}</p>
      )}

      <FilingYearPrompt
        defaultYear={currentFilingYear}
        dismissed={
          isFilingYearConfirmedValue(formData.filingYearConfirmed) ||
          normalizedData.years.some((year) => hasExplicitFinancialValue(year.ebitda))
        }
        onSelect={handleSelectFilingYear}
      />

      <NormalizedEbitdaSummary
        acceptedNormCount={acceptedNormCount}
        formatCurrency={formatCurrency}
        hasEbitdaValue={hasEbitdaValue}
        hasFinancials={hasFinancials}
        normalizedData={normalizedData}
        onViewAllNormalizations={onViewAllNormalizations}
        taxLatencyCount={taxLatencyCount}
        totalYearsWithEbitda={totalYearsWithEbitda}
      />

      {/* BET-312/317/318 autofill doors — an OWNER funnel (pull from accounting →
          invite accountant → registry estimate). Hidden for professionals, who
          enter the figures directly rather than self-serving through a door. */}
      {showOwnerAutofillDoors && (
        <>
          <ConnectAccountingInline
            integrationsEnabled={integrationsEnabled}
            liveImportProviderName={liveImportProviderName}
            imported={hasImportedAccountingData}
            importBusy={bizzcontrolImport.isImporting || octopusImport.isImporting}
            openingImport={openingLiveAccountingImport}
            onImport={handleOpenLiveAccountingImport}
          />
          <InviteAccountantInline />
          <RegistryEstimateInline
            company={selectedCompany}
            fallbackCountry={formData.country ?? null}
          />
        </>
      )}

      <div className="space-y-3">
        {historicalCardRows.map((yearData) => {
          const normalizedYear = normalizedData.years.find(
            (year) => year.year === yearData.year && !!year.isForecast === !!yearData.isForecast
          )

          return (
            <HistoricalYearCard
              key={`${yearData.year}-${yearData.isForecast ? 'f' : 'h'}`}
              baseFilingYearForLabels={baseFilingYearForLabels}
              fieldValidation={fieldValidation}
              financialRows={formData.yearlyFinancials}
              formatCurrency={formatCurrency}
              normalizedYear={normalizedYear}
              onFieldHelpRequest={onFieldHelpRequest}
              onRemoveForecastYear={(year) =>
                setFormData((prev) => ({
                  ...prev,
                  yearlyFinancials: removeForecastYear(prev.yearlyFinancials, year),
                }))
              }
              onRemoveHistoricalYear={requestRemoveHistoricalYear}
              onViewAllNormalizations={onViewAllNormalizations}
              partialYears={partialYears}
              updateYearlyFinancials={updateYearlyFinancials}
              yearData={yearData}
            />
          )
        })}

        {canAppendHistoricalYear(formData.yearlyFinancials) && (
          <button
            type="button"
            onClick={() => {
              setFormData((prev) => ({
                ...prev,
                yearlyFinancials: [
                  ...prev.yearlyFinancials,
                  {
                    year: String(getNextHistoricalYear(prev.yearlyFinancials)),
                    revenue: 0,
                    ebitda: 0,
                  },
                ],
              }))
            }}
            className="w-full p-3 rounded-xl border border-dashed border-foreground/[0.08] text-sm text-foreground/40 hover:text-foreground/60 hover:border-foreground/[0.15] hover:bg-foreground/[0.02] transition-colors flex items-center justify-center gap-2"
            aria-label={`${mi('addYear')} ${getNextHistoricalYear(formData.yearlyFinancials)}`}
          >
            <Plus className="w-4 h-4" aria-hidden />
            {mi('addYear')} ({getNextHistoricalYear(formData.yearlyFinancials)})
          </button>
        )}

        <EmbeddedDcfControls
          adaptiveDcfGlobalStep={adaptiveDcfGlobalStep}
          dcfDefaultsProvenance={dcfDefaultsProvenance}
          dcfForecastDefaultsStep={dcfForecastDefaultsStep}
          dcfForecastRows={dcfForecastRows}
          dcfForecastWorkspaceStep={dcfForecastWorkspaceStep}
          dcfModeSegmentOptions={dcfModeSegmentOptions}
          dcfProjectionAutofillRows={dcfProjectionAutofillRows}
          dcfSmartDefaultsFromHistory={dcfSmartDefaultsFromHistory}
          dcfWaccTerminalStep={dcfWaccTerminalStep}
          fieldValidation={fieldValidation}
          formData={formData}
          handleDcfInputModeChange={handleDcfInputModeChange}
          handleTerminalValueMethodChange={handleTerminalValueMethodChange}
          hasDcfSelected={hasDcfSelected}
          integrationDerivedCapexPct={integrationDerivedCapexPct}
          integrationDerivedDaPct={integrationDerivedDaPct}
          isCalculating={isCalculating}
          latestHistoricalEbitda={latestHistoricalEbitda}
          latestHistoricalRevenue={latestHistoricalRevenue}
          setFormData={setFormData}
          setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
          terminalValueMethod={terminalValueMethod}
          updateYearlyFinancials={updateYearlyFinancials}
          waccSectorBand={waccSectorBand}
        />
      </div>
    </motion.section>
  )
}
