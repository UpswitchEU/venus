'use client'

import { useTranslations } from 'next-intl'
import type React from 'react'
import { useState } from 'react'
import {
  isDiscussionComplete,
  type ReviewAgenda,
  type ReviewItemKind,
} from '../../features/manual/utils/buildReviewAgenda'

/**
 * BET-299 — "Review & Discuss" pre-lock checkpoint (presentational).
 *
 * Renders the structured agenda from `buildReviewAgenda` (no LLM, no
 * recompute), requires the advisor to acknowledge every high-severity item (or
 * explicitly skip), and offers a hand-off to the existing ChatAssistantDrawer.
 * Purely props-driven so the wizard owns state + persistence + the lock gate;
 * this component renders + reports intent only (keeps it wiring-agnostic and
 * unit-/type-checkable in isolation).
 */
export interface ReviewAndDiscussStepProps {
  agenda: ReviewAgenda
  acknowledgedKeys: ReviewItemKind[]
  onToggleAcknowledge: (key: ReviewItemKind) => void
  notes: string
  onNotesChange: (value: string) => void
  /** Proceed to lock — caller should only act when the gate is satisfied. */
  onConfirm: () => void
  /** Explicit "I've reviewed and accept all" skip (logged by the caller). */
  onSkip: () => void
  onBack?: () => void
  /** Opens the existing ChatAssistantDrawer for a deeper discussion. */
  onAskAi?: () => void
  disabled?: boolean
}

const SEVERITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  info: 'bg-foreground/40',
}

export const ReviewAndDiscussStep: React.FC<ReviewAndDiscussStepProps> = ({
  agenda,
  acknowledgedKeys,
  onToggleAcknowledge,
  notes,
  onNotesChange,
  onConfirm,
  onSkip,
  onBack,
  onAskAi,
  disabled = false,
}) => {
  const [skipAccepted, setSkipAccepted] = useState(false)
  const t = useTranslations('reviewAndDiscuss') as unknown as (
    key: string,
    values?: Record<string, string | number>
  ) => string

  const itemLabel = (kind: ReviewItemKind, count: number): string => {
    switch (kind) {
      case 'quality_warning':
        return t('items.qualityWarning', { count })
      case 'method_mix':
        return t('items.methodMix', { count })
      case 'multiple_sanity':
        return t('items.multipleSanity', { count })
      case 'normalization':
        return t('items.normalization', { count })
      case 'cap_breach':
        return t('items.capBreach', { count })
    }
  }

  const complete = isDiscussionComplete(agenda, acknowledgedKeys, false)

  return (
    <section className="flex flex-col gap-5 p-6" aria-label={t('title')}>
      <header>
        <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
        <p className="mt-1 text-sm text-foreground/60">{t('subtitle')}</p>
      </header>

      {agenda.items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-foreground/10 px-3 py-6 text-center text-sm text-foreground/50">
          {t('empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {agenda.items.map((item) => {
            const mustAck = agenda.acknowledgementKeys.includes(item.kind)
            const acked = acknowledgedKeys.includes(item.kind)
            return (
              <li
                key={item.kind}
                className="flex items-start gap-3 rounded-lg border border-foreground/[0.08] bg-card/40 px-3 py-2.5"
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    SEVERITY_DOT[item.severity] ?? SEVERITY_DOT.info
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-foreground">{itemLabel(item.kind, item.count)}</p>
                  {item.refs?.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {item.refs.map((ref) => (
                        <span
                          key={ref}
                          className="max-w-full break-all rounded-md border border-foreground/10 bg-background/70 px-1.5 py-0.5 font-mono text-[11px] text-foreground/55"
                        >
                          {ref}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {mustAck ? (
                    <label className="mt-1.5 inline-flex cursor-pointer items-center gap-2 text-xs text-foreground/70">
                      <input
                        type="checkbox"
                        checked={acked}
                        disabled={disabled}
                        onChange={() => onToggleAcknowledge(item.kind)}
                        className="h-3.5 w-3.5 rounded border-foreground/30"
                      />
                      {t('acknowledge')}
                    </label>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <div>
        <label
          htmlFor="discussion-notes"
          className="mb-1 block text-xs font-medium text-foreground/60"
        >
          {t('notesLabel')}
        </label>
        <textarea
          id="discussion-notes"
          value={notes}
          disabled={disabled}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={3}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-foreground/40 focus:border-primary/50"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              disabled={disabled}
              className="rounded-lg border border-foreground/15 px-3 py-2 text-sm text-foreground/70 transition-colors hover:text-foreground"
            >
              {t('back')}
            </button>
          ) : null}
          {onAskAi ? (
            <button
              type="button"
              onClick={onAskAi}
              disabled={disabled}
              className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm text-primary transition-colors hover:bg-primary/10"
            >
              {t('askAi')}
            </button>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          <label className="inline-flex max-w-sm cursor-pointer items-center justify-end gap-2 text-right text-xs text-foreground/60">
            <input
              type="checkbox"
              checked={skipAccepted}
              disabled={disabled}
              onChange={(event) => setSkipAccepted(event.target.checked)}
              className="h-3.5 w-3.5 shrink-0 rounded border-foreground/30"
            />
            {t('skipAcknowledgement')}
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onSkip}
              disabled={disabled || !skipAccepted}
              className="rounded-lg px-3 py-2 text-sm text-foreground/55 transition-colors hover:text-foreground/80 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('skip')}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={disabled || !complete}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            >
              {t('confirm')}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
