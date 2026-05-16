'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type Dispatch, type SetStateAction, useEffect, useRef } from 'react'
import type { GetBonusSectionsSaasSignals } from '../../../constants/methodFieldConfig'
import type { ManualValuationFormData, ValuationMethodResult } from '../../../types/valuation'
import type { ManualInputAdaptiveHeaderSteps } from '../utils/manualInputAdaptiveSteps'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import { AdaptiveSections } from './AdaptiveSections'
import type { TerminalValueMethod } from './DcfGlobalAssumptions'
import { RealEstateCarveOutSection, SynthesisWeightingSection } from './index'

interface ManualInputMethodSectionsProps {
  adaptiveHeaderSteps: ManualInputAdaptiveHeaderSteps
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
            excludeRealEstate={formData.exclude_real_estate}
            realEstateBookValue={formData.real_estate_book_value}
            estimatedMarketRent={formData.estimated_market_rent}
            onToggleChange={(checked) => {
              setFormData((prev) => ({
                ...prev,
                exclude_real_estate: checked,
                real_estate_book_value: checked ? prev.real_estate_book_value : undefined,
                estimated_market_rent: checked ? prev.estimated_market_rent : undefined,
              }))
            }}
            onFieldChange={(field, value) => {
              setFormData((prev) => ({ ...prev, [field]: value }))
            }}
            disabled={disabled}
          />
        </div>
      )}

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
