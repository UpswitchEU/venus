'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type React from 'react'
import { AuroraButton } from '@/design-system/components/Button'
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
import type { DcfInputMode } from './DcfForecastWorkspace'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'
import type { DcfSmartDefaults, WaccSectorBand } from './dcfSmartDefaults'
import { EmbeddedDcfControls } from './EmbeddedDcfControls'
import { HistoricalYearCard } from './HistoricalYearCard'
import { SECTION_HEADER_ROW_CLASS, SectionStatusCircle } from './index'
import { NormalizedEbitdaSummary } from './NormalizedEbitdaSummary'

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
  historicalCardRows: YearlyFinancials[]
  importAccountingError: string | null
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
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
  historicalCardRows,
  importAccountingError,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
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
  taxLatencyCount,
  terminalValueMethod,
  totalYearsWithEbitda,
  updateYearlyFinancials,
  waccSectorBand,
}: FinancialHistorySectionProps) {
  const t = useTranslations()
  const mi = useTranslations('manualInput')

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

      {liveImportProviderName ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-2.5 sm:px-4">
          <p className="min-w-0 flex-1 text-xs text-foreground/75 leading-snug">
            {mi('liveAccountingImportHint', {
              provider: liveImportProviderName,
            })}
          </p>
          <AuroraButton
            type="button"
            variant="secondary"
            size="sm"
            className="shrink-0"
            loading={openingLiveAccountingImport}
            loadingScreenReaderLabel={t('common.states.loading')}
            disabled={bizzcontrolImport.isImporting || octopusImport.isImporting}
            onClick={() => void handleOpenLiveAccountingImport()}
            aria-label={mi('importFromAccountingAria', {
              provider: liveImportProviderName,
            })}
          >
            {mi('importFromAccounting', {
              provider: liveImportProviderName,
            })}
          </AuroraButton>
        </div>
      ) : null}

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
