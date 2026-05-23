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
  advisorWeightingYears: number[]
  formData: ManualValuationFormData
  setFormData: Dispatch<SetStateAction<ManualValuationFormData>>
  disabled: boolean
}

export function AdvisorControlsTrigger({
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
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        data-testid="advisor-controls-trigger"
        className="inline-flex items-center gap-2 rounded-lg border border-foreground/15 bg-foreground/[0.02] px-3 py-2 text-sm font-medium text-foreground/85 transition-colors hover:bg-foreground/[0.06] hover:border-foreground/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-foreground/55" aria-hidden />
        {t('openModalButton')}
        <span className="text-xs text-foreground/45">— {t('openModalButtonHint')}</span>
      </button>

      {prefilled && (
        <span
          data-testid="advisor-controls-prefilled-pill"
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
