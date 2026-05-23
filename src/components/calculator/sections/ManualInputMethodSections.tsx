'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Lock, SlidersHorizontal, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type Dispatch, type SetStateAction, useEffect, useMemo, useRef } from 'react'
import type { GetBonusSectionsSaasSignals } from '../../../constants/methodFieldConfig'
import { useAdvisorControlsModalStore } from '../../../store/useAdvisorControlsModalStore'
import type { ManualValuationFormData, ValuationMethodResult } from '../../../types/valuation'
import type { ManualInputAdaptiveHeaderSteps } from '../utils/manualInputAdaptiveSteps'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import { AdaptiveSections } from './AdaptiveSections'
import { AdvancedAdvisorControlsModal } from './AdvancedAdvisorControlsModal'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import { RealEstateCarveOutSection, SynthesisWeightingSection } from './index'

type AdvisorDefaultAppliedField =
  | 'multiple_calibration_adjustment'
  | 'historical_ebitda_weighting_mode'
  | 'show_enterprise_to_equity_bridge'

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
  resolvedBusinessCategory?: string | null
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
      if (!yearData.is_forecast && Number.isFinite(year)) years.add(year)
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
          synthesisPanelAnchorRef.current?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
          })
        })
      })
    }
  }, [synthesisMethods.length])

  return (
    <>
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

// ────────────────────────────────────────────────────────────────────────
// AdvisorControlsTrigger
// ────────────────────────────────────────────────────────────────────────

interface AdvisorControlsTriggerProps {
  advisorDefaultsAppliedFields?: ReadonlyArray<AdvisorDefaultAppliedField>
  sectorAverageMultiple: number | null
  advisorWeightingYears: number[]
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  disabled: boolean
}

/**
 * Single in-flow entry point to the advanced advisor controls modal.
 *
 * Designed as the "minimal seam" replacement for the old inline section:
 *  • Trigger is a plain Button — no chip / no preview values — per the
 *    "Just a button" UX call so the wizard's data-entry surface stays
 *    visually quiet.
 *  • A tiny sparkles pill is appended only when the advisor's saved
 *    defaults have already pre-applied to the form. That single signal
 *    tells returning advisors "your house style is already in" without
 *    forcing them to open the modal to check.
 *  • State for `open` lives here (not in the parent) because no other
 *    surface needs to drive it; the same modal mounted from the kebab menu
 *    in ManualLayoutNav uses its own independent open-state.
 */
function AdvisorControlsTrigger({
  advisorDefaultsAppliedFields,
  sectorAverageMultiple,
  advisorWeightingYears,
  formData,
  setFormData,
  disabled,
}: AdvisorControlsTriggerProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')
  const open = useAdvisorControlsModalStore((s) => s.open)
  const setOpen = useAdvisorControlsModalStore((s) => s.setOpen)
  const prefilled = (advisorDefaultsAppliedFields?.length ?? 0) > 0

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="inline-flex items-center gap-2 rounded-lg border border-foreground/15 bg-foreground/[0.02] px-3 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.06] hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/55" aria-hidden />
        {t('openModalButton')}
        <span className="text-xs text-foreground/45">— {t('openModalButtonHint')}</span>
      </button>

      {prefilled && (
        <span
          className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/[0.06] px-2 py-0.5 text-[11px] text-primary"
          title={t('prefilledFromSettings')}
        >
          <Sparkles className="h-3 w-3" aria-hidden />
          {t('prefilledFromSettingsLink')}
        </span>
      )}

      <AdvancedAdvisorControlsModal
        open={open}
        onOpenChange={setOpen}
        sectorAverageMultiple={sectorAverageMultiple}
        multipleCalibrationAdjustment={formData.multiple_calibration_adjustment}
        multipleCalibrationNote={formData.multiple_calibration_note}
        historicalYears={advisorWeightingYears}
        historicalEbitdaWeightingMode={formData.historical_ebitda_weighting_mode}
        historicalEbitdaWeights={formData.historical_ebitda_weights}
        showEnterpriseToEquityBridge={formData.show_enterprise_to_equity_bridge}
        advisorDefaultsAppliedFields={advisorDefaultsAppliedFields}
        onFieldChange={(field, value) => {
          setFormData((prev) => ({ ...prev, [field]: value }))
        }}
        disabled={disabled}
      />
    </div>
  )
}
