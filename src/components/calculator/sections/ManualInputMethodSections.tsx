'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from 'react'
import { scrollElementIntoManualLayout } from '@/features/manual/utils/manualLayoutScroll'
import { isYearRowForecast } from '@/utils/yearData'
import type { GetBonusSectionsSaasSignals } from '../../../constants/methodFieldConfig'
import type { ManualValuationFormData, ValuationMethodResult } from '../../../types/valuation'
import type { ManualInputAdaptiveHeaderSteps } from '../utils/manualInputAdaptiveSteps'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import { AdaptiveSections } from './AdaptiveSections'
import { AdvisorControlsTrigger, type AdvisorDefaultAppliedField } from './AdvisorControlsTrigger'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import { RealEstateCarveOutSection, SynthesisWeightingSection } from './index'

interface ManualInputMethodSectionsProps {
  adaptiveHeaderSteps: ManualInputAdaptiveHeaderSteps
  /**
   * Step-4a form fields seeded from the advisor's saved defaults on this
   * mount. Empty when the user hasn't saved any, or when the corresponding
   * form fields were already set. Used purely to surface a "prefilled from
   * settings" hint — the values themselves are in `formData`.
   */
  advisorDefaultsAppliedFields?: ReadonlyArray<AdvisorDefaultAppliedField>
  balanceSheetCarveOutStep: number
  canApplyDcfProjectionAutofill: boolean
  disabled: boolean
  effectiveMethod: string
  effectiveMethods: string[]
  firmCountryCode?: string | null
  formData: ManualValuationFormData
  hasDcfForecastWorkspace: boolean
  historicalCardRows: Array<{ year: string | number }>
  normalizedData: ManualInputNormalizedData
  onApplyDcfProjectionAutofill: () => void
  onSynthesisJustificationChange?: (justification: string) => void
  onSynthesisPaywall?: () => void
  onSynthesisWeightsChange?: (weights: Record<string, number>) => void
  onTerminalValueMethodChange: (method: TerminalValueMethod) => void
  onViewAllNormalizations?: () => void
  previewCurrencyFormatter: Intl.NumberFormat
  resolvedBusinessCategory?: unknown
  resolvedBusinessTypeId?: string | null
  saasSignals: GetBonusSectionsSaasSignals
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  showRealEstateCarveOut: boolean
  synthesisJustification: string
  synthesisMethods: string[]
  synthesisStep: number
  synthesisUnlocked: boolean
  synthesisValuationResults?: Record<string, ValuationMethodResult> | null
  synthesisWeights: Record<string, number>
  terminalValueMethod: TerminalValueMethod
}

