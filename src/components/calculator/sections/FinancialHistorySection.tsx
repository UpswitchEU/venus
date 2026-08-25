'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { scrollElementIntoManualLayout } from '@/features/manual/utils/manualLayoutScroll'
import { trackFinancialsStepViewed } from '@/lib/analytics'
import { accountingAPI, parseAccountingApiError } from '@/services/api/accounting'
import { useImportQualityStore } from '@/store/useImportQualityStore'
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
import { useVenusClientValuationReadiness } from '../hooks/useVenusClientValuationReadiness'
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

interface FinancialHistorySectionProps {
  adaptiveDcfGlobalStep?: number
  acceptedNormCount: number
  baseFilingYearForLabels: number
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
  onFieldHelpRequest?: (context: FieldHelpContext) => void
  onViewAllNormalizations?: () => void
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
  onFieldHelpRequest,
  onViewAllNormalizations,
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
  const mi = useTranslations('manualInput')
  const locale = useLocale()
  const { clientId, readiness, refreshReadiness } = useVenusClientValuationReadiness()
  const importedProvider = useImportQualityStore((state) => state.provider)
  const importQuality = useImportQualityStore((state) => state.importQuality)
  const sourceProvider = readiness?.source.provider ?? liveImportProviderName ?? importedProvider
  const sourceSyncedAt =
    readiness?.source.synced_at ??
    Object.values(importQuality ?? {})
      .map((quality) => quality.source_provenance?.fetched_at ?? quality.fetched_at)
      .filter((value): value is string => typeof value === 'string')
      .sort()
      .at(-1)
  const reviewIssuesByYear = new Map(
    (readiness?.issues ?? [])
      .filter((issue) => typeof issue.fiscal_year === 'number')
      .map((issue) => [issue.fiscal_year as number, issue])
  )
  const [isResyncing, setIsResyncing] = useState(false)
  const [recoveryError, setRecoveryError] = useState<string | null>(null)
  const [locallyBlockedYear, setLocallyBlockedYear] = useState<number | null>(null)
  const focusedReadinessReviewRef = useRef(false)
  useEffect(() => {
    const handleReviewRequired = (event: Event) => {
      const detail = (event as CustomEvent<{ fiscalYear?: unknown }>).detail
      const year = Number(detail?.fiscalYear)
      setLocallyBlockedYear(Number.isFinite(year) ? year : null)
      if (financialsStepRef.current) {
        scrollElementIntoManualLayout(financialsStepRef.current, {
          behavior: 'smooth',
          block: 'start',
        })
      }
    }
    window.addEventListener('venus:financial-review-required', handleReviewRequired)
    return () => window.removeEventListener('venus:financial-review-required', handleReviewRequired)
  }, [financialsStepRef])
  useEffect(() => {
    if (readiness?.state !== 'review_required') {
      focusedReadinessReviewRef.current = false
      return
    }
    if (focusedReadinessReviewRef.current || !financialsStepRef.current) return
    focusedReadinessReviewRef.current = true
    scrollElementIntoManualLayout(financialsStepRef.current, {
      behavior: 'smooth',
      block: 'start',
    })
  }, [financialsStepRef, readiness?.state])
  const resyncSilverfin = async () => {
    if (!clientId || isResyncing) return
    setIsResyncing(true)
    setRecoveryError(null)
    try {
      await accountingAPI.resyncClient(clientId, { force: true })
      await refreshReadiness()
    } catch (error) {
      setRecoveryError(parseAccountingApiError(error))
    } finally {
      setIsResyncing(false)
    }
  }
  const sourceCopy =
    locale === 'nl'
      ? { prefix: 'Vooraf ingevuld uit', synced: 'gesynchroniseerd' }
      : locale === 'fr'
        ? { prefix: 'Prérempli depuis', synced: 'synchronisé' }
        : { prefix: 'Prefilled from', synced: 'synced' }
  const sourceLabel = sourceProvider
    ? sourceProvider.toLowerCase() === 'silverfin'
      ? 'Silverfin'
      : sourceProvider
    : null

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

      {sourceLabel ? (
        <div className="ml-8 rounded-lg border border-primary/20 bg-primary/[0.05] px-3 py-2 text-xs text-foreground/70">
          <span className="font-semibold text-foreground">
            {sourceCopy.prefix} {sourceLabel}
          </span>
          {sourceSyncedAt ? (
            <span className="ml-2 text-foreground/50">
              · {sourceCopy.synced}{' '}
              {new Intl.DateTimeFormat(
                locale === 'nl' ? 'nl-BE' : locale === 'fr' ? 'fr-BE' : 'en-GB',
                { hour: '2-digit', minute: '2-digit' }
              ).format(new Date(sourceSyncedAt))}
            </span>
          ) : null}
          {readiness?.state === 'review_required' || reviewIssuesByYear.size > 0 ? (
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-primary/15 pt-2">
              <span className="font-medium text-amber-700 dark:text-amber-300">
                {locale === 'nl'
                  ? `${reviewIssuesByYear.size || readiness.issues.length} boekjaren controleren`
                  : locale === 'fr'
                    ? `${reviewIssuesByYear.size || readiness.issues.length} exercices à contrôler`
                    : `${reviewIssuesByYear.size || readiness.issues.length} fiscal years to review`}
              </span>
              {sourceLabel.toLowerCase() === 'silverfin' ? (
                <button
                  type="button"
                  disabled={isResyncing}
                  onClick={() => void resyncSilverfin()}
                  className="rounded-md border border-primary/25 px-2.5 py-1 font-semibold text-primary hover:bg-primary/[0.08] disabled:opacity-50"
                >
                  {isResyncing
                    ? '…'
                    : locale === 'nl'
                      ? 'Silverfin opnieuw synchroniseren'
                      : locale === 'fr'
                        ? 'Resynchroniser Silverfin'
                        : 'Resync Silverfin'}
                </button>
              ) : null}
            </div>
          ) : null}
          {recoveryError ? (
            <p className="mt-2 text-destructive" role="alert">
              {recoveryError}
            </p>
          ) : null}
        </div>
      ) : null}

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
              onHighMarginAttested={({ year, attestationId, sourceDigest }) => {
                setFormData((previous) => ({
                  ...previous,
                  yearlyFinancials: previous.yearlyFinancials.map((row) =>
                    Number(row.year) === year && !row.isForecast
                      ? {
                          ...row,
                          source_digest: sourceDigest,
                          attestation_id: attestationId,
                          quality_state: 'attested_review',
                          eligibility_reason: undefined,
                        }
                      : row
                  ),
                }))
                setLocallyBlockedYear(null)
                setRecoveryError(null)
                void refreshReadiness().catch((error) => {
                  setRecoveryError(parseAccountingApiError(error))
                })
              }}
              partialYears={partialYears}
              updateYearlyFinancials={updateYearlyFinancials}
              yearData={yearData}
              readinessIssue={
                reviewIssuesByYear.get(Number(yearData.year)) ??
                (locallyBlockedYear === Number(yearData.year)
                  ? { reason_code: 'extreme_margin_unattested' }
                  : undefined)
              }
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
