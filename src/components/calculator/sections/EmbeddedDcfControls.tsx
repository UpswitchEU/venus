'use client'

import type React from 'react'
import { lazy, Suspense, useCallback } from 'react'
import type { DcfInputMode } from '@/components/calculator/sections/DcfForecastWorkspace'
import type { TerminalValueMethod } from '@/lib/methods/dcf/DcfGlobalAssumptionsSectionStack'
import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import type { ManualInputFieldValidation } from '../utils/manualInputFieldValidation'
import type { UpdateManualYearlyFinancials } from '../utils/manualYearlyFinancialUpdates'
import type { DcfProjectionPreviewRow } from './dcfProjectionPreview'
import type { DcfSmartDefaults, WaccSectorBand } from './dcfSmartDefaults'

const DcfGlobalAssumptionsSectionStack = lazy(() =>
  import('@/lib/methods/dcf/DcfGlobalAssumptionsSectionStack').then((module) => ({
    default: module.DcfGlobalAssumptionsSectionStack,
  }))
)
const DcfForecastWorkspaceSectionStack = lazy(() =>
  import('@/lib/methods/dcf/DcfForecastWorkspaceSectionStack').then((module) => ({
    default: module.DcfForecastWorkspaceSectionStack,
  }))
)

function BonusSectionFallback() {
  return <div className="my-2 h-16 animate-pulse rounded-lg bg-foreground/[0.04]" aria-hidden />
}

interface EmbeddedDcfControlsProps {
  adaptiveDcfGlobalStep?: number
  dcfDefaultsProvenance: 'none' | 'integration' | 'history' | 'both'
  dcfForecastDefaultsStep: number
  dcfForecastRows: YearlyFinancials[]
  dcfForecastWorkspaceStep: number
  dcfModeSegmentOptions: Array<{ label: string; value: DcfInputMode }>
  dcfProjectionAutofillRows: DcfProjectionPreviewRow[]
  dcfSmartDefaultsFromHistory: DcfSmartDefaults | null
  dcfWaccTerminalStep: number
  fieldValidation: ManualInputFieldValidation
  formData: ManualValuationFormData
  handleDcfInputModeChange: (mode: DcfInputMode) => void
  handleTerminalValueMethodChange: (method: TerminalValueMethod) => void
  hasDcfSelected: boolean
  integrationDerivedCapexPct: number | null
  integrationDerivedDaPct: number | null
  isCalculating: boolean
  latestHistoricalEbitda?: number
  latestHistoricalRevenue?: number
  setFormData: React.Dispatch<React.SetStateAction<ManualValuationFormData>>
  setShowForecastRemovalConfirm: (open: boolean) => void
  terminalValueMethod: TerminalValueMethod
  updateYearlyFinancials: UpdateManualYearlyFinancials
  waccSectorBand: WaccSectorBand | null
}

export function EmbeddedDcfControls({
  adaptiveDcfGlobalStep,
  dcfDefaultsProvenance,
  dcfForecastDefaultsStep,
  dcfForecastRows,
  dcfForecastWorkspaceStep,
  dcfModeSegmentOptions,
  dcfProjectionAutofillRows,
  dcfSmartDefaultsFromHistory,
  dcfWaccTerminalStep,
  fieldValidation,
  formData,
  handleDcfInputModeChange,
  handleTerminalValueMethodChange,
  hasDcfSelected,
  integrationDerivedCapexPct,
  integrationDerivedDaPct,
  isCalculating,
  latestHistoricalEbitda,
  latestHistoricalRevenue,
  setFormData,
  setShowForecastRemovalConfirm,
  terminalValueMethod,
  updateYearlyFinancials,
  waccSectorBand,
}: EmbeddedDcfControlsProps) {
  const handleDcfFieldChange = useCallback(
    (field: string, value: number | undefined) => {
      setFormData((prev) => {
        const previousValue = prev[field as keyof ManualValuationFormData]
        if (Object.is(previousValue, value)) return prev
        return { ...prev, [field]: value }
      })
    },
    [setFormData]
  )
  const handleDcfDiscountingConventionChange = useCallback(
    (convention: 'mid_year' | 'year_end') => {
      setFormData((prev) => {
        if (prev.dcf_discounting_convention === convention) return prev
        return { ...prev, dcf_discounting_convention: convention }
      })
    },
    [setFormData]
  )

  if (!(hasDcfSelected && dcfForecastRows.length > 0)) return null

  const showGlobalAssumptions = adaptiveDcfGlobalStep != null

  return (
    <>
      {showGlobalAssumptions && (
        <Suspense fallback={<BonusSectionFallback />}>
          <DcfGlobalAssumptionsSectionStack
            key="dcf_forecast_defaults_embedded"
            variant="forecastDefaultsOnly"
            className="mt-6 rounded-xl border border-primary/10 bg-primary/[0.03] p-4 sm:p-5"
            step={dcfForecastDefaultsStep}
            formData={formData}
            terminalValueMethod={terminalValueMethod}
            onTerminalValueMethodChange={handleTerminalValueMethodChange}
            onDiscountingConventionChange={handleDcfDiscountingConventionChange}
            onFieldChange={handleDcfFieldChange}
            showDcfInputModeToggle
            dcfModeSegmentOptions={dcfModeSegmentOptions}
            onDcfInputModeChange={handleDcfInputModeChange}
            disabled={isCalculating}
            dcfDefaultsProvenance={dcfDefaultsProvenance}
            smartDefaults={dcfSmartDefaultsFromHistory}
            integrationCapexPct={integrationDerivedCapexPct}
            integrationDaPct={integrationDerivedDaPct}
            waccSectorBand={waccSectorBand}
          />
        </Suspense>
      )}

      <Suspense fallback={<BonusSectionFallback />}>
        <DcfForecastWorkspaceSectionStack
          step={dcfForecastWorkspaceStep}
          formData={formData}
          forecastRows={dcfForecastRows}
          projectionAutofillRows={dcfProjectionAutofillRows}
          fieldValidation={fieldValidation}
          onDcfInputModeChange={handleDcfInputModeChange}
          setFormData={setFormData}
          setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
          updateYearlyFinancials={updateYearlyFinancials}
          disabled={isCalculating}
          latestHistoricalRevenue={latestHistoricalRevenue}
          latestHistoricalEbitda={latestHistoricalEbitda}
        />
      </Suspense>

      {showGlobalAssumptions && (
        <Suspense fallback={<BonusSectionFallback />}>
          <DcfGlobalAssumptionsSectionStack
            key="dcf_discount_terminal_embedded"
            variant="discountTerminalOnly"
            className="mt-4"
            step={dcfWaccTerminalStep}
            formData={formData}
            terminalValueMethod={terminalValueMethod}
            onTerminalValueMethodChange={handleTerminalValueMethodChange}
            onDiscountingConventionChange={handleDcfDiscountingConventionChange}
            onFieldChange={handleDcfFieldChange}
            disabled={isCalculating}
            smartDefaults={dcfSmartDefaultsFromHistory}
            integrationCapexPct={integrationDerivedCapexPct}
            integrationDaPct={integrationDerivedDaPct}
            waccSectorBand={waccSectorBand}
          />
        </Suspense>
      )}
    </>
  )
}
