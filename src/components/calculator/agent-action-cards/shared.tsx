'use client'

import { ProposalCardShell, type ProposalCardTone } from '@upswitch/ai-dock-shells'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useCallback, useState } from 'react'
import { getMercuryUrl } from '@/utils/getMercuryUrl'

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

export const DEFAULT_UPLOAD_ACCEPT =
  '.csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const DEFAULT_UPLOAD_MAX_SIZE_BYTES = 20 * 1024 * 1024
export const DEFAULT_SHARE_TOKEN_EXPIRES_DAYS = 30
export const MIN_SHARE_TOKEN_EXPIRES_DAYS = 1
export const MAX_SHARE_TOKEN_EXPIRES_DAYS = 90
export const MIN_SHARE_TOKEN_USES = 1
export const MAX_SHARE_TOKEN_USES = 100
export const OWNER_REMINDER_MAX_LENGTH = 1000

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

export const SECURE_CREDENTIAL_BFF_PATHS = [
  /^\/api\/integrations\/accounting\/(?:yuki|bizzcontrol|octopus)\/connect$/,
] as const

export const CSV_UPLOAD_BFF_PATHS = [/^\/api\/import\/(?:trial-balance|bulk-clients)$/] as const

export const CHOICE_SUBMIT_BFF_PATHS = [
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

export function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
}

export function safeBffPath(path: string | undefined, allowedPaths: readonly RegExp[]): string {
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

export function isHostAppliedChoicePath(path: string): boolean {
  return HOST_APPLIED_CHOICE_PATHS.has(path)
}

export function buildAgentToolActionHeaders(
  toolName: string,
  proposalId?: string
): Record<string, string> {
  return {
    [AGENT_TOOL_ACTION_NAME_HEADER]: toolName,
    ...(proposalId ? { [AGENT_TOOL_ACTION_PROPOSAL_ID_HEADER]: proposalId } : {}),
  }
}

export function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>
    for (const key of ['message', 'error']) {
      if (typeof record[key] === 'string' && record[key].trim()) return record[key]
    }
  }
  return `HTTP ${status}`
}

export function openInNewTab(url: string) {
  if (typeof window === 'undefined') return
  window.open(url, '_blank', 'noopener,noreferrer')
}

export function mercuryPath(
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

export function inferRegistryCountryFromCompanyNumber(value: string): 'BE' | 'NL' | null {
  const trimmed = value.trim()
  const digits = trimmed.replace(/\D/g, '')
  if (/^(NL|KVK)\b/i.test(trimmed) || digits.length === 8) return 'NL'
  if (/^(BE|KBO)\b/i.test(trimmed) || digits.length === 10) return 'BE'
  return null
}

export function venusValuationSessionPath(locale: string, clientId: string) {
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

export function stringifyActionValue(value: unknown) {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return Number(value).toLocaleString('nl-BE')
  if (typeof value === 'string') return value
  if (value === null) return 'None'
  return null
}

export function providerLabel(provider?: string) {
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

export function fallbackMethodLabel(method: string) {
  return (
    VALUATION_METHOD_LABELS[method] ??
    method
      .split('_')
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ')
  )
}

export function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
}

export function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

export function listingSettingsPath(locale: string, listingId: string, action: string) {
  return mercuryPath(locale, `/business/listing/${encodeURIComponent(listingId)}/settings`, {
    action,
  })
}

export function buildShareUrl(listingId: string, token: string) {
  if (typeof window === 'undefined') return `/marketplace/${listingId}?token=${token}`
  return `${window.location.origin}/marketplace/${listingId}?token=${encodeURIComponent(token)}`
}

export function InlineActionCard({
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
  const shellTone: ProposalCardTone =
    decision === 'sent'
      ? 'success'
      : decision === 'dismissed'
        ? 'rejected'
        : tone === 'blocked'
          ? 'warning'
          : 'idle'
  const primaryLabel = isSubmitting
    ? (actionPendingLabel ?? ca('proposalCards.agent.submitting'))
    : (actionLabel ?? ca('proposalCards.agent.continue'))

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
    >
      <ProposalCardShell
        title={title}
        subhead={detail}
        reason={meta.length > 0 ? meta.join(' · ') : undefined}
        tone={shellTone}
        primaryLabel={(decision === 'idle' || isSubmitting) && canAct ? primaryLabel : undefined}
        onPrimary={(decision === 'idle' || isSubmitting) && canAct ? handleAction : undefined}
        rejectLabel={
          (decision === 'idle' || isSubmitting) && canAct
            ? ca('proposalCards.common.buttonCancel')
            : undefined
        }
        onReject={
          (decision === 'idle' || isSubmitting) && canAct
            ? () => setDecision('dismissed')
            : undefined
        }
        isInFlight={isSubmitting}
        successNote={
          decision === 'sent' ? (actionSuccessLabel ?? ca('proposalCards.agent.sent')) : undefined
        }
        errorMessage={errorMessage}
      >
        {icon ? <div className="mb-1 text-primary/80">{icon}</div> : null}
        {children}
        {decision === 'dismissed' ? (
          <p className="mt-1.5 text-xs text-foreground/45">
            {ca('proposalCards.common.statusCancelled')}
          </p>
        ) : null}
      </ProposalCardShell>
    </motion.div>
  )
}
