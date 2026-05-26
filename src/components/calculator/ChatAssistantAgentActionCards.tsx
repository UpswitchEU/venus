'use client'

import { motion } from 'framer-motion'
import {
  AlertTriangle,
  Bell,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Mail,
  Pin,
  RefreshCw,
  Share2,
  ShieldX,
  UploadCloud,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
import type {
  AcknowledgeWarningRequest,
  AgentChoiceSelection,
  ChatMessage,
  ClientCreateRequest,
  CsvUploadRequest,
  ImportReviewRequest,
  IntegrationConnectRequest,
  IntegrationSyncRequest,
  ListingVisibilityRequest,
  MultiSelectRequest,
  OwnerInviteAccountantRequest,
  OwnerProfileAnswerRequest,
  OwnerReminderRequest,
  SecureCredentialRequest,
  ShareTokenRequest,
  ShareTokenRevokeRequest,
  SingleSelectRequest,
  SyncStatusPreview,
  BulkValuationRunRequest,
  ListingFieldUpdateRequest,
  ValuationDefaultsPreview,
  WorkspaceClientsPreview,
  ValuationDefaultsRequest,
  ValuationMethodPreferenceRequest,
  ValuationSessionRequest,
} from './ChatAssistantTypes'

interface ChatAssistantAgentActionCardsProps {
  message: ChatMessage
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
  onSendFollowUp?: (content: string) => void
}

interface InlineActionCardProps {
  id: string
  title: string
  detail?: string | null
  meta?: string[]
  tone?: 'default' | 'blocked'
  icon?: ReactNode
  actionLabel?: string
  actionPrompt?: string
  actionPendingLabel?: string
  actionSuccessLabel?: string
  onAction?: () => Promise<void> | void
  onSendFollowUp?: (content: string) => void
  children?: ReactNode
}

const AGENT_TOOL_ACTION_NAME_HEADER = 'X-Upswitch-Agent-Tool-Name'
const AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER = 'X-Upswitch-Agent-Proposal-Id'
const DEFAULT_UPLOAD_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const DEFAULT_UPLOAD_MAX_SIZE_BYTES = 20 * 1024 * 1024
const DEFAULT_SHARE_TOKEN_EXPIRES_DAYS = 30
const MIN_SHARE_TOKEN_EXPIRES_DAYS = 1
const MAX_SHARE_TOKEN_EXPIRES_DAYS = 90
const MIN_SHARE_TOKEN_USES = 1
const MAX_SHARE_TOKEN_USES = 100
const OWNER_REMINDER_MAX_LENGTH = 1000

const VALUATION_METHOD_LABELS: Record<string, string> = {
  upswitch_adaptive: 'Upswitch adaptive',
  ebitda_multiple: 'EBITDA multiple',
  omzet_multiple: 'Omzet multiple',
  revenue_multiple: 'Revenue multiple',
  dcf: 'DCF',
  sde_multiple: 'SDE multiple',
  arr_multiple: 'ARR multiple',
  adjusted_nav: 'Adjusted NAV',
  fiscal_4x: 'Fiscal 4x',
  startup_valuation: 'Startup valuation',
  liquidation_analysis: 'Liquidation analysis',
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
}

const SECURE_CREDENTIAL_BFF_PATHS = [
  /^\/api\/integrations\/accounting\/(?:yuki|bizzcontrol|octopus)\/connect$/,
] as const

const CSV_UPLOAD_BFF_PATHS = [/^\/api\/import\/(?:trial-balance|bulk-clients)$/] as const

const CHOICE_SUBMIT_BFF_PATHS = [
  /^\/api\/valuations\/(?:years|scenario|methods|method-weights)$/,
  /^\/api\/profile\/buyer-profile$/,
] as const

const HOST_APPLIED_CHOICE_PATHS = new Set([
  '/api/valuations/years',
  '/api/valuations/scenario',
  '/api/valuations/methods',
  '/api/valuations/method-weights',
  '/api/profile/buyer-profile',
])

function safeBffPath(path: string | undefined, allowedPaths: readonly RegExp[]): string {
  if (typeof path !== 'string') return ''
  const trimmed = path.trim()
  if (!trimmed.startsWith('/api/') || trimmed.startsWith('//')) return ''
  if (trimmed.includes('\n') || trimmed.includes('\r') || trimmed.includes('?')) return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed, 'https://valuation.upswitch.app')
  } catch {
    return ''
  }
  if (parsed.origin !== 'https://valuation.upswitch.app') return ''
  return allowedPaths.some((pattern) => pattern.test(parsed.pathname)) ? parsed.pathname : ''
}

function isHostAppliedChoicePath(path: string): boolean {
  return HOST_APPLIED_CHOICE_PATHS.has(path)
}

function buildAgentToolActionHeaders(
  toolName: string,
  proposalId?: string
): Record<string, string> {
  return {
    [AGENT_TOOL_ACTION_NAME_HEADER]: toolName,
    ...(proposalId ? { [AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER]: proposalId } : {}),
  }
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['message', 'error']) {
      if (typeof record[key] === 'string' && record[key].trim()) return record[key]
    }
  }
  return `HTTP ${status}`
}

function openInNewTab(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer')
}

