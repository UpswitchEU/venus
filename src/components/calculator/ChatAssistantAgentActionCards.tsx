'use client'

import { motion } from 'framer-motion'
import { Check, KeyRound, Link2, UploadCloud } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'
import { getMercuryUrl } from '@/utils/getMercuryUrl'
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

function compactParts(parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
}

function safeBffPath(path: string | undefined): string {
  if (typeof path !== 'string' || !path.startsWith('/api/')) return ''
  return path
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
        const rawProvider = request.provider?.trim()
        if (request.authMode === 'oauth' && rawProvider) {
          const response = await fetch(`/api/integrations/accounting/${rawProvider}/authorize`, {
            method: 'GET',
            credentials: 'include',
            headers: buildAgentToolActionHeaders('propose_integration_connect', request.id),
          }).catch(() => null)
          if (response?.ok) {
            const json = (await response.json().catch(() => ({}))) as {
              authorize_url?: string
              authorizeUrl?: string
            }
            const authorizeUrl = json.authorize_url ?? json.authorizeUrl
            if (authorizeUrl) {
              openInNewTab(authorizeUrl)
              return
            }
          }
        }
        openInNewTab(
          mercuryPath(locale, '/advisor/settings', {
            tab: 'integrations',
            provider: request.provider,
          })
        )
      }}
    />
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

      const path = safeBffPath(request.submitPath)
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
                const path = safeBffPath(request.submitPath)
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

function MultiSelectCard({ request }: { request: MultiSelectRequest }) {
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
              const path = safeBffPath(request.submitPath)
              if (!path) {
                setErrorMessage(ca('proposalCards.agent.endpointMissing'))
                return
              }
              setState('submitting')
              setErrorMessage(null)
              try {
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

function SingleSelectCard({ request }: { request: SingleSelectRequest }) {
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
              const path = safeBffPath(request.submitPath)
              if (!path) {
                setErrorMessage(ca('proposalCards.agent.endpointMissing'))
                return
              }
              setState('submitting')
              setErrorMessage(null)
              try {
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

export function ChatAssistantAgentActionCards({ message }: ChatAssistantAgentActionCardsProps) {
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
        <OwnerProfileCard key={request.id} request={request} />
      ))}
      {message.integrationConnectRequests?.map((request) => (
        <IntegrationCard key={request.id} request={request} />
      ))}
      {message.secureCredentialRequests?.map((request) => (
        <SecureCredentialCard key={request.id} request={request} />
      ))}
      {message.csvUploadRequests?.map((request) => (
        <CsvUploadCard key={request.id} request={request} />
      ))}
      {message.multiSelectRequests?.map((request) => (
        <MultiSelectCard key={request.id} request={request} />
      ))}
      {message.singleSelectRequests?.map((request) => (
        <SingleSelectCard key={request.id} request={request} />
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
