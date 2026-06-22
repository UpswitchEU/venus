'use client'

import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system/components/Modal'
import {
  resolveValuationEditEmptyState,
  type ValuationEditMethodDataLoadError,
  type ValuationEditTranslationSource,
} from './ValuationEditModalModel'

interface ValuationEditModalEmptyStateProps {
  open: boolean
  onClose: () => void
  isHydratingMethods: boolean
  methodDataLoadError: ValuationEditMethodDataLoadError
  onRetryMethodDataLoad?: () => void
  onContinueImportReview?: () => void
}

function translateEmptyStateCopy(
  source: ValuationEditTranslationSource,
  key: string,
  tModal: ReturnType<typeof useTranslations>,
  tOmni: ReturnType<typeof useTranslations>
): string {
  return source === 'modal'
    ? tModal(key as Parameters<typeof tModal>[0])
    : tOmni(key as Parameters<typeof tOmni>[0])
}

export function ValuationEditModalEmptyState({
  open,
  onClose,
  isHydratingMethods,
  methodDataLoadError,
  onRetryMethodDataLoad,
  onContinueImportReview,
}: ValuationEditModalEmptyStateProps) {
  const t = useTranslations('omniCalc')
  const tModal = useTranslations('valuationEditModal')
  const emptyState = resolveValuationEditEmptyState({
    isHydratingMethods,
    methodDataLoadError,
    hasImportReviewRecovery: Boolean(onContinueImportReview),
  })

  const title = translateEmptyStateCopy(emptyState.titleSource, emptyState.titleKey, tModal, t)
  const blurb = translateEmptyStateCopy(emptyState.blurbSource, emptyState.blurbKey, tModal, t)

  return (
    <Modal open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <ModalContent
        size="2xl"
        description={tModal('description')}
        className="max-h-[92vh] flex flex-col overflow-hidden"
      >
        <ModalHeader className="shrink-0">
          <ModalTitle>{tModal('title')}</ModalTitle>
        </ModalHeader>
        <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-4 py-5 text-center space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            {title}
          </p>
          <p className="text-[11px] leading-snug text-foreground/50">{blurb}</p>
          {emptyState.showImportReviewRecovery && onContinueImportReview ? (
            <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                className="text-xs"
                disabled={isHydratingMethods}
                onClick={onContinueImportReview}
              >
                {tModal('continueImportReview')}
              </AuroraButton>
              {onRetryMethodDataLoad ? (
                <AuroraButton
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="text-xs"
                  disabled={isHydratingMethods}
                  onClick={onRetryMethodDataLoad}
                >
                  {tModal('retryMethodDataLoad')}
                </AuroraButton>
              ) : null}
            </div>
          ) : emptyState.showRetry && onRetryMethodDataLoad ? (
            <AuroraButton
              type="button"
              variant="primary"
              size="sm"
              className="text-xs"
              disabled={isHydratingMethods}
              onClick={onRetryMethodDataLoad}
            >
              {tModal('retryMethodDataLoad')}
            </AuroraButton>
          ) : null}
        </div>
      </ModalContent>
    </Modal>
  )
}