function mercuryPath(
  locale: string,
  path: string,
  params?: Record<string, string | null | undefined>
) {
  const base = getMercuryUrl().replace(/\/$/, '')
  const target = new URL(`${base}/${locale.replace(/^\/+|\/+$/g, '') || 'en'}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value?.trim()) target.searchParams.set(key, value.trim())
  }
  return target.toString()
}

function venusValuationSessionPath(locale: string, clientId: string) {
  const target = new URL(
    `/${locale.replace(/^\/+|\/+$/g, '') || 'en'}/calculator`,
    typeof window === 'undefined' ? 'https://valuation.upswitch.app' : window.location.origin
  )
  target.searchParams.set('clientId', clientId)
  target.searchParams.set('mode', 'accountant')
  target.searchParams.set('source', 'mercury')
  target.searchParams.set('flow', 'advisor')
  target.searchParams.set('drawer', 'open')
  target.searchParams.set('agent_next', 'run_valuation')
  return `${target.pathname}${target.search}`
}

function stringifyActionValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number(value).toLocaleString('nl-BE')
  if (typeof value === 'string') return value
  if (value === null) return 'None'
  return null
}

function providerLabel(provider?: string) {
  if (!provider) return null
  const labels: Record<string, string> = {
    silverfin: 'Silverfin',
    exact: 'Exact Online',
    octopus: 'Octopus',
    bizzcontrol: 'Bizzcontrol',
    yuki: 'Yuki',
    xero: 'Xero',
  }
  return labels[provider] ?? provider
}

function fallbackMethodLabel(method: string) {
  return (
    VALUATION_METHOD_LABELS[method] ??
    method
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function listingSettingsPath(locale: string, listingId: string, action: string) {
  return mercuryPath(locale, `/business/listing/${encodeURIComponent(listingId)}/settings`, {
    action,
  })
}

function buildShareUrl(listingId: string, token: string) {
  if (typeof window === 'undefined') return `/marketplace/${listingId}?token=${token}`
  return `${window.location.origin}/marketplace/${listingId}?token=${encodeURIComponent(token)}`
}

function InlineActionCard({
  id,
  title,
  detail,
  meta = [],
  tone = 'default',
  icon,
  actionLabel,
  actionPrompt,
  actionPendingLabel,
  actionSuccessLabel,
  onAction,
  onSendFollowUp,
  children,
}: InlineActionCardProps) {
  const ca = useTranslations('chatAssistant')
  const [decision, setDecision] = useState<'idle' | 'sent' | 'dismissed' | 'submitting'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const canAct = Boolean(onAction) || (typeof onSendFollowUp === 'function' && actionPrompt)
  const isSubmitting = decision === 'submitting'

  const handleAction = useCallback(async () => {
    if (!canAct || isSubmitting) return
    setErrorMessage(null)
    if (onAction) {
      setDecision('submitting')
      try {
        await onAction()
        setDecision('sent')
      } catch (err) {
        setDecision('idle')
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      }
      return
    }
    if (actionPrompt) {
      onSendFollowUp?.(actionPrompt)
      setDecision('sent')
    }
  }, [actionPrompt, canAct, isSubmitting, onAction, onSendFollowUp])

  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      className={cn(
        'rounded-lg border px-3 py-2 text-sm leading-relaxed',
        decision === 'sent'
          ? 'border-success/20 bg-success/5'
          : decision === 'dismissed'
            ? 'border-foreground/[0.08] bg-foreground/[0.02] opacity-70'
            : tone === 'blocked'
              ? 'border-amber-500/25 bg-amber-500/[0.04]'
              : 'border-primary/15 bg-primary/[0.035]'
      )}
    >
      <div className="flex items-start gap-2.5">
        {icon && <div className="mt-0.5 shrink-0 text-primary/80">{icon}</div>}
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground/90">{title}</p>
          {detail && <p className="mt-0.5 text-xs text-foreground/60 leading-snug">{detail}</p>}
          {meta.length > 0 && (
            <p className="mt-1 text-xs text-foreground/50 leading-snug">{meta.join(' · ')}</p>
          )}
          {children}
          {decision === 'sent' && (
            <p className="mt-1.5 text-xs text-success/90">
              {actionSuccessLabel ?? ca('proposalCards.agent.sent')}
            </p>
          )}
          {decision === 'dismissed' && (
            <p className="mt-1.5 text-xs text-foreground/45">
              {ca('proposalCards.common.statusCancelled')}
            </p>
          )}
          {errorMessage && <p className="mt-1.5 text-xs text-destructive">{errorMessage}</p>}
          {(decision === 'idle' || isSubmitting) && (actionLabel || canAct) && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {canAct && (
                <button
                  type="button"
                  onClick={() => void handleAction()}
                  disabled={isSubmitting}
                  className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isSubmitting
                    ? (actionPendingLabel ?? ca('proposalCards.agent.submitting'))
                    : (actionLabel ?? ca('proposalCards.agent.continue'))}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDecision('dismissed')}
                disabled={isSubmitting}
                className="text-foreground/45 hover:text-foreground/70 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              >
                {ca('proposalCards.common.buttonCancel')}
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  )
}

function OwnerProfileCard({ request }: { request: OwnerProfileAnswerRequest }) {
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

function IntegrationCard({ request }: { request: IntegrationConnectRequest }) {
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

function IntegrationSyncCard({ request }: { request: IntegrationSyncRequest }) {
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

/**
 * Read-only companion of IntegrationSyncCard — surfaces the agent's answer
 * to "is the sync done?" inline in chat. No approve/reject; renders the
 * per-provider connection + last-sync state. Source-of-truth Titan tool:
 * `get_sync_status`. Mirrors Mercury's SyncStatusCard.
 */
function SyncStatusPreviewCard({ preview }: { preview: SyncStatusPreview }) {
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

/**
 * Owner-side conversational mirror — agent proposes inviting the seller's
 * accountant to join the deal. Reverse direction of advisor → owner invite
 * (which goes through `client_create`). Source-of-truth Titan tool:
 * `propose_owner_invite_accountant`. Mirrors Mercury's OwnerInviteAccountantCard.
 */
const OWNER_INVITE_ACCOUNTANT_MAX_LENGTH = 500
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function OwnerInviteAccountantCard({ request }: { request: OwnerInviteAccountantRequest }) {
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

function OwnerReminderCard({ request }: { request: OwnerReminderRequest }) {
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

function ListingVisibilityCard({ request }: { request: ListingVisibilityRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const targetIsPublic = request.visibility === 'public'

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.listingVisibilityBlocked')
          : targetIsPublic
            ? ca('proposalCards.agent.listingVisibilityPublic')
            : ca('proposalCards.agent.listingVisibilityPrivate')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([request.businessName, request.visibility])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={targetIsPublic ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.listingVisibilityAction')}
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              if (!request.visibility) throw new Error(ca('proposalCards.agent.missingVisibility'))
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_listing_visibility', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ visibility: request.visibility }),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'visibility'))
                return
              }
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function ShareTokenCard({ request }: { request: ShareTokenRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const [expiresInDays, setExpiresInDays] = useState(
    clampNumber(
      request.expiresInDays ?? DEFAULT_SHARE_TOKEN_EXPIRES_DAYS,
      MIN_SHARE_TOKEN_EXPIRES_DAYS,
      MAX_SHARE_TOKEN_EXPIRES_DAYS
    )
  )
  const [maxUsesText, setMaxUsesText] = useState(
    typeof request.maxUses === 'number' ? String(request.maxUses) : ''
  )
  const [label, setLabel] = useState(request.label ?? '')
  const [mintedUrl, setMintedUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.shareTokenBlocked')
          : request.businessName
            ? ca('proposalCards.agent.shareTokenTitleWithName', { name: request.businessName })
            : ca('proposalCards.agent.shareTokenTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([
        ca('proposalCards.agent.shareTokenExpires', { count: expiresInDays }),
        maxUsesText.trim()
          ? ca('proposalCards.agent.shareTokenMaxUses', { count: Number(maxUsesText) || 0 })
          : ca('proposalCards.agent.shareTokenUnlimited'),
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Share2 className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.shareTokenAction')}
      actionSuccessLabel={ca('proposalCards.agent.shareTokenMinted')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              const rawMaxUses = maxUsesText.trim().length > 0 ? Number(maxUsesText) : null
              const body: Record<string, unknown> = { expiresInDays }
              if (rawMaxUses !== null) {
                body.maxUses = clampNumber(rawMaxUses, MIN_SHARE_TOKEN_USES, MAX_SHARE_TOKEN_USES)
              }
              const trimmedLabel = label.trim()
              if (trimmedLabel.length > 0) body.label = trimmedLabel
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId)}/share-tokens`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_share_token', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify(body),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'share-token'))
                return
              }
              const json = (await response.json().catch(() => ({}))) as {
                success?: boolean
                data?: { token?: string }
                message?: string
                error?: string
              }
              if (!response.ok || !json.data?.token) {
                throw new Error(extractErrorMessage(json, response.status))
              }
              setMintedUrl(buildShareUrl(request.listingId, json.data.token))
            }
      }
    >
      {!isBlocked && !mintedUrl && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenDaysLabel')}
            </span>
            <input
              type="number"
              min={MIN_SHARE_TOKEN_EXPIRES_DAYS}
              max={MAX_SHARE_TOKEN_EXPIRES_DAYS}
              value={expiresInDays}
              onChange={(event) =>
                setExpiresInDays(
                  clampNumber(
                    Number(event.target.value),
                    MIN_SHARE_TOKEN_EXPIRES_DAYS,
                    MAX_SHARE_TOKEN_EXPIRES_DAYS
                  )
                )
              }
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenUsesLabel')}
            </span>
            <input
              type="number"
              min={MIN_SHARE_TOKEN_USES}
              max={MAX_SHARE_TOKEN_USES}
              value={maxUsesText}
              placeholder={ca('proposalCards.agent.shareTokenUnlimited')}
              onChange={(event) => setMaxUsesText(event.target.value)}
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
          <label className="col-span-2 space-y-1">
            <span className="text-[11px] font-medium text-foreground/60">
              {ca('proposalCards.agent.shareTokenLabel')}
            </span>
            <input
              value={label}
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs"
            />
          </label>
        </div>
      )}
      {mintedUrl && (
        <div className="mt-2 space-y-2">
          <input
            readOnly
            value={mintedUrl}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-md border border-success/20 bg-success/5 px-2 py-1.5 text-xs text-foreground"
          />
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard?.writeText(mintedUrl).catch(() => undefined)
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1600)
            }}
            className="text-xs font-medium text-primary/85 hover:text-primary"
          >
            {copied
              ? ca('proposalCards.agent.shareTokenCopied')
              : ca('proposalCards.agent.shareTokenCopy')}
          </button>
        </div>
      )}
    </InlineActionCard>
  )
}

