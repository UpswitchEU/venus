'use client'

import { Check, Copy, Loader2, Mail, Send, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { toast } from 'sonner'
import { AuroraButton } from '@/design-system'
import { Modal, ModalContent } from '@/design-system/components/Modal'
import { getApiUrl } from '@/utils/getMercuryUrl'

export interface InviteClientModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId?: string
  clientEmail?: string
  clientName?: string
  companyName?: string
  reportId?: string
}

export function InviteClientModal({
  open,
  onOpenChange,
  clientId,
  clientEmail: initialEmail,
  clientName,
  companyName,
  reportId,
}: InviteClientModalProps) {
  const t = useTranslations()
  const [email, setEmail] = useState(initialEmail || '')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [isSent, setIsSent] = useState(false)
  const [invitationUrl, setInvitationUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSend = useCallback(async () => {
    if (!email || !clientId) return
    setIsSending(true)

    try {
      const API_URL = getApiUrl()
      const res = await fetch(`${API_URL}/api/v2/accountants/clients/${clientId}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer_email: email,
          custom_message: message || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.message || 'Failed to send invitation')
      }

      const data = await res.json()
      setInvitationUrl(data.invitation_url || null)
      setIsSent(true)
      toast.success(t('invite.sentSuccess'))
    } catch (error: any) {
      toast.error(error.message || t('invite.sentError'))
    } finally {
      setIsSending(false)
    }
  }, [email, clientId, message, t])

  const handleCopyLink = useCallback(async () => {
    if (!invitationUrl) return
    try {
      await navigator.clipboard.writeText(invitationUrl)
      setCopied(true)
      toast.success(t('invite.linkCopied'))
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('invite.copyFailed'))
    }
  }, [invitationUrl, t])

  const handleClose = useCallback(() => {
    onOpenChange(false)
    setTimeout(() => {
      setIsSent(false)
      setInvitationUrl(null)
      setCopied(false)
      setMessage('')
      if (!initialEmail) setEmail('')
    }, 300)
  }, [onOpenChange, initialEmail])

  return (
    <Modal open={open} onOpenChange={handleClose}>
      <ModalContent
        size="md"
        variant="default"
        showClose={false}
        className="max-w-lg"
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Send className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-foreground">
                  {t('invite.title')}
                </h2>
                <p className="text-sm text-foreground/60">
                  {companyName
                    ? t('invite.subtitleWithCompany', { company: companyName })
                    : t('invite.subtitle')}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg text-foreground/40 hover:text-foreground hover:bg-foreground/[0.04] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {isSent ? (
            /* Success State */
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-success/10 flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-success" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                {t('invite.sentTitle')}
              </h3>
              <p className="text-sm text-foreground/60 mb-6">
                {t('invite.sentDescription', { email })}
              </p>

              {invitationUrl && (
                <div className="mb-6">
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-foreground/[0.03] border border-foreground/[0.06]">
                    <input
                      type="text"
                      readOnly
                      value={invitationUrl}
                      className="flex-1 text-xs text-foreground/60 bg-transparent outline-none truncate"
                    />
                    <button
                      onClick={handleCopyLink}
                      className="shrink-0 p-2 rounded-lg text-foreground/50 hover:text-foreground hover:bg-foreground/[0.06] transition-colors"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-success" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <AuroraButton variant="secondary" size="sm" onClick={handleClose}>
                {t('common.close')}
              </AuroraButton>
            </div>
          ) : (
            /* Form State */
            <div className="space-y-4">
              {clientName && (
                <div className="px-3 py-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/[0.06]">
                  <p className="text-xs text-foreground/50 mb-0.5">{t('invite.client')}</p>
                  <p className="text-sm font-medium text-foreground">{clientName}</p>
                </div>
              )}

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  {t('invite.emailLabel')}
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t('invite.emailPlaceholder')}
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">
                  {t('invite.messageLabel')}
                  <span className="text-foreground/40 font-normal ml-1">
                    ({t('common.optional')})
                  </span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={t('invite.messagePlaceholder')}
                  rows={3}
                  className="w-full px-4 py-2.5 rounded-lg bg-foreground/[0.03] border border-foreground/[0.08] text-sm text-foreground placeholder:text-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <AuroraButton variant="ghost" size="sm" onClick={handleClose}>
                  {t('common.cancel')}
                </AuroraButton>
                <AuroraButton
                  variant="primary"
                  size="sm"
                  onClick={handleSend}
                  disabled={!email || !clientId || isSending}
                  className="gap-1.5"
                >
                  {isSending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {t('invite.sendButton')}
                </AuroraButton>
              </div>
            </div>
          )}
        </div>
      </ModalContent>
    </Modal>
  )
}

export default InviteClientModal
