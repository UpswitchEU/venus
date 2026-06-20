'use client'

import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import { buildAgentToolActionHeaders, extractErrorMessage } from '../agent-action-cards/shared'

const INVITE_ACCOUNTANT_MAX_LENGTH = 500
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type InviteStatus = 'idle' | 'expanded' | 'sending' | 'sent'

/**
 * BET-317 — in-form "invite my accountant" affordance for the financials step.
 *
 * The proactive, in-form mirror of the reactive chat card `OwnerInviteAccountantCard`:
 * an owner who can't fill the figures themselves enters their accountant's email and we
 * send a magic link (connect the tool or type the figures) — keeping the owner in the
 * funnel instead of bouncing to "go ask my accountant and come back". Reuses the
 * existing invite BFF endpoint + agent-tool headers; once sent, shows a "we'll notify
 * you" state. Server enforces auth/validation; this is a thin, self-contained surface.
 */
export function InviteAccountantInline() {
  const t = useTranslations('manualInput.inviteAccountant')
  const [status, setStatus] = useState<InviteStatus>('idle')
  const [email, setEmail] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sentEmail, setSentEmail] = useState('')

  const trimmedEmail = email.trim().toLowerCase()
  const trimmedNote = note.trim()
  const invalidEmail = trimmedEmail.length > 0 && !EMAIL_REGEX.test(trimmedEmail)
  const tooLong = trimmedNote.length > INVITE_ACCOUNTANT_MAX_LENGTH

  const submit = async () => {
    if (trimmedEmail.length === 0) {
      setError(t('missingEmail'))
      return
    }
    if (invalidEmail) {
      setError(t('invalidEmail'))
      return
    }
    if (tooLong) {
      setError(t('tooLong', { max: INVITE_ACCOUNTANT_MAX_LENGTH }))
      return
    }
    setError(null)
    setStatus('sending')
    try {
      const body: Record<string, unknown> = { accountant_email: trimmedEmail, surface: 'card' }
      if (trimmedNote.length > 0) body.custom_message = trimmedNote
      const response = await fetch('/api/client/orphaned-seller/invite-accountant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...buildAgentToolActionHeaders('propose_owner_invite_accountant'),
        },
        credentials: 'include',
        body: JSON.stringify(body),
      })
      const json: unknown = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
      setSentEmail(trimmedEmail)
      setStatus('sent')
    } catch (err) {
      setStatus('expanded')
      setError(err instanceof Error ? err.message : t('genericError'))
    }
  }

  if (status === 'sent') {
    return (
      <div className="ml-8 flex items-start gap-2.5 rounded-xl border border-success/20 bg-success/[0.04] px-3 py-2.5">
        <Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs font-medium text-foreground">{t('sentTitle')}</p>
          <p className="text-[11px] leading-snug text-foreground/70">
            {t('sentBody', { email: sentEmail })}
          </p>
        </div>
      </div>
    )
  }

  if (status === 'idle') {
    return (
      <div className="ml-8 flex flex-wrap items-center gap-3 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-3 py-2.5">
        <p className="min-w-0 flex-1 text-xs leading-snug text-foreground/70">{t('prompt')}</p>
        <AuroraButton
          type="button"
          variant="secondary"
          size="sm"
          className="shrink-0"
          onClick={() => setStatus('expanded')}
        >
          {t('cta')}
        </AuroraButton>
      </div>
    )
  }

  const isSending = status === 'sending'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="ml-8 space-y-2.5 rounded-xl border border-primary/15 bg-primary/[0.04] px-3 py-3"
    >
      <div className="space-y-0.5">
        <p className="text-xs font-medium text-foreground">{t('title')}</p>
        <p className="text-[11px] leading-snug text-foreground/65">{t('description')}</p>
      </div>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-foreground/60">{t('emailLabel')}</span>
        <input
          type="email"
          value={email}
          placeholder={t('emailPlaceholder')}
          disabled={isSending}
          onChange={(event) => setEmail(event.target.value)}
          className={cn(
            'w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
            invalidEmail ? 'border-destructive/50' : 'border-foreground/[0.12]'
          )}
        />
      </label>
      <label className="block space-y-1">
        <span className="text-[11px] font-medium text-foreground/60">{t('messageLabel')}</span>
        <textarea
          value={note}
          rows={2}
          maxLength={INVITE_ACCOUNTANT_MAX_LENGTH + 50}
          placeholder={t('messagePlaceholder')}
          disabled={isSending}
          onChange={(event) => setNote(event.target.value)}
          className={cn(
            'w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
            tooLong ? 'border-destructive/50' : 'border-foreground/[0.12]'
          )}
        />
      </label>
      {error && <p className="text-[10px] text-destructive">{error}</p>}
      <div className="flex items-center gap-2">
        <AuroraButton
          type="button"
          variant="primary"
          size="sm"
          loading={isSending}
          loadingScreenReaderLabel={t('sending')}
          onClick={() => void submit()}
        >
          {t('send')}
        </AuroraButton>
        <AuroraButton
          type="button"
          variant="ghost"
          size="sm"
          disabled={isSending}
          onClick={() => {
            setStatus('idle')
            setError(null)
          }}
        >
          {t('cancel')}
        </AuroraButton>
      </div>
    </motion.div>
  )
}
