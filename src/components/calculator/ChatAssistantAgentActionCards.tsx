'use client'

import { motion } from 'framer-motion'
import { Check, KeyRound, Link2, UploadCloud } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { useMemo, useState } from 'react'
import { cn } from '@/design-system/utils'
import type {
  ChatMessage,
  ClientCreateRequest,
  CsvUploadRequest,
  ImportReviewRequest,
  IntegrationConnectRequest,
  MultiSelectRequest,
  OwnerProfileAnswerRequest,
  SecureCredentialRequest,
  SingleSelectRequest,
  ValuationSessionRequest,
} from './ChatAssistantTypes'

interface ChatAssistantAgentActionCardsProps {
  message: ChatMessage
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
  onSendFollowUp?: (content: string) => void
  children?: ReactNode
}

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
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

function formatBytes(value?: number) {
  if (!value || !Number.isFinite(value)) return null
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`
  return `${Math.ceil(value / (1024 * 1024))} MB`
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
  onSendFollowUp,
  children,
}: InlineActionCardProps) {
  const ca = useTranslations('chatAssistant')
  const [decision, setDecision] = useState<'idle' | 'sent' | 'dismissed'>('idle')
  const canAct = typeof onSendFollowUp === 'function' && actionPrompt

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
            <p className="mt-1.5 text-xs text-success/90">{ca('proposalCards.agent.sent')}</p>
          )}
          {decision === 'dismissed' && (
            <p className="mt-1.5 text-xs text-foreground/45">
              {ca('proposalCards.common.statusCancelled')}
            </p>
          )}
          {decision === 'idle' && (actionLabel || canAct) && (
            <div className="mt-2 flex items-center gap-3 text-xs">
              {canAct && (
                <button
                  type="button"
                  onClick={() => {
                    onSendFollowUp?.(actionPrompt)
                    setDecision('sent')
                  }}
                  className="text-primary/85 hover:text-primary transition-colors font-medium"
                >
                  {actionLabel ?? ca('proposalCards.agent.continue')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setDecision('dismissed')}
                className="text-foreground/45 hover:text-foreground/70 transition-colors"
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

function OwnerProfileCard({
  request,
  onSendFollowUp,
}: {
  request: OwnerProfileAnswerRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const value = stringifyActionValue(request.value)
  const title = request.complete
    ? ca('proposalCards.agent.ownerProfileTitleComplete')
    : ca('proposalCards.agent.ownerProfileTitle')
  const label = request.label ?? request.field
  const prompt = compactParts([label, value]).join(': ')

  return (
    <InlineActionCard
      id={request.id}
      title={title}
      detail={compactParts([label, value]).join(' · ') || request.reason}
      meta={compactParts([request.reason])}
      actionLabel={ca('proposalCards.agent.ownerProfileAction')}
      actionPrompt={prompt ? `Save owner profile answer: ${prompt}` : undefined}
      onSendFollowUp={onSendFollowUp}
    />
  )
}

function IntegrationCard({
  request,
  onSendFollowUp,
}: {
  request: IntegrationConnectRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
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
      actionPrompt={provider ? `Connect ${provider}` : 'Connect accounting integration'}
      onSendFollowUp={onSendFollowUp}
    />
  )
}

function SecureCredentialCard({
  request,
  onSendFollowUp,
}: {
  request: SecureCredentialRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const provider = providerLabel(request.provider)
  const fields = request.fields ?? []
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
      actionLabel={ca('proposalCards.agent.credentialAction')}
      actionPrompt={
        provider ? `Open secure credential setup for ${provider}` : 'Open secure credential setup'
      }
      onSendFollowUp={onSendFollowUp}
    >
      {fields.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {fields.slice(0, 5).map((field) => (
            <span
              key={field.key}
              className="rounded-full bg-foreground/[0.06] px-1.5 py-0.5 text-[10px] text-foreground/60"
            >
              {field.label}
              {field.required ? ' *' : ''}
            </span>
          ))}
        </div>
      )}
    </InlineActionCard>
  )
}

function CsvUploadCard({
  request,
  onSendFollowUp,
}: {
  request: CsvUploadRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const limit = formatBytes(request.maxSizeBytes)
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
      actionLabel={ca('proposalCards.agent.csvAction')}
      actionPrompt="Upload financial data CSV"
      onSendFollowUp={onSendFollowUp}
    >
      {(request.expectedColumns?.length ?? 0) > 0 && (
        <p className="mt-1.5 text-xs text-foreground/50 leading-snug">
          {ca('proposalCards.agent.expectedColumns', {
            columns: request.expectedColumns?.slice(0, 8).join(', ') ?? '',
          })}
        </p>
      )}
    </InlineActionCard>
  )
}

function MultiSelectCard({
  request,
  onSendFollowUp,
}: {
  request: MultiSelectRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const [selected, setSelected] = useState<string[]>(request.preselected ?? [])
  const options = request.options ?? []
  const min = request.minSelections ?? 0
  const max = request.maxSelections ?? options.length
  const selectedLabels = options
    .filter((option) => selected.includes(option.value))
    .map((option) => option.label)
  const canSubmit = selected.length >= min && selected.length <= max && selected.length > 0

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
                  : 'border-foreground/[0.08] bg-foreground/[0.03] text-foreground/65 hover:bg-foreground/[0.06]'
              )}
            >
              {active && <Check className="mr-1 inline h-3 w-3" />}
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={!canSubmit || typeof onSendFollowUp !== 'function'}
          onClick={() => onSendFollowUp?.(`Choose: ${selectedLabels.join(', ')}`)}
          className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ca('proposalCards.agent.submitChoices')}
        </button>
        <span className="text-foreground/45">
          {ca('proposalCards.agent.selectionCount', { count: selected.length })}
        </span>
      </div>
    </InlineActionCard>
  )
}

function SingleSelectCard({
  request,
  onSendFollowUp,
}: {
  request: SingleSelectRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const [selected, setSelected] = useState<string | null>(request.preselected ?? null)
  const options = request.options ?? []
  const selectedLabel = options.find((option) => option.value === selected)?.label ?? null

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
            onClick={() => setSelected(option.value)}
            className={cn(
              'w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
              selected === option.value
                ? 'border-primary/35 bg-primary/12 text-primary'
                : 'border-foreground/[0.08] bg-foreground/[0.03] text-foreground/65 hover:bg-foreground/[0.06]'
            )}
          >
            {option.label}
            {option.helper && (
              <span className="block text-[10px] text-foreground/45">{option.helper}</span>
            )}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs">
        <button
          type="button"
          disabled={!selectedLabel || typeof onSendFollowUp !== 'function'}
          onClick={() => selectedLabel && onSendFollowUp?.(`Choose: ${selectedLabel}`)}
          className="text-primary/85 hover:text-primary transition-colors font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {ca('proposalCards.agent.submitChoice')}
        </button>
      </div>
    </InlineActionCard>
  )
}

function ClientCreateCard({
  request,
  onSendFollowUp,
}: {
  request: ClientCreateRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
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
      actionPrompt={
        !isBlocked && request.businessName ? `Create client ${request.businessName}` : undefined
      }
      onSendFollowUp={onSendFollowUp}
    />
  )
}

function ValuationSessionCard({
  request,
  onSendFollowUp,
}: {
  request: ValuationSessionRequest
  onSendFollowUp?: (content: string) => void
}) {
  const ca = useTranslations('chatAssistant')
  const isBlocked = request.status === 'blocked'
  const synced = request.hasSyncedFinancials ? ca('proposalCards.agent.syncedFinancials') : null
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
      actionPrompt={
        !isBlocked && request.clientId
          ? `Open valuation calculator for client ${request.clientId}`
          : undefined
      }
      onSendFollowUp={onSendFollowUp}
    />
  )
}

function ImportReviewCard({
  request,
  onSendFollowUp,
}: {
  request: ImportReviewRequest
  onSendFollowUp?: (content: string) => void
}) {
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
      actionPrompt={
        !isBlocked && request.clientId
          ? `Open import review for client ${request.clientId}`
          : undefined
      }
      onSendFollowUp={onSendFollowUp}
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
  onSendFollowUp,
}: ChatAssistantAgentActionCardsProps) {
  const hasCards = useMemo(
    () =>
      Boolean(
        (message.ownerProfileAnswerRequests?.length ?? 0) > 0 ||
          (message.integrationConnectRequests?.length ?? 0) > 0 ||
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
        <OwnerProfileCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.integrationConnectRequests?.map((request) => (
        <IntegrationCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.secureCredentialRequests?.map((request) => (
        <SecureCredentialCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.csvUploadRequests?.map((request) => (
        <CsvUploadCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.multiSelectRequests?.map((request) => (
        <MultiSelectCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.singleSelectRequests?.map((request) => (
        <SingleSelectCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.clientCreateRequests?.map((request) => (
        <ClientCreateCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.valuationSessionRequests?.map((request) => (
        <ValuationSessionCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
      {message.importReviewRequests?.map((request) => (
        <ImportReviewCard key={request.id} request={request} onSendFollowUp={onSendFollowUp} />
      ))}
    </div>
  )
}
