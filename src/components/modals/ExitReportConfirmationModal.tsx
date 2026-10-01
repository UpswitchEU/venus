import { AlertTriangle, Home, Save } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { type RefObject, useId, useRef } from 'react'
import { Modal, ModalContent, ModalTitle } from '@/design-system/components/Modal'

interface ExitReportConfirmationModalProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  onSaveAndExit?: () => void
  hasUnsavedChanges: boolean
  hasValuationResults: boolean
  isSaving?: boolean
  saveFailed?: boolean
  returnFocusRef?: RefObject<HTMLElement | null>
}

export function ExitReportConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  onSaveAndExit,
  hasUnsavedChanges,
  hasValuationResults,
  isSaving = false,
  saveFailed = false,
  returnFocusRef,
}: ExitReportConfirmationModalProps) {
  const t = useTranslations('modals.exit')
  const descriptionId = useId()
  const cancelRef = useRef<HTMLButtonElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const showSaveOption = Boolean((hasUnsavedChanges || saveFailed) && onSaveAndExit)
  const title = showSaveOption ? t('titleSave') : t('title')
  const message = showSaveOption
    ? t('messageUnsaved')
    : hasValuationResults
      ? t('messageWithResults')
      : t('message')
  const buttonClass =
    'min-h-11 rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <Modal open={isOpen} onOpenChange={(open) => !open && !isSaving && onClose()}>
      <ModalContent
        showClose={false}
        aria-describedby={descriptionId}
        aria-busy={isSaving || undefined}
        className="w-[calc(100vw-2rem)] max-h-[calc(100dvh-2rem)] overflow-y-auto"
        onOpenAutoFocus={(event) => {
          previousFocusRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null
          event.preventDefault()
          cancelRef.current?.focus()
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          const target = returnFocusRef?.current ?? previousFocusRef.current
          if (target?.isConnected) target.focus()
        }}
        onEscapeKeyDown={(event) => {
          if (isSaving) event.preventDefault()
        }}
        onInteractOutside={(event) => {
          if (isSaving) event.preventDefault()
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
            aria-hidden="true"
          >
            {showSaveOption ? <Save className="size-5" /> : <AlertTriangle className="size-5" />}
          </div>
          <ModalTitle>{title}</ModalTitle>
        </div>
        <p id={descriptionId} className="mt-5 leading-relaxed text-foreground">
          {message}
        </p>
        {showSaveOption && (
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{t('saveNote')}</p>
        )}
        {saveFailed && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground"
          >
            {t('saveFailed')}
          </p>
        )}
        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className={`${buttonClass} border border-foreground/15 text-foreground hover:bg-muted`}
          >
            {t('cancel')}
          </button>
          {showSaveOption && (
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSaving}
              className={`${buttonClass} text-muted-foreground hover:bg-muted hover:text-foreground`}
            >
              {t('exitWithoutSaving')}
            </button>
          )}
          <button
            type="button"
            onClick={showSaveOption ? onSaveAndExit : onConfirm}
            disabled={isSaving}
            aria-busy={isSaving || undefined}
            className={`${buttonClass} flex items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 ${showSaveOption ? 'sm:col-span-2' : ''}`}
          >
            {isSaving ? (
              <span
                className="size-4 shrink-0 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : showSaveOption ? (
              <Save className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <Home className="size-4 shrink-0" aria-hidden="true" />
            )}
            <span>{isSaving ? t('saving') : showSaveOption ? t('saveAndExit') : t('confirm')}</span>
          </button>
        </div>
      </ModalContent>
    </Modal>
  )
}