function ShareTokenRevokeCard({ request }: { request: ShareTokenRevokeRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.shareTokenRevokeBlocked')
          : ca('proposalCards.agent.shareTokenRevokeTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([request.businessName, request.tokenLabel, request.tokenHint])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<ShieldX className="h-3.5 w-3.5" />}
      actionLabel={ca('proposalCards.agent.shareTokenRevokeAction')}
      actionSuccessLabel={ca('proposalCards.agent.shareTokenRevoked')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.listingId) throw new Error(ca('proposalCards.agent.missingListing'))
              if (!request.tokenId) throw new Error(ca('proposalCards.agent.missingToken'))
              const response = await fetch(
                `/api/listings/${encodeURIComponent(
                  request.listingId
                )}/share-tokens/${encodeURIComponent(request.tokenId)}`,
                {
                  method: 'DELETE',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_share_token_revoke', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({}),
                }
              )
              if (response.status === 404) {
                openInNewTab(listingSettingsPath(locale, request.listingId, 'share-token'))
                return
              }
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function ValuationMethodPreferenceCard({ request }: { request: ValuationMethodPreferenceRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const isClear = request.method === null
  const methodLabel =
    typeof request.method === 'string' ? fallbackMethodLabel(request.method) : null

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationMethodPreferenceBlocked')
          : isClear
            ? request.businessName
              ? ca('proposalCards.agent.valuationMethodPreferenceClearWithName', {
                  name: request.businessName,
                })
              : ca('proposalCards.agent.valuationMethodPreferenceClear')
            : methodLabel && request.businessName
              ? ca('proposalCards.agent.valuationMethodPreferencePinWithName', {
                  method: methodLabel,
                  name: request.businessName,
                })
              : methodLabel
                ? ca('proposalCards.agent.valuationMethodPreferencePin', { method: methodLabel })
                : ca('proposalCards.agent.valuationMethodPreferenceTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.message ?? request.reason)}
      meta={compactParts([
        request.businessName,
        isClear ? ca('proposalCards.agent.valuationMethodPreferenceDefault') : methodLabel,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isClear
          ? ca('proposalCards.agent.valuationMethodPreferenceClearAction')
          : ca('proposalCards.agent.valuationMethodPreferencePinAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked
          ? undefined
          : async () => {
              if (!request.clientId) throw new Error(ca('proposalCards.agent.missingClient'))
              if (request.method === undefined) {
                throw new Error(ca('proposalCards.agent.missingMethod'))
              }
              const response = await fetch(
                `/api/accountants/clients/${encodeURIComponent(
                  request.clientId
                )}/valuation-method-preference`,
                {
                  method: 'PUT',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders(
                      'propose_valuation_method_preference',
                      request.id
                    ),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ value: request.method }),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function ListingFieldUpdateCard({ request }: { request: ListingFieldUpdateRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const change = request.change ?? {}
  const proposedKeys = Object.keys(change).filter((k) =>
    ['title', 'summary', 'description', 'asking_price'].includes(k)
  )
  const isEmpty = !isBlocked && (proposedKeys.length === 0 || !request.listingId)

  // Inline meta lists which fields are being touched and a tight preview
  // for the text fields. Mercury's card shows full previews; here we keep
  // it short — Venus is a wizard surface, listing edits are rare here.
  const metaParts: string[] = []
  if ('title' in change) {
    const v = change.title
    metaParts.push(
      v === null
        ? ca('proposalCards.agent.listingFieldUpdateTitleCleared')
        : ca('proposalCards.agent.listingFieldUpdateTitleSet', {
            value: typeof v === 'string' ? v.slice(0, 40) : '',
          })
    )
  }
  if ('asking_price' in change) {
    const v = change.asking_price
    metaParts.push(
      v === null
        ? ca('proposalCards.agent.listingFieldUpdatePriceCleared')
        : ca('proposalCards.agent.listingFieldUpdatePriceSet', {
            value:
              typeof v === 'number'
                ? v.toLocaleString('en-US', { maximumFractionDigits: 0 })
                : '',
          })
    )
  }
  if ('summary' in change)
    metaParts.push(ca('proposalCards.agent.listingFieldUpdateSummary'))
  if ('description' in change)
    metaParts.push(ca('proposalCards.agent.listingFieldUpdateDescription'))

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.listingFieldUpdateBlocked')
          : ca('proposalCards.agent.listingFieldUpdateTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={isBlocked ? undefined : compactParts(metaParts)}
      tone={isBlocked || isEmpty ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isEmpty
          ? undefined
          : ca('proposalCards.agent.listingFieldUpdateAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked || isEmpty || !request.listingId
          ? undefined
          : async () => {
              const response = await fetch(
                `/api/listings/${encodeURIComponent(request.listingId as string)}`,
                {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders(
                      'propose_listing_field_update',
                      request.id
                    ),
                  },
                  credentials: 'include',
                  body: JSON.stringify(change),
                }
              )
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function BulkValuationRunCard({ request }: { request: BulkValuationRunRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const count = request.clientCount ?? request.clientIds?.length ?? 0
  const credits = request.estimatedCredits ?? count * 5
  const isInvalid = !request.clientIds || request.clientIds.length === 0

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.bulkValuationRunBlocked')
          : count === 1
            ? ca('proposalCards.agent.bulkValuationRunTitleSingle')
            : ca('proposalCards.agent.bulkValuationRunTitle', { count: String(count) })
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={compactParts([
        ca('proposalCards.agent.bulkValuationRunCount', { count: String(count) }),
        ca('proposalCards.agent.bulkValuationRunCredits', { credits: String(credits) }),
        typeof request.rejectedCount === 'number' && request.rejectedCount > 0
          ? ca('proposalCards.agent.bulkValuationRunRejected', {
              count: String(request.rejectedCount),
            })
          : null,
      ])}
      // Venus InlineActionCard only supports 'default' | 'blocked'; the
      // cost warning lives in the meta chips (Credits: 500) and the explicit
      // CTA copy ("Run bulk valuation"). Mercury renders this with a
      // destructive-toned primary; Venus is the wizard surface and rarely
      // hits this card so we accept the cross-app visual delta.
      tone={isBlocked || isInvalid ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isInvalid
          ? undefined
          : ca('proposalCards.agent.bulkValuationRunAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.bulkValuationRunStarted')}
      onAction={
        isBlocked || isInvalid || !request.clientIds
          ? undefined
          : async () => {
              const response = await fetch('/api/valuations/bulk', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...buildAgentToolActionHeaders('propose_bulk_valuation_run', request.id),
                },
                credentials: 'include',
                body: JSON.stringify({ client_ids: request.clientIds }),
              })
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function ValuationDefaultsCard({ request }: { request: ValuationDefaultsRequest }) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const change = request.change ?? {}
  const proposedKeys = Object.keys(change).filter((k) =>
    [
      'multiple_calibration_adjustment',
      'historical_ebitda_weighting_mode',
      'show_enterprise_to_equity_bridge',
    ].includes(k)
  )
  const isEmpty = !isBlocked && proposedKeys.length === 0

  // Compact meta summarising what the agent proposed. Each chip mirrors
  // the Mercury card's chip-row so the conversational shape stays
  // consistent across the two apps even though the layout primitives
  // differ.
  const metaParts: string[] = []
  if ('multiple_calibration_adjustment' in change) {
    const v = change.multiple_calibration_adjustment
    if (v === null) {
      metaParts.push(ca('proposalCards.agent.valuationDefaultsPremiumDefault'))
    } else if (typeof v === 'number') {
      const sign = v > 0 ? '+' : ''
      metaParts.push(
        ca('proposalCards.agent.valuationDefaultsPremium', { value: `${sign}${v.toFixed(2)}` })
      )
    }
  }
  if ('historical_ebitda_weighting_mode' in change) {
    const v = change.historical_ebitda_weighting_mode
    if (v === null)
      metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingDefault'))
    else if (v === 'weighted')
      metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingWeighted'))
    else metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingStandard'))
  }
  if ('show_enterprise_to_equity_bridge' in change) {
    const v = change.show_enterprise_to_equity_bridge
    if (v === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeDefault'))
    else if (v) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeShow'))
    else metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeHide'))
  }

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationDefaultsBlocked')
          : ca('proposalCards.agent.valuationDefaultsTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : (request.reason ?? request.message)}
      meta={compactParts(metaParts)}
      tone={isBlocked || isEmpty ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      actionLabel={
        isBlocked || isEmpty ? undefined : ca('proposalCards.agent.valuationDefaultsAction')
      }
      actionSuccessLabel={ca('proposalCards.agent.saved')}
      onAction={
        isBlocked || isEmpty
          ? undefined
          : async () => {
              const response = await fetch('/api/accountants/settings', {
                method: 'PATCH',
                headers: {
                  'Content-Type': 'application/json',
                  ...buildAgentToolActionHeaders('propose_valuation_defaults', request.id),
                },
                credentials: 'include',
                body: JSON.stringify(change),
              })
              const json: unknown = await response.json().catch(() => ({}))
              if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
            }
      }
    />
  )
}

function WorkspaceClientsPreviewCard({ preview }: { preview: WorkspaceClientsPreview }) {
  const ca = useTranslations('chatAssistant')
  const isFailed = preview.status === 'failed'
  const counts = preview.counts ?? { draft: 0, invited: 0, active: 0 }
  const total = preview.totalClients ?? (preview.clients?.length ?? 0)

  // Compact: chip-row for the status rollup, no per-client list (Venus
  // dock is narrower than Mercury's). If the agent wants to enumerate
  // names it can write them in the chat text body.
  const metaParts: string[] = [
    ca('proposalCards.agent.workspaceClientsTotal', { count: String(total) }),
    ca('proposalCards.agent.workspaceClientsActive', { count: String(counts.active) }),
    ca('proposalCards.agent.workspaceClientsInvited', { count: String(counts.invited) }),
    ca('proposalCards.agent.workspaceClientsDraft', { count: String(counts.draft) }),
  ]
  if (preview.filter?.status) {
    metaParts.push(
      ca('proposalCards.agent.workspaceClientsFilteredStatus', {
        status: preview.filter.status,
      })
    )
  }
  if (preview.filter?.search) {
    metaParts.push(
      ca('proposalCards.agent.workspaceClientsFilteredSearch', {
        search: preview.filter.search,
      })
    )
  }

  return (
    <InlineActionCard
      id={preview.id}
      title={
        isFailed
          ? ca('proposalCards.agent.workspaceClientsPreviewFailed')
          : ca('proposalCards.agent.workspaceClientsPreviewTitle')
      }
      detail={
        isFailed
          ? preview.message
          : preview.truncated
            ? preview.message
            : undefined
      }
      meta={isFailed ? undefined : compactParts(metaParts)}
      tone={isFailed ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      // No action — preview is read-only.
    />
  )
}

function ValuationDefaultsPreviewCard({ preview }: { preview: ValuationDefaultsPreview }) {
  const ca = useTranslations('chatAssistant')
  const isFailed = preview.status === 'failed'
  const defaults = preview.defaults ?? {
    multiple_calibration_adjustment: null,
    historical_ebitda_weighting_mode: null,
    show_enterprise_to_equity_bridge: null,
  }

  const adj = defaults.multiple_calibration_adjustment
  const weighting = defaults.historical_ebitda_weighting_mode
  const bridge = defaults.show_enterprise_to_equity_bridge

  const metaParts: string[] = []
  if (adj === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsPremiumDefault'))
  else {
    const sign = adj > 0 ? '+' : ''
    metaParts.push(
      ca('proposalCards.agent.valuationDefaultsPremium', { value: `${sign}${adj.toFixed(2)}` })
    )
  }
  if (weighting === null)
    metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingDefault'))
  else if (weighting === 'weighted')
    metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingWeighted'))
  else metaParts.push(ca('proposalCards.agent.valuationDefaultsWeightingStandard'))
  if (bridge === null) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeDefault'))
  else if (bridge) metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeShow'))
  else metaParts.push(ca('proposalCards.agent.valuationDefaultsBridgeHide'))

  return (
    <InlineActionCard
      id={preview.id}
      title={
        isFailed
          ? ca('proposalCards.agent.valuationDefaultsPreviewFailed')
          : ca('proposalCards.agent.valuationDefaultsPreviewTitle')
      }
      detail={
        isFailed
          ? preview.message
          : preview.allDefaultsAtSystem
            ? ca('proposalCards.agent.valuationDefaultsPreviewAllSystem')
            : preview.message
      }
      meta={isFailed ? undefined : compactParts(metaParts)}
      tone={isFailed ? 'blocked' : 'default'}
      icon={<Pin className="h-3.5 w-3.5" />}
      // No actionLabel — preview is read-only.
    />
  )
}

function AcknowledgeWarningCard({ request }: { request: AcknowledgeWarningRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const isCapBreach = request.warningKind === 'cap_breach'
  const canOpenReview = !isBlocked && Boolean(request.code)

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked || !request.code
          ? ca('proposalCards.agent.acknowledgeWarningBlocked')
          : isCapBreach
            ? ca('proposalCards.agent.acknowledgeWarningCapTitle')
            : request.warningKind === 'defensibility'
              ? ca('proposalCards.agent.acknowledgeWarningDefensibilityTitle')
              : ca('proposalCards.agent.acknowledgeWarningTitle')
      }
      detail={
        isBlocked
          ? (request.message ?? request.reason)
          : (request.reason ?? request.message ?? ca('proposalCards.agent.acknowledgeWarningHint'))
      }
      meta={compactParts([
        isCapBreach
          ? ca('proposalCards.agent.acknowledgeWarningKindCap')
          : request.warningKind === 'defensibility'
            ? ca('proposalCards.agent.acknowledgeWarningKindDefensibility')
            : null,
        request.reportId,
      ])}
      tone={isBlocked || !request.code ? 'blocked' : 'default'}
      icon={<AlertTriangle className="h-3.5 w-3.5" />}
      actionLabel={canOpenReview ? ca('proposalCards.agent.acknowledgeWarningAction') : undefined}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        canOpenReview
          ? () => {
              openInNewTab(
                mercuryPath(locale, '/advisor/import-review', {
                  source: 'venus-ai',
                  clientId: request.clientId,
                  reportId: request.reportId,
                  warning_code: request.code,
                  warning_kind: request.warningKind,
                })
              )
            }
          : undefined
      }
    >
      {(request.summary || request.code) && (
        <div className="mt-2 rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs">
          {request.summary && <p className="text-foreground/65">{request.summary}</p>}
          {request.code && (
            <p className="mt-1 font-mono text-[11px] text-foreground/55 break-all">
              {ca('proposalCards.agent.acknowledgeWarningCodeLabel')}: {request.code}
            </p>
          )}
        </div>
      )}
    </InlineActionCard>
  )
}

function SecureCredentialCard({ request }: { request: SecureCredentialRequest }) {
  const ca = useTranslations('chatAssistant')
  const provider = providerLabel(request.provider)
  const fields = request.fields ?? []
  const [values, setValues] = useState<Record<string, string>>({})
  const [state, setState] = useState<'idle' | 'submitting' | 'submitted' | 'dismissed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const isDone = state === 'submitted' || state === 'dismissed'
  const isSubmitting = state === 'submitting'

  const handleSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (state !== 'idle') return

      for (const field of fields) {
        if (field.required && !values[field.key]?.trim()) {
          setErrorMessage(ca('proposalCards.agent.requiredField', { field: field.label }))
          return
        }
      }

      const path = safeBffPath(request.submitPath, SECURE_CREDENTIAL_BFF_PATHS)
      if (!path) {
        setErrorMessage(ca('proposalCards.agent.endpointMissing'))
        return
      }

      const body = { ...values }
      setValues({})
      setState('submitting')
      setErrorMessage(null)
      try {
        const response = await fetch(path, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...buildAgentToolActionHeaders('propose_secure_credential', request.id),
          },
          credentials: 'include',
          body: JSON.stringify(body),
        })
        const json: unknown = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
        setState('submitted')
      } catch (err) {
        setState('idle')
        setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
      }
    },
    [ca, fields, request.id, request.submitPath, state, values]
  )

  return (
    <InlineActionCard
      id={request.id}
      title={
        provider
          ? ca('proposalCards.agent.credentialTitleWithProvider', { provider })
          : ca('proposalCards.agent.credentialTitle')
      }
      detail={request.message ?? request.reason ?? ca('proposalCards.agent.credentialSafeHint')}
      meta={compactParts([request.submitPath])}
      icon={<KeyRound className="h-3.5 w-3.5" />}
    >
      {state === 'submitted' && (
        <p className="mt-1.5 text-xs text-success/90">{ca('proposalCards.agent.saved')}</p>
      )}
      {state === 'dismissed' && (
        <p className="mt-1.5 text-xs text-foreground/45">
          {ca('proposalCards.common.statusCancelled')}
        </p>
      )}
      {errorMessage && <p className="mt-1.5 text-xs text-destructive">{errorMessage}</p>}
      {!isDone && (
        <form
          className="mt-2 space-y-2"
          autoComplete="off"
          onSubmit={(event) => void handleSubmit(event)}
        >
          {fields.map((field) => (
            <label key={field.key} className="block space-y-1">
              <span className="text-[11px] font-medium text-foreground/70">
                {field.label}
                {field.required ? <span className="text-destructive/70"> *</span> : null}
              </span>
              <input
                type={field.masked ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                value={values[field.key] ?? ''}
                disabled={isSubmitting}
                onChange={(event) =>
                  setValues((prev) => ({ ...prev, [field.key]: event.target.value }))
                }
                className="w-full rounded-md border border-foreground/[0.12] bg-background px-2 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50"
              />
              {field.helper && (
                <span className="block text-[10px] text-foreground/45">{field.helper}</span>
              )}
            </label>
          ))}
          <div className="flex items-center gap-3 text-xs">
            <button
              type="submit"
              disabled={isSubmitting}
              className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting
                ? ca('proposalCards.agent.submitting')
                : ca('proposalCards.agent.credentialAction')}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setValues({})
                setErrorMessage(null)
                setState('dismissed')
              }}
              className="text-foreground/45 hover:text-foreground/70 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ca('proposalCards.common.buttonCancel')}
            </button>
          </div>
        </form>
      )}
    </InlineActionCard>
  )
}

function CsvUploadCard({ request }: { request: CsvUploadRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [state, setState] = useState<'idle' | 'uploading' | 'uploaded' | 'dismissed'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const limit = formatBytes(request.maxSizeBytes)
  const accept = request.accept ?? DEFAULT_UPLOAD_ACCEPT
  const maxSize = request.maxSizeBytes ?? DEFAULT_UPLOAD_MAX_SIZE_BYTES
  const modeLabel =
    request.mode === 'single_client_trial_balance'
      ? ca('proposalCards.agent.csvMode.singleClientTrialBalance')
      : request.mode === 'bulk_clients'
        ? ca('proposalCards.agent.csvMode.bulkClients')
        : null
  return (
    <InlineActionCard
      id={request.id}
      title={request.label ?? ca('proposalCards.agent.csvTitle')}
      detail={request.message ?? request.reason}
      meta={compactParts([
        modeLabel,
        request.accept,
        limit ? ca('proposalCards.agent.fileLimit', { limit }) : null,
      ])}
      icon={<UploadCloud className="h-3.5 w-3.5" />}
    >
      {(request.expectedColumns?.length ?? 0) > 0 && (
        <p className="mt-1.5 text-xs text-foreground/50 leading-snug">
          {ca('proposalCards.agent.expectedColumns', {
            columns: request.expectedColumns?.slice(0, 8).join(', ') ?? '',
          })}
        </p>
      )}
      {state === 'uploaded' && (
        <p className="mt-1.5 text-xs text-success/90">{ca('proposalCards.agent.uploaded')}</p>
      )}
      {state === 'dismissed' && (
        <p className="mt-1.5 text-xs text-foreground/45">
          {ca('proposalCards.common.statusCancelled')}
        </p>
      )}
      {errorMessage && <p className="mt-1.5 text-xs text-destructive">{errorMessage}</p>}
      {state !== 'uploaded' && state !== 'dismissed' && (
        <div className="mt-2 space-y-2">
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            disabled={state === 'uploading'}
            onChange={(event: ChangeEvent<HTMLInputElement>) => {
              const picked = event.target.files?.[0]
              if (!picked) return
              if (picked.size > maxSize) {
                setErrorMessage(ca('proposalCards.agent.fileTooLarge'))
                event.target.value = ''
                return
              }
              setFile(picked)
              setErrorMessage(null)
            }}
            className="block w-full text-xs file:mr-2 file:rounded-md file:border-0 file:bg-foreground/[0.06] file:px-2 file:py-1 file:text-foreground/75 hover:file:bg-foreground/[0.1]"
          />
          {file && (
            <p className="text-xs text-foreground/50">
              {file.name} · {formatBytes(file.size) ?? file.size.toLocaleString(locale)}
            </p>
          )}
          <div className="flex items-center gap-3 text-xs">
            <button
              type="button"
              disabled={state === 'uploading'}
              onClick={async () => {
                if (!file) {
                  setErrorMessage(ca('proposalCards.agent.chooseFileFirst'))
                  return
                }
                const path = safeBffPath(request.submitPath, CSV_UPLOAD_BFF_PATHS)
                if (!path) {
                  setErrorMessage(ca('proposalCards.agent.endpointMissing'))
                  return
                }
                const form = new FormData()
                form.append('file', file)
                if (request.mode) form.append('mode', request.mode)
                setState('uploading')
                setErrorMessage(null)
                try {
                  const response = await fetch(path, {
                    method: 'POST',
                    credentials: 'include',
                    headers: buildAgentToolActionHeaders('propose_csv_upload', request.id),
                    body: form,
                  })
                  const json: unknown = await response.json().catch(() => ({}))
                  if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
                  setFile(null)
                  if (inputRef.current) inputRef.current.value = ''
                  setState('uploaded')
                } catch (err) {
                  setState('idle')
                  setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
                }
              }}
              className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state === 'uploading'
                ? ca('proposalCards.agent.submitting')
                : ca('proposalCards.agent.csvAction')}
            </button>
            <button
              type="button"
              disabled={state === 'uploading'}
              onClick={() => {
                setFile(null)
                if (inputRef.current) inputRef.current.value = ''
                setErrorMessage(null)
                setState('dismissed')
              }}
              className="text-foreground/45 hover:text-foreground/70 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              {ca('proposalCards.common.buttonCancel')}
            </button>
          </div>
        </div>
      )}
    </InlineActionCard>
  )
}

function MultiSelectCard({
  request,
  onApplyAgentChoice,
}: {
  request: MultiSelectRequest
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
}) {
  const ca = useTranslations('chatAssistant')
  const [selected, setSelected] = useState<string[]>(request.preselected ?? [])
  const [state, setState] = useState<'idle' | 'submitting' | 'submitted'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const options = request.options ?? []
  const min = request.minSelections ?? 0
  const max = request.maxSelections ?? options.length
  const canSubmit = selected.length >= min && selected.length <= max && selected.length > 0
  const isSubmitting = state === 'submitting'
  const isSubmitted = state === 'submitted'

  return (
    <InlineActionCard
      id={request.id}
      title={request.title ?? ca('proposalCards.agent.multiSelectTitle')}
      detail={request.reason}
    >
      <div className="mt-2 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              disabled={isSubmitting || isSubmitted}
              onClick={() =>
                setSelected((prev) =>
                  active
                    ? prev.filter((value) => value !== option.value)
                    : prev.length >= max
                      ? prev
                      : [...prev, option.value]
                )
              }
              className={cn(
                'rounded-full border px-2 py-1 text-xs transition-colors',
                active
                  ? 'border-primary/35 bg-primary/12 text-primary'
                  : 'border-foreground/[0.08] bg-foreground/[0.03] text-foreground/65 hover:bg-foreground/[0.06]',
                (isSubmitting || isSubmitted) && 'cursor-not-allowed opacity-60'
              )}
            >
              {active && <Check className="mr-1 inline h-3 w-3" />}
              {option.label}
            </button>
          )
        })}
      </div>
      {isSubmitted && (
        <p className="mt-1.5 text-xs text-success/90">{ca('proposalCards.agent.saved')}</p>
      )}
      {errorMessage && <p className="mt-1.5 text-xs text-destructive">{errorMessage}</p>}
      {!isSubmitted && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
            type="button"
            disabled={!canSubmit || isSubmitting}
            onClick={async () => {
              const path = safeBffPath(request.submitPath, CHOICE_SUBMIT_BFF_PATHS)
              if (!path) {
                setErrorMessage(ca('proposalCards.agent.endpointMissing'))
                return
              }
              setState('submitting')
              setErrorMessage(null)
              try {
                const selectedOptions = options.filter((option) => selected.includes(option.value))
                if (onApplyAgentChoice) {
                  const handled = await onApplyAgentChoice({
                    id: request.id,
                    kind: 'multi_select',
                    title: request.title,
                    submitPath: request.submitPath,
                    values: selected,
                    selectedOptions,
                  })
                  if (handled) {
                    setState('submitted')
                    return
                  }
                }
                if (isHostAppliedChoicePath(path)) {
                  throw new Error(ca('proposalCards.agent.endpointMissing'))
                }
                const response = await fetch(path, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_multi_select', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ values: selected }),
                })
                const json: unknown = await response.json().catch(() => ({}))
                if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
                setState('submitted')
              } catch (err) {
                setState('idle')
                setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
              }
            }}
            className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? ca('proposalCards.agent.submitting')
              : ca('proposalCards.agent.submitChoices')}
          </button>
          <span className="text-foreground/45">
            {ca('proposalCards.agent.selectionCount', { count: selected.length })}
          </span>
        </div>
      )}
    </InlineActionCard>
  )
}

function SingleSelectCard({
  request,
  onApplyAgentChoice,
}: {
  request: SingleSelectRequest
  onApplyAgentChoice?: (choice: AgentChoiceSelection) => boolean | Promise<boolean>
}) {
  const ca = useTranslations('chatAssistant')
  const [selected, setSelected] = useState<string | null>(request.preselected ?? null)
  const [state, setState] = useState<'idle' | 'submitting' | 'submitted'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const options = request.options ?? []
  const isSubmitting = state === 'submitting'
  const isSubmitted = state === 'submitted'

  return (
    <InlineActionCard
      id={request.id}
      title={request.title ?? ca('proposalCards.agent.singleSelectTitle')}
      detail={request.reason}
    >
      <div className="mt-2 space-y-1">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            disabled={isSubmitting || isSubmitted}
            onClick={() => {
              setSelected(option.value)
              setErrorMessage(null)
            }}
            className={cn(
              'w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
              selected === option.value
                ? 'border-primary/35 bg-primary/12 text-primary'
                : 'border-foreground/[0.08] bg-foreground/[0.03] text-foreground/65 hover:bg-foreground/[0.06]',
              (isSubmitting || isSubmitted) && 'cursor-not-allowed opacity-60'
            )}
          >
            {option.label}
            {option.helper && (
              <span className="block text-[10px] text-foreground/45">{option.helper}</span>
            )}
          </button>
        ))}
      </div>
      {isSubmitted && (
        <p className="mt-1.5 text-xs text-success/90">{ca('proposalCards.agent.saved')}</p>
      )}
      {errorMessage && <p className="mt-1.5 text-xs text-destructive">{errorMessage}</p>}
      {!isSubmitted && (
        <div className="mt-2 flex items-center gap-3 text-xs">
          <button
            type="button"
            disabled={!selected || isSubmitting}
            onClick={async () => {
              if (!selected) return
              const path = safeBffPath(request.submitPath, CHOICE_SUBMIT_BFF_PATHS)
              if (!path) {
                setErrorMessage(ca('proposalCards.agent.endpointMissing'))
                return
              }
              setState('submitting')
              setErrorMessage(null)
              try {
                const selectedOption = options.find((option) => option.value === selected)
                if (onApplyAgentChoice) {
                  const handled = await onApplyAgentChoice({
                    id: request.id,
                    kind: 'single_select',
                    title: request.title,
                    submitPath: request.submitPath,
                    value: selected,
                    selectedOptions: selectedOption ? [selectedOption] : [],
                  })
                  if (handled) {
                    setState('submitted')
                    return
                  }
                }
                if (isHostAppliedChoicePath(path)) {
                  throw new Error(ca('proposalCards.agent.endpointMissing'))
                }
                const response = await fetch(path, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    ...buildAgentToolActionHeaders('propose_single_select', request.id),
                  },
                  credentials: 'include',
                  body: JSON.stringify({ value: selected }),
                })
                const json: unknown = await response.json().catch(() => ({}))
                if (!response.ok) throw new Error(extractErrorMessage(json, response.status))
                setState('submitted')
              } catch (err) {
                setState('idle')
                setErrorMessage(err instanceof Error ? err.message : 'Unknown error')
              }
            }}
            className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting
              ? ca('proposalCards.agent.submitting')
              : ca('proposalCards.agent.submitChoice')}
          </button>
        </div>
      )}
    </InlineActionCard>
  )
}

