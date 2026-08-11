'use client'

/**
 * AdvisorControlsTrigger
 *
 * Single in-flow entry point to the advanced advisor controls modal.
 * Lives where step 4a used to be in the wizard. The kebab item on the
 * active valuation in `CalculatorNav` is the second entry point; both
 * drive the same `useAdvisorControlsModalStore` open state.
 *
 * Designed as the "minimal seam" replacement for the old inline section:
 *  • Trigger is a plain Button — no chip / no preview values — per the
 *    "Just a button" UX call so the wizard's data-entry surface stays
 *    visually quiet.
 *  • A tiny sparkles pill is appended only when the advisor's saved
 *    defaults have already pre-applied to the form. That single signal
 *    tells returning advisors "your house style is already in" without
 *    forcing them to open the modal to check.
 *  • The modal is mounted here (inside the wizard tree) because it needs
 *    access to the form state. The store only mediates open/close; the
 *    form data still flows through the existing props.
 */

import { SlidersHorizontal, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type Dispatch, type SetStateAction, useEffect } from 'react'
import { Badge } from '../../../design-system/components/Badge'
import { AuroraButton } from '../../../design-system/components/Button'
import { Tooltip } from '../../../design-system/components/Tooltip'
import { useAdvisorControlsModalStore } from '../../../store/useAdvisorControlsModalStore'
import type { ManualValuationFormData } from '../../../types/valuation'
import { AdvancedAdvisorControlsModal } from './AdvancedAdvisorControlsModal'

export type AdvisorDefaultAppliedField =
  | 'multiple_calibration_adjustment'
  | 'historical_ebitda_weighting_mode'
  | 'show_enterprise_to_equity_bridge'

export interface AdvisorControlsTriggerProps {
  advisorDefaultsAppliedFields?: ReadonlyArray<AdvisorDefaultAppliedField>
  sectorAverageMultiple: number | null
  previewEbitda?: number | null
  previewCurrencyFormatter?: Intl.NumberFormat
  advisorWeightingYears: number[]
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  disabled: boolean
  className?: string
}

export function AdvisorControlsTrigger({
  advisorDefaultsAppliedFields,
  sectorAverageMultiple,
  previewEbitda,
  previewCurrencyFormatter,
  advisorWeightingYears,
  formData,
  setFormData,
  disabled,
  className = 'mt-4 flex flex-wrap items-center gap-2',
}: AdvisorControlsTriggerProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')
  const open = useAdvisorControlsModalStore((s) => s.open)
  const setOpen = useAdvisorControlsModalStore((s) => s.setOpen)
  const prefilled = (advisorDefaultsAppliedFields?.length ?? 0) > 0

  // Reset the shared modal-open atom whenever this trigger unmounts.
  //
  // The trigger is mounted inside the wizard tree under a `key={reportId}`
  // boundary (ManualLayoutBody). When the advisor switches between
  // valuations in the sidebar, React unmounts the trigger and re-mounts a
  // fresh one with the new valuation's formData. Without this cleanup the
  // store's `open=true` would survive the unmount and the new trigger
  // would immediately reopen the modal — except now it would render the
  // *new* valuation's calibration data, which is jarring and would let an
  // advisor accidentally edit the wrong deal's premium.
  //
  // Resetting on unmount only fires on actual unmount (valuation switch,
  // navigation away). Normal in-place re-renders during interaction
  // (typing, toggling, save) do not unmount the trigger and so leave the
  // modal state alone. Acceptable strict-mode caveat: in dev the initial
  // double-invoke runs cleanup once before the user has interacted, so
  // open=false → setOpen(false) is a no-op.
  useEffect(() => {
    return () => {
      useAdvisorControlsModalStore.getState().setOpen(false)
    }
  }, [])

  return (
    <div className={className}>
      {/*
       * AuroraButton variant="outline" matches the Aurora Clarity medium-
       * emphasis affordance: low-key in the wizard data flow, but reads
       * as actionable. The bordered surface deliberately mirrors the
       * Mercury settings tab's secondary controls so an advisor moving
       * between Mercury and Venus sees the same visual grammar for "open
       * a configuration surface."
       */}
      <AuroraButton
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="advisor-controls-trigger"
        // Override default `gap-2` from the variant base so the hint
        // text hugs the label more tightly than the icon, reading as
        // "label — hint" rather than three peer segments.
        className="!gap-1.5"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/55" aria-hidden />
        <span>{t('openModalButton')}</span>
        <span className="text-xs text-foreground/45">— {t('openModalButtonHint')}</span>
      </AuroraButton>

      {/*
       * Badge variant="primary" earns the primary accent because the
       * pill is the single signal returning advisors need to know their
       * house-style baseline is already applied — high-information,
       * deserves the eye. size="sm" keeps it from overpowering the
       * button it adjoins.
       *
       * Wrapped in DS Tooltip (was `title=` attr) so the long
       * NL "Vooraf ingevuld vanuit uw kantoor-standaard..." copy gets
       * proper a11y semantics, a tuned hover delay, and the Aurora
       * surface treatment instead of the OS native chrome.
       */}
      {prefilled && (
        <Tooltip content={t('prefilledFromSettings')} side="top">
          <Badge
            variant="primary"
            size="sm"
            data-testid="advisor-controls-prefilled-pill"
            className="rounded-full gap-1 cursor-default"
          >
            <Sparkles className="h-3 w-3" aria-hidden />
            {t('prefilledFromSettingsLink')}
          </Badge>
        </Tooltip>
      )}

      <AdvancedAdvisorControlsModal
        open={open}
        onOpenChange={setOpen}
        sectorAverageMultiple={sectorAverageMultiple}
        previewEbitda={previewEbitda}
        previewCurrencyFormatter={previewCurrencyFormatter}
        multipleCalibrationAdjustment={formData.multiple_calibration_adjustment}
        multipleCalibrationNote={formData.multiple_calibration_note}
        effectiveMultipleOverride={formData.effective_multiple_override}
        effectiveMultipleOverrideNote={formData.effective_multiple_override_note}
        businessTypeSegments={formData.business_type_segments}
        multipleTypeWeights={formData.multiple_type_weights}
        riskAnalysisEnabled={formData.risk_analysis_enabled}
        advisorDiscountWeights={formData.advisor_discount_weights}
        discountFloorFactor={formData.discount_floor_factor}
        historicalYears={advisorWeightingYears}
        historicalEbitdaWeightingMode={formData.historical_ebitda_weighting_mode}
        historicalEbitdaWeights={formData.historical_ebitda_weights}
        showEnterpriseToEquityBridge={formData.show_enterprise_to_equity_bridge}
        allowUntrustedMultiplesFallback={formData.allow_untrusted_multiples_fallback}
        untrustedMultiplesFallbackReason={formData.untrusted_multiples_fallback_reason}
        advisorDefaultsAppliedFields={advisorDefaultsAppliedFields}
        onFieldChange={(field, value) => {
          setFormData((prev) => ({ ...prev, [field]: value }))
        }}
        disabled={disabled}
      />
    </div>
  )
}
