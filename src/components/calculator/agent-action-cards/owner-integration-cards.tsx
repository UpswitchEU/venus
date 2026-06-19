'use client'

import { Bell, Link2, Mail, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { cn } from '@/design-system/utils'
import type {
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  SyncStatusPreview,
} from '../ChatAssistantTypes'
import {
  buildAgentToolActionHeaders,
  compactParts,
  extractErrorMessage,
  InlineActionCard,
  mercuryPath,
  OWNER_REMINDER_MAX_LENGTH,
  openInNewTab,
  providerLabel,
  stringifyActionValue,
} from './shared'

const OWNER_INVITE_ACCOUNTANT_MAX_LENGTH = 500
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function OwnerProfileCard({ request }: { request: OwnerProfileAnswerRequest }) {
  const ca = useTranslations('chatAssistant')
  const value = stringifyActionValue(request.value)
  const title = request.complete
    ? ca('proposalCards.agent.ownerProfileTitleComplete')
    : ca('proposalCards.agent.ownerProfileTitle')
  const label = request.label ?? request.field

  return (
    <InlineActionCard
      id={request.id}
      title={title}
      detail={compactParts([label, value]).join(' · ') || request.reason}
      meta={compactParts([request.reason])}
      actionLabel={ca('proposalCards.agent.ownerProfileAction')}
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={async () => {
        if (!request.field) throw new Error(ca('proposalCards.agent.missingField'))
        const body: Record<string, unknown> = { [request.field]: request.value }
        if (request.accountantCustomerId) body.accountantCustomerId = request.accountantCustomerId
        if (request.complete === true) body.complete = true
        const response = await fetch('/api/profile/owner-assessment', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...buildAgentToolActionHeaders('update_owner_profile_answer', request.id),
          },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json: unknown = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
      }}
    />
  )
}

export function IntegrationCard({ request }: { request: IntegrationConnectRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const provider = providerLabel(request.provider)
  const authMode =
    request.authMode === 'oauth'
      ? ca('proposalCards.agent.oauth')
      : request.authMode === 'api_key'
        ? ca('proposalCards.agent.apiKey')
        : null

  return (
    <InlineActionCard
      id={request.id}
      title={
        provider
          ? ca('proposalCards.agent.integrationTitleWithProvider', { provider })
          : ca('proposalCards.agent.integrationTitle')
      }
      detail={request.message ?? request.reason}
      meta={compactParts([authMode, request.targetContext ?? undefined])}
      icon={<Link2 className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.integrationAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={async () => {
        openInNewTab(
          mercuryPath(locale, '/advisor/settings', {
            tab: 'integrations',
            source: 'venus_chat',
            accounting_provider: request.provider,
          })
        )
      }}
    />
  )
}

export function IntegrationSyncCard({ request }: { request: IntegrationSyncRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const provider = providerLabel(request.provider)
  const isClientScope = request.scope === 'client_scope'

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.integrationSyncBlocked')
          : provider
            ? ca('proposalCards.agent.integrationSyncTitleWithProvider', { provider })
            : ca('proposalCards.agent.integrationSyncTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([
        isClientScope
          ? ca('proposalCards.agent.integrationSyncScopeClient')
          : ca('proposalCards.agent.integrationSyncScopeProvider'),
        request.clientId,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<RefreshCw className="h-3.5 w-3.5" />}
      actionLabel={
        isClientScope
          ? ca('proposalCards.agent.integrationSyncAction')
          : ca('proposalCards.agent.integrationSyncProviderAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.integrationSyncStarted')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (isClientScope && request.clientId) {
                const response = await fetch(
                  `/api/integrations/accounting/resync-client/${encodeURIComponent(
                    request.clientId
                  )}`,
                  {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      ...buildAgentToolActionHeaders('propose_integration_sync', request.id),
                    },
                    credentials: 'include',
                    body: JSON.stringify({ force: true }),
                  }
                )
                const json: unknown = await response.json().catch(() => ({}))
                if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
                return
              }

              if (!request.provider) throw new Error(ca('proposalCards.agent.missingProvider'))
              const response = await fetch(
                `/api/integrations/accounting/sync-provider/${encodeURIComponent(
                  request.provider
                )}`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_integration_sync', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ chain_to_bulk: false }),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

export function SyncStatusPreviewCard({ preview }: { preview: SyncStatusPreview }) {
  const locale = useLocale()
  const isFailed = preview.status === 'failed'
  const isEn = locale === 'en'

  const copy = isEn
    ? {
        title: isFailed ? 'Sync status unavailable' : 'Accounting sync status',
        connected: 'connected',
        notConnected: 'not connected',
        inProgress: 'sync in progress',
        lastSync: 'Last sync',
        never: 'never',
        justNow: 'just now',
        empty: 'No accounting integrations connected yet.',
        clientsLabel: (n: number) => `${n} client${n === 1 ? '' : 's'}`,
      }
    : {
        title: isFailed ? 'Synchronisatiestatus niet beschikbaar' : 'Status boekhoudkoppelingen',
        connected: 'gekoppeld',
        notConnected: 'niet gekoppeld',
        inProgress: 'synchronisatie bezig',
        lastSync: 'Laatste sync',
        never: 'nooit',
        justNow: 'zojuist',
        empty: 'Nog geen boekhoudkoppelingen actief.',
        clientsLabel: (n: number) => `${n} klant${n === 1 ? '' : 'en'}`,
      }

  const formatRelative = (iso: string | null): string => {
    if (!iso) return copy.never
    const synced = new Date(iso).getTime()
    if (!Number.isFinite(synced)) return '—'
    const diffMs = Date.now() - synced
    if (diffMs < 60_000) return copy.justNow
    const minutes = Math.round(diffMs / 60_000)
    if (minutes < 60) return isEn ? `${minutes}m ago` : `${minutes} min geleden`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return isEn ? `${hours}h ago` : `${hours} u geleden`
    const days = Math.round(hours / 24)
    if (days < 30) return isEn ? `${days}d ago` : `${days} d geleden`
    return new Date(iso).toLocaleDateString(isEn ? 'en-BE' : 'nl-BE')
  }

  const connectedRows = preview.providers.filter((p) => p.connected)
  const disconnectedRows = preview.providers.filter((p) => !p.connected)

  return (
    <InlineActionCard
      id={preview.id}
      title={copy.title}
      detail={preview.message}
      icon={<RefreshCw className="h-3.5 w-3.5" />}
      tone={isFailed ? 'blocked' : 'default'}
    >
      {preview.providers.length === 0 ? (
        <p className="text-foreground/50 italic">{copy.empty}</p>
      ) : (
        <div className="space-y-1.5">
          {connectedRows.map((p) => {
            const provider = providerLabel(p.provider) ?? p.provider
            return (
              <div key={p.provider} className="rounded-md bg-foreground/[0.035] px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-foreground/80">{provider}</span>
                  <span
                    className={cn(
                      'shrink-0 rounded-full px-1.5 py-0.5 text-[10px]',
                      p.syncInProgress
                        ? 'bg-primary/15 text-primary'
                        : 'bg-success/10 text-success/90'
                    )}
                  >
                    {p.syncInProgress ? copy.inProgress : copy.connected}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-foreground/55">
                  <span>
                    {copy.lastSync}: {formatRelative(p.lastSyncAt)}
                  </span>
                  {p.clientCount != null ? <span>{copy.clientsLabel(p.clientCount)}</span> : null}
                </div>
                {p.error ? <p className="text-destructive mt-1 text-[11px]">{p.error}</p> : null}
              </div>
            )
          })}
          {disconnectedRows.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {disconnectedRows.map((p) => {
                const provider = providerLabel(p.provider) ?? p.provider
                return (
                  <span
                    key={p.provider}
                    className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/45"
                  >
                    {provider} · {copy.notConnected}
                  </span>
                )
              })}
            </div>
          ) : null}
        </div>
      )}
    </InlineActionCard>
  )
}

export function OwnerInviteAccountantCard({ request }: { request: OwnerInviteAccountantRequest }) {
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const isEn = locale === 'en'
  const [draftEmail, setDraftEmail] = useState(request.accountantEmail ?? '')
  const [draftMessage, setDraftMessage] = useState(request.customMessage ?? '')

  const trimmedEmail = draftEmail.trim().toLowerCase()
  const trimmedMessage = draftMessage.trim()
  const tooLong = trimmedMessage.length > OWNER_INVITE_ACCOUNTANT_MAX_LENGTH
  const invalidEmail = trimmedEmail.length > 0 && !EMAIL_REGEX.test(trimmedEmail)

  const copy = isEn
    ? {
        title: isBlocked ? 'Cannot send accountant invite' : 'Invite your accountant',
        emailLabel: 'Accountant email',
        emailPlaceholder: 'name@accountancy.be',
        messageLabel: 'Personal note (optional)',
        messagePlaceholder:
          'A short note for context. Leave empty to send the default invite copy.',
        primaryCta: 'Send invite',
        sentCta: 'Invite sent',
        tooLongError: `Personal note must be ${OWNER_INVITE_ACCOUNTANT_MAX_LENGTH} characters or fewer.`,
        invalidEmailError: 'Enter a valid email address.',
        missingEmailError: 'Accountant email is required.',
      }
    : {
        title: isBlocked ? 'Uitnodiging niet mogelijk' : 'Boekhouder uitnodigen',
        emailLabel: 'E-mail boekhouder',
        emailPlaceholder: 'naam@boekhouder.be',
        messageLabel: 'Persoonlijke noot (optioneel)',
        messagePlaceholder: 'Een korte noot ter context. Leeg laten = standaard uitnodiging.',
        primaryCta: 'Uitnodiging sturen',
        sentCta: 'Verzonden',
        tooLongError: `Persoonlijke noot mag maximaal ${OWNER_INVITE_ACCOUNTANT_MAX_LENGTH} tekens zijn.`,
        invalidEmailError: 'Voer een geldig e-mailadres in.',
        missingEmailError: 'E-mail boekhouder is verplicht.',
      }

  return (
    <InlineActionCard
      id={request.id}
      title={copy.title}
      detail={request.message ?? request.reason}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Mail className="h-3.5 w-3.5" />}
      actionLabel={copy.primaryCta}
      actionSuccessLabel={copy.sentCta}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (trimmedEmail.length === 0) throw new Error(copy.missingEmailError)
              if (invalidEmail) throw new Error(copy.invalidEmailError)
              if (tooLong) throw new Error(copy.tooLongError)
              const body: Record<string, unknown> = {
                accountant_email: trimmedEmail,
                surface: 'card',
              }
              if (trimmedMessage.length > 0) body.custom_message = trimmedMessage
              const response = await fetch('/api/client/orphaned-seller/invite-accountant', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...buildAgentToolActionHeaders('propose_owner_invite_accountant', request.id),
                },
                credentials: 'include',
                body: JSON.stringify(body),
              })
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    >
      {!isBlocked && (
        <div className="mt-2 space-y-2">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">{copy.emailLabel}</span>
            <input
              type="email"
              value={draftEmail}
              placeholder={copy.emailPlaceholder}
              onChange={(event) => setDraftEmail(event.target.value)}
              className={cn(
                'w-full rounded-md border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
                invalidEmail ? 'border-destructive/50' : 'border-foreground/[0.12]'
              )}
            />
            {invalidEmail && (
              <span className="text-[10px] text-destructive">{copy.invalidEmailError}</span>
            )}
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">{copy.messageLabel}</span>
            <textarea
              value={draftMessage}
              maxLength={OWNER_INVITE_ACCOUNTANT_MAX_LENGTH + 50}
              rows={3}
              placeholder={copy.messagePlaceholder}
              onChange={(event) => setDraftMessage(event.target.value)}
              className={cn(
                'w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
                tooLong ? 'border-destructive/50' : 'border-foreground/[0.12]'
              )}
            />
            {tooLong && <span className="text-[10px] text-destructive">{copy.tooLongError}</span>}
          </label>
        </div>
      )}
    </InlineActionCard>
  )
}

export function OwnerReminderCard({ request }: { request: OwnerReminderRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const [draft, setDraft] = useState(request.customMessage ?? '')
  const tooLong = draft.trim().length > OWNER_REMINDER_MAX_LENGTH

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.ownerReminderBlocked')
          : request.businessName
            ? ca('proposalCards.agent.ownerReminderTitleWithName', {
                name: request.businessName,
              })
            : ca('proposalCards.agent.ownerReminderTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([request.customerEmail])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Bell className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.ownerReminderAction')}
      actionSuccessLabel={ca('proposalCards.agent.ownerReminderSent')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.clientId) throw new Error(ca('proposalCards.agent.missingClient'))
              if (tooLong) throw new Error(ca('proposalCards.agent.messageTooLong'))
              const customMessage = draft.trim()
              const response = await fetch(
                `/api/accountants/clients/${encodeURIComponent(
                  request.clientId
                )}/owner-profile-reminder`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_owner_reminder', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify(
                    customMessage.length > 0 ? { custom_message: customMessage } : {}
                  ),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    >
      {!isBlocked && (
        <label className="mt-2 block space-y-1">
          <span className="text-[11px] font-medium text-foreground/60">
            {ca('proposalCards.agent.ownerReminderMessage')}
          </span>
          <textarea
            value={draft}
            maxLength={OWNER_REMINDER_MAX_LENGTH + 50}
            rows={3}
            onChange={(event) => setDraft(event.target.value)}
            className={cn(
              'w-full resize-none rounded-md border bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30',
              tooLong ? 'border-destructive/50' : 'border-foreground/[0.12]'
            )}
          />
          {tooLong && (
            <span className="text-[10px] text-destructive">
              {ca('proposalCards.agent.messageTooLong')}
            </span>
          )}
        </label>
      )}
    </InlineActionCard>
  )
}