function ClientCreateCard({ request }: { request: ClientCreateRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.clientCreateBlocked')
          : ca('proposalCards.agent.clientCreateTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : request.message}
      meta={compactParts([
        request.businessName,
        request.companyNumber,
        request.industry,
        request.location,
        request.customerEmail,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.clientCreateAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        isBlocked
          ? undefined
          : () => {
              openInNewTab(
                mercuryPath(locale, '/advisor/clients/create', {
                  company: request.businessName,
                  companyNumber: request.companyNumber,
                  email: request.customerEmail,
                  source: 'venus-ai',
                })
              )
            }
      }
    />
  )
}

function ValuationSessionCard({ request }: { request: ValuationSessionRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const synced = request.hasSyncedFinancials ? ca('proposalCards.agent.syncedFinancials') : null
  const clientId = request.clientId
  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.valuationSessionBlocked')
          : ca('proposalCards.agent.valuationSessionTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : request.message}
      meta={compactParts([
        request.businessName ?? undefined,
        request.customerEmail ?? undefined,
        synced,
        request.latestValuationId ? ca('proposalCards.agent.hasPriorValuation') : null,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.valuationSessionAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        !isBlocked && clientId
          ? () => {
              if (typeof window !== 'undefined') {
                window.location.href = venusValuationSessionPath(locale, clientId)
              }
            }
          : undefined
      }
    />
  )
}

function ImportReviewCard({ request }: { request: ImportReviewRequest }) {
  const ca = useTranslations('chatAssistant')
  const locale = useLocale()
  const isBlocked = request.status === 'blocked'
  const providers = (request.accountingSources ?? [])
    .map((source) => source.provider)
    .filter(Boolean)
    .slice(0, 3)
  const flagCount =
    request.actionableFlagCount && request.actionableFlagCount > 0
      ? ca('proposalCards.agent.flagCount', { count: request.actionableFlagCount })
      : null
  const topFlags = request.topFlags ?? []

  return (
    <InlineActionCard
      id={request.id}
      title={
        isBlocked
          ? ca('proposalCards.agent.importReviewBlocked')
          : ca('proposalCards.agent.importReviewTitle')
      }
      detail={isBlocked ? (request.message ?? request.reason) : request.message}
      meta={compactParts([
        request.businessName ?? undefined,
        providers.join(', '),
        flagCount,
        request.stpStatus ?? undefined,
      ])}
      tone={isBlocked ? 'blocked' : 'default'}
      actionLabel={ca('proposalCards.agent.importReviewAction')}
      actionSuccessLabel={ca('proposalCards.agent.opened')}
      onAction={
        !isBlocked && request.clientId
          ? () =>
              openInNewTab(
                mercuryPath(locale, '/advisor/import-review', {
                  clientId: request.clientId,
                  source: 'venus-ai',
                })
              )
          : undefined
      }
    >
      {topFlags.length > 0 && (
        <div className="mt-2 space-y-1">
          {topFlags.slice(0, 3).map((flag, index) => (
            <div
              key={`${flag.year ?? 'year'}-${flag.code ?? flag.field ?? index}`}
              className="rounded-md bg-foreground/[0.035] px-2 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground/75 truncate">
                  {flag.code ?? flag.field ?? ca('proposalCards.clientDataReadiness.flagsLabel')}
                </span>
                {flag.severity && (
                  <span className="shrink-0 rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/55">
                    {flag.severity}
                  </span>
                )}
              </div>
              {flag.message && (
                <p className="mt-0.5 text-foreground/55" lang={locale}>
                  {flag.message}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </InlineActionCard>
  )
}

export function ChatAssistantAgentActionCards({
  message,
  onApplyAgentChoice,
}: ChatAssistantAgentActionCardsProps) {
  const hasCards = useMemo(
    () =>
      Boolean(
        (message.ownerProfileAnswerRequests?.length ?? 0) > 0 ||
          (message.integrationConnectRequests?.length ?? 0) > 0 ||
          (message.integrationSyncRequests?.length ?? 0) > 0 ||
          (message.syncStatusPreviews?.length ?? 0) > 0 ||
          (message.ownerInviteAccountantRequests?.length ?? 0) > 0 ||
          (message.ownerReminderRequests?.length ?? 0) > 0 ||
          (message.listingVisibilityRequests?.length ?? 0) > 0 ||
          (message.shareTokenRequests?.length ?? 0) > 0 ||
          (message.shareTokenRevokeRequests?.length ?? 0) > 0 ||
          (message.valuationMethodPreferenceRequests?.length ?? 0) > 0 ||
          (message.bulkValuationRunRequests?.length ?? 0) > 0 ||
          (message.listingFieldUpdateRequests?.length ?? 0) > 0 ||
          (message.valuationDefaultsRequests?.length ?? 0) > 0 ||
          (message.valuationDefaultsPreviews?.length ?? 0) > 0 ||
          (message.workspaceClientsPreviews?.length ?? 0) > 0 ||
          (message.acknowledgeWarningRequests?.length ?? 0) > 0 ||
          (message.secureCredentialRequests?.length ?? 0) > 0 ||
          (message.csvUploadRequests?.length ?? 0) > 0 ||
          (message.multiSelectRequests?.length ?? 0) > 0 ||
          (message.singleSelectRequests?.length ?? 0) > 0 ||
          (message.clientCreateRequests?.length ?? 0) > 0 ||
          (message.valuationSessionRequests?.length ?? 0) > 0 ||
          (message.importReviewRequests?.length ?? 0) > 0
      ),
    [message]
  )

  if (!hasCards) return null

  return (
    <div className="mt-3 pt-3 border-t border-foreground/[0.08] space-y-2">
      {message.ownerProfileAnswerRequests?.map((request) => (
        <OwnerProfileCard key={request.id} request={request} />
      ))}
      {message.integrationConnectRequests?.map((request) => (
        <IntegrationCard key={request.id} request={request} />
      ))}
      {message.integrationSyncRequests?.map((request) => (
        <IntegrationSyncCard key={request.id} request={request} />
      ))}
      {message.syncStatusPreviews?.map((preview) => (
        <SyncStatusPreviewCard key={preview.id} preview={preview} />
      ))}
      {message.ownerInviteAccountantRequests?.map((request) => (
        <OwnerInviteAccountantCard key={request.id} request={request} />
      ))}
      {message.ownerReminderRequests?.map((request) => (
        <OwnerReminderCard key={request.id} request={request} />
      ))}
      {message.listingVisibilityRequests?.map((request) => (
        <ListingVisibilityCard key={request.id} request={request} />
      ))}
      {message.shareTokenRequests?.map((request) => (
        <ShareTokenCard key={request.id} request={request} />
      ))}
      {message.shareTokenRevokeRequests?.map((request) => (
        <ShareTokenRevokeCard key={request.id} request={request} />
      ))}
      {message.valuationMethodPreferenceRequests?.map((request) => (
        <ValuationMethodPreferenceCard key={request.id} request={request} />
      ))}
      {message.bulkValuationRunRequests?.map((request) => (
        <BulkValuationRunCard key={request.id} request={request} />
      ))}
      {message.listingFieldUpdateRequests?.map((request) => (
        <ListingFieldUpdateCard key={request.id} request={request} />
      ))}
      {message.workspaceClientsPreviews?.map((preview) => (
        <WorkspaceClientsPreviewCard key={preview.id} preview={preview} />
      ))}
      {message.valuationDefaultsRequests?.map((request) => (
        <ValuationDefaultsCard key={request.id} request={request} />
      ))}
      {message.valuationDefaultsPreviews?.map((preview) => (
        <ValuationDefaultsPreviewCard key={preview.id} preview={preview} />
      ))}
      {message.acknowledgeWarningRequests?.map((request) => (
        <AcknowledgeWarningCard key={request.id} request={request} />
      ))}
      {message.secureCredentialRequests?.map((request) => (
        <SecureCredentialCard key={request.id} request={request} />
      ))}
      {message.csvUploadRequests?.map((request) => (
        <CsvUploadCard key={request.id} request={request} />
      ))}
      {message.multiSelectRequests?.map((request) => (
        <MultiSelectCard
          key={request.id}
          request={request}
          onApplyAgentChoice={onApplyAgentChoice}
        />
      ))}
      {message.singleSelectRequests?.map((request) => (
        <SingleSelectCard
          key={request.id}
          request={request}
          onApplyAgentChoice={onApplyAgentChoice}
        />
      ))}
      {message.clientCreateRequests?.map((request) => (
        <ClientCreateCard key={request.id} request={request} />
      ))}
      {message.valuationSessionRequests?.map((request) => (
        <ValuationSessionCard key={request.id} request={request} />
      ))}
      {message.importReviewRequests?.map((request) => (
        <ImportReviewCard key={request.id} request={request} />
      ))}
    </div>
  )
}