export function ManualInputMethodSections({
  adaptiveHeaderSteps,
  advisorDefaultsAppliedFields,
  balanceSheetCarveOutStep,
  canApplyDcfProjectionAutofill,
  disabled,
  effectiveMethod,
  effectiveMethods,
  firmCountryCode,
  formData,
  hasDcfForecastWorkspace,
  historicalCardRows,
  normalizedData,
  onApplyDcfProjectionAutofill,
  onSynthesisJustificationChange,
  onSynthesisPaywall,
  onSynthesisWeightsChange,
  onTerminalValueMethodChange,
  onViewAllNormalizations,
  previewCurrencyFormatter,
  resolvedBusinessCategory,
  resolvedBusinessTypeId,
  saasSignals,
  setFormData,
  showRealEstateCarveOut,
  synthesisJustification,
  synthesisMethods,
  synthesisStep,
  synthesisUnlocked,
  synthesisValuationResults,
  synthesisWeights,
  terminalValueMethod,
}: ManualInputMethodSectionsProps) {
  const mi = useTranslations('manualInput')
  const synthesisPanelAnchorRef = useRef<HTMLDivElement>(null)
  const prevSynthesisMethodCountRef = useRef(0)
  const advisorWeightingYears = useMemo(() => {
    const years = new Set<number>()
    const currentYear = Number(formData.current_year_data?.year ?? historicalCardRows[0]?.year)
    if (Number.isFinite(currentYear)) years.add(currentYear)
    for (const yearData of formData.historical_years_data ?? []) {
      const year = Number(yearData.year)
      if (!isYearRowForecast(yearData) && Number.isFinite(year)) years.add(year)
    }
    return Array.from(years).sort((a, b) => a - b)
  }, [formData.current_year_data?.year, formData.historical_years_data, historicalCardRows])
  const sectorAverageMultiple = useMemo(() => {
    const context = formData.business_context as Record<string, unknown> | undefined
    const distribution = context?.ev_ebitda_multiple as Record<string, unknown> | undefined
    const candidates = [
      context?.benchmark_multiple,
      context?.ev_ebitda_median,
      distribution?.median,
      distribution?.p50,
    ]
    for (const candidate of candidates) {
      const value = Number(candidate)
      if (Number.isFinite(value) && value > 0) return value
    }
    return null
  }, [formData.business_context])

  useEffect(() => {
    const nextCount = synthesisMethods.length
    const previousCount = prevSynthesisMethodCountRef.current
    prevSynthesisMethodCountRef.current = nextCount
    if (nextCount >= 2 && previousCount < 2) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const anchor = synthesisPanelAnchorRef.current
          if (anchor) {
            scrollElementIntoManualLayout(anchor, { behavior: 'smooth', block: 'nearest' })
          }
        })
      })
    }
  }, [synthesisMethods.length])

  return (
    <>
      {/* Jump target for the "Methodekeuze herstellen" quality-warning CTA —
          lands the advisor at the method-configuration area. */}
      <div id="manual-section-methods" aria-hidden className="scroll-mt-24" />
      {showRealEstateCarveOut && (
        <div className="mt-4">
          <RealEstateCarveOutSection
            step={balanceSheetCarveOutStep}
            realEstateTreatment={formData.real_estate_treatment}
            excludeRealEstate={formData.exclude_real_estate}
            realEstateMarketValue={formData.real_estate_market_value}
            realEstateBookValue={formData.real_estate_book_value}
            estimatedMarketRent={formData.estimated_market_rent}
            onTreatmentChange={(treatment) => {
              setFormData((prev) => ({
                ...prev,
                real_estate_treatment: treatment,
                exclude_real_estate: treatment === 'carve_out',
                real_estate_market_value:
                  treatment === 'included' ? prev.real_estate_market_value : undefined,
                real_estate_book_value:
                  treatment === 'carve_out' || treatment === 'included'
                    ? prev.real_estate_book_value
                    : undefined,
                estimated_market_rent:
                  treatment === 'carve_out' ? prev.estimated_market_rent : undefined,
              }))
            }}
            onFieldChange={(field, value) => {
              setFormData((prev) => ({ ...prev, [field]: value }))
            }}
            disabled={disabled}
          />
        </div>
      )}

      {/*
       * Per-valuation modelling decisions (premium, weighting, waterfall
       * toggle) were promoted out of the data-entry flow into a centered
       * modal on 2026-05-23 — the left panel is for data inputs, not
       * modelling configuration. This button is the single in-flow entry
       * point; the same modal is also reachable from the kebab menu on the
       * active valuation in ManualLayoutNav.
       */}
      <AdvisorControlsTrigger
        advisorDefaultsAppliedFields={advisorDefaultsAppliedFields}
        sectorAverageMultiple={sectorAverageMultiple}
        advisorWeightingYears={advisorWeightingYears}
        formData={formData}
        setFormData={setFormData}
        disabled={disabled}
      />

      <div className="mt-4 flex flex-col gap-6">
        <AdaptiveSections
          effectiveMethod={effectiveMethod}
          effectiveMethods={effectiveMethods}
          businessCategory={resolvedBusinessCategory ?? undefined}
          businessTypeId={resolvedBusinessTypeId ?? undefined}
          saasSignals={saasSignals}
          formData={formData}
          firmCountryCode={firmCountryCode ?? undefined}
          previewCurrencyFormatter={previewCurrencyFormatter}
          sectionHeaderSteps={adaptiveHeaderSteps}
          suppressDcfGlobalAssumptions={hasDcfForecastWorkspace}
          onFieldChange={(field, value) => {
            setFormData((prev) => ({ ...prev, [field]: value }))
          }}
          onAnyFieldChange={(field, value) => {
            setFormData((prev) => ({ ...prev, [field]: value }))
          }}
          onViewAllNormalizations={onViewAllNormalizations}
          currentFiscalYear={
            historicalCardRows.length > 0 ? Number(historicalCardRows[0].year) : undefined
          }
          onApplyDcfPercentAutofill={onApplyDcfProjectionAutofill}
          canApplyDcfPercentAutofill={canApplyDcfProjectionAutofill}
          terminalValueMethod={terminalValueMethod}
          onTerminalValueMethodChange={onTerminalValueMethodChange}
          disabled={disabled}
          fiscalWeightedNormalizedEbitda={
            normalizedData.totalYearsWithData > 0
              ? normalizedData.averageNormalizedEbitda
              : undefined
          }
          fiscalWeightedHistoricalYearCount={
            normalizedData.totalYearsWithData > 0 ? normalizedData.totalYearsWithData : undefined
          }
        />

        <AnimatePresence>
          {synthesisMethods.length >= 2 && (
            <motion.div
              ref={synthesisPanelAnchorRef}
              key="synthesis-panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="border-t border-foreground/[0.06] pt-6">
                {synthesisUnlocked ? (
                  <SynthesisWeightingSection
                    methods={synthesisMethods}
                    weights={synthesisWeights}
                    justification={synthesisJustification}
                    onWeightsChange={onSynthesisWeightsChange ?? (() => undefined)}
                    onJustificationChange={onSynthesisJustificationChange ?? (() => undefined)}
                    step={synthesisStep}
                    disabled={disabled}
                    valuationResults={synthesisValuationResults}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => onSynthesisPaywall?.()}
                    aria-label={mi('synthesis.lockedTitle')}
                    className="w-full rounded-xl border border-dashed border-foreground/10 bg-muted/30 p-4 text-center hover:bg-muted/50 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2"
                  >
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Lock className="w-3.5 h-3.5 text-foreground/40 group-hover:text-primary transition-colors" />
                      <span className="text-xs font-semibold uppercase tracking-wider text-foreground/40 group-hover:text-primary transition-colors">
                        {mi('synthesis.lockedTitle')}
                      </span>
                    </div>
                    <p className="text-[11px] text-foreground/40">
                      {mi('synthesis.lockedDescription')}
                    </p>
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  )
}
