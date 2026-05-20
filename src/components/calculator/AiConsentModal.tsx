'use client'

import { motion } from 'framer-motion'
import { Loader2, ShieldCheck, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'

interface AiConsentModalProps {
  open: boolean
  error?: string | null
  isSubmitting?: boolean
  isLoading?: boolean
  policyVersion?: string | null
  onClose: () => void
  onAgree: () => void | Promise<void>
}

export function AiConsentModal({
  open,
  error,
  isSubmitting = false,
  isLoading = false,
  policyVersion,
  onClose,
  onAgree,
}: AiConsentModalProps) {
  const ca = useTranslations('chatAssistant')

  if (!open) return null

  const bullets = [
    ca('aiConsent.bulletAmounts'),
    ca('aiConsent.bulletNames'),
    ca('aiConsent.bulletIdentifiers'),
    ca('aiConsent.bulletAudit'),
    ca('aiConsent.bulletRevoke'),
  ]

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="ai-consent-modal-title"
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/45 p-3 sm:items-center sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className={cn(
          'w-full max-w-lg rounded-2xl bg-background p-5 shadow-2xl',
          'border border-foreground/[0.08]'
        )}
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="ai-consent-modal-title" className="text-base font-semibold text-foreground">
              {ca('aiConsent.title')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground/65">
              {ca('aiConsent.subhead')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-foreground/40 transition-colors hover:bg-foreground/[0.04] hover:text-foreground/70 disabled:opacity-50"
            aria-label={ca('close')}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-foreground/80">{ca('aiConsent.intro')}</p>

        <div className="mt-4 border-t border-foreground/[0.08] pt-4">
          <p className="text-xs font-medium uppercase text-foreground/45">
            {ca('aiConsent.privacyTitle')}
          </p>
          <ul className="mt-2 space-y-2">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-2 text-sm leading-relaxed text-foreground/75">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/70" />
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </div>

        {policyVersion ? (
          <p className="mt-3 text-xs text-foreground/45">
            {ca('aiConsent.policyLine')}: <code>{policyVersion}</code>
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {ca('aiConsent.errorLine')}
          </p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-lg px-3 py-2 text-sm text-foreground/60 transition-colors hover:bg-foreground/[0.04] hover:text-foreground disabled:opacity-50"
          >
            {ca('aiConsent.cancelLabel')}
          </button>
          <button
            type="button"
            onClick={() => void onAgree()}
            disabled={isSubmitting || isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {isSubmitting || isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShieldCheck className="h-4 w-4" />
            )}
            {ca('aiConsent.agreeLabel')}
          </button>
        </div>
      </motion.div>
    </div>
  )
}
