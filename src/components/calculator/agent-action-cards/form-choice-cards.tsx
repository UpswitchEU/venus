'use client'

import { Check, KeyRound, UploadCloud } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { ChangeEvent, FormEvent } from 'react'
import { useCallback, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'
import type {
  AgentChoiceSelection,
  CsvUploadRequest,
  MultiSelectRequest,
  SecureCredentialRequest,
  SingleSelectRequest,
} from '../ChatAssistantTypes'
import {
  buildAgentToolActionHeaders,
  CHOICE_SUBMIT_BFF_PATHS,
  CSV_UPLOAD_BFF_PATHS,
  compactParts,
  DEFAULT_UPLOAD_ACCEPT,
  DEFAULT_UPLOAD_MAX_SIZE_BYTES,
  extractErrorMessage,
  formatBytes,
  InlineActionCard,
  isHostAppliedChoicePath,
  providerLabel,
  SECURE_CREDENTIAL_BFF_PATHS,
  safeBffPath,
} from './shared'

export function SecureCredentialCard({
  request,
  integrationsEnabled = false,
}: {
  request: SecureCredentialRequest
  integrationsEnabled?: boolean
}) {
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
        !integrationsEnabled
          ? ca('proposalCards.agent.integrationLocked')
          : provider
            ? ca('proposalCards.agent.credentialTitleWithProvider', { provider })
            : ca('proposalCards.agent.credentialTitle')
      }
      detail={
        integrationsEnabled
          ? (request.message ?? request.reason ?? ca('proposalCards.agent.credentialSafeHint'))
          : ca('proposalCards.agent.integrationPlanLocked')
      }
      meta={compactParts([request.submitPath])}
      tone={integrationsEnabled ? 'default' : 'blocked'}
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
      {integrationsEnabled && !isDone && (
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

export function CsvUploadCard({ request }: { request: CsvUploadRequest }) {
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

export function MultiSelectCard({
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

export function SingleSelectCard({
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
