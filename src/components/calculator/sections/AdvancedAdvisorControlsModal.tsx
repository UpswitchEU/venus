'use client'

/**
 * Advanced Advisor Controls — Modal host
 *
 * Per design 2026-05-23: the calibration/weighting/waterfall controls are
 * *per-valuation modelling decisions*, not data inputs, and were promoted
 * out of the left-panel data flow into a centered modal triggered from a
 * single "Calibratie & weging" button in the wizard (and from the kebab
 * menu next to the active valuation in the sidebar). This component is the
 * shell — it owns nothing about the form; it just frames the existing
 * AdvancedAdvisorControlsSection in `chrome='bare'` mode so the section
 * does not paint a redundant header.
 *
 * Saves are implicit (the inner controls call `onFieldChange` directly into
 * the form store), so the modal close button is the explicit dismiss.
 */

import { useTranslations } from 'next-intl'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '../../../design-system/components/Modal'
import {
  AdvancedAdvisorControlsSection,
  type AdvancedAdvisorControlsSectionProps,
} from './AdvancedAdvisorControlsSection'

interface AdvancedAdvisorControlsModalProps
  extends Omit<AdvancedAdvisorControlsSectionProps, 'chrome' | 'step'> {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AdvancedAdvisorControlsModal({
  open,
  onOpenChange,
  ...controlProps
}: AdvancedAdvisorControlsModalProps) {
  const t = useTranslations('manualInput.methodSelector.advancedAdvisorControls')

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        size="xl"
        description={t('modalDescription')}
        // Wider than `xl`'s default fixed cap so the calibration + year
        // sliders breathe on tablet widths; still constrained on desktop.
        className="max-h-[90vh] overflow-y-auto"
      >
        <ModalHeader>
          <ModalTitle>{t('title')}</ModalTitle>
          <p className="text-sm text-foreground/60">{t('modalDescription')}</p>
        </ModalHeader>

        <AdvancedAdvisorControlsSection
          {...controlProps}
          chrome="bare"
          // Step number is unused in 'bare' chrome but the prop is required;
          // pass an empty string to keep the type contract minimal.
          step=""
        />
      </ModalContent>
    </Modal>
  )
}
