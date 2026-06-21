import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/design-system/utils'
import type { AttentionItem, AttentionSeverity } from './AttentionSummaryModel'
import type { QualityWarning } from './ChatAssistantTypes'

const ATTENTION_SEVERITY_DOT: Record<AttentionSeverity, string> = {
  block: 'bg-rose-500',
  warn: 'bg-amber-500',
  info: 'bg-sky-500',
}

export interface InlineFixLabels {
  apply: string
  applying: string
  cancel: string
  note: string
}

interface AttentionCardProps {
  item: AttentionItem
  isOpen: boolean
  compact?: boolean
  dismissLabel: string
  onToggle: () => void
  onResolve: () => void
  onQuickFix: () => void
  onJump: () => void
  onDismiss: () => void
  onInlineFix?: (values: Record<string, number>) => void | Promise<void>
  inlineLabels?: InlineFixLabels
  onQualityJump?: () => void
}

export function AttentionCard({
  item,
  isOpen,
  compact = false,
  dismissLabel,
  onToggle,
  onResolve,
  onQuickFix,
  onJump,
  onDismiss,
  onInlineFix,
  inlineLabels,
  onQualityJump,
}: AttentionCardProps) {
  const [fillOpen, setFillOpen] = useState(false)
  const hasBody = Boolean(item.body && item.body.trim().length > 0)
  const inlineFixFields = item.inlineFix?.fields ?? []
  const hasInlineFix = Boolean(inlineFixFields.length > 0 && onInlineFix && inlineLabels)
  const hasQualityJump = Boolean(item.jumpAnchor && onQualityJump && !hasInlineFix)
  const hasResolve = Boolean(item.ctaLabel && item.ctaPrompt)
  const showChatResolve = hasResolve && !hasInlineFix && !hasQualityJump
  const hasQuickFix = Boolean(item.quickFixLabel)
  const hasJump = Boolean(item.jumpLabel)
  const quickFixIsPrimary = hasQuickFix && !hasResolve

  const primaryButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs font-medium sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'bg-primary/10 text-primary/90 border border-primary/15',
    'hover:bg-primary/15 hover:text-primary hover:border-primary/25 transition-colors',
    'touch-manipulation'
  )
  const secondaryButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'bg-foreground/[0.04] text-foreground/75 border border-foreground/[0.08]',
    'hover:bg-foreground/[0.08] hover:text-foreground hover:border-foreground/[0.14] transition-colors',
    'touch-manipulation'
  )
  const linkButtonClass = cn(
    'min-h-11 rounded-full px-3.5 py-1.5 text-xs sm:min-h-0 sm:px-2.5 sm:py-0.5',
    'text-foreground/55 hover:text-foreground/85 hover:bg-foreground/[0.04] transition-colors',
    'touch-manipulation'
  )
  const titleClassName = cn(
    'flex-1 min-w-0 text-left text-sm leading-snug text-foreground/90',
    !isOpen && 'line-clamp-2',
    hasBody && 'cursor-pointer hover:text-foreground touch-manipulation'
  )

  return (
    <div
      className={cn(
        'group flex flex-col gap-1.5',
        compact
          ? 'px-3.5 py-2.5'
          : 'rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] px-3.5 py-2.5'
      )}
      data-testid={`attention-item-${item.key}`}
      data-severity={item.severity}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={cn(
            'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
            ATTENTION_SEVERITY_DOT[item.severity]
          )}
          aria-hidden
        />
        {hasBody ? (
          <button
            type="button"
            onClick={onToggle}
            className={titleClassName}
            aria-expanded={isOpen}
          >
            {item.title}
          </button>
        ) : (
          <p className={titleClassName} title={item.title}>
            {item.title}
          </p>
        )}
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={cn(
            'shrink-0 h-11 w-11 rounded-md flex items-center justify-center sm:h-6 sm:w-6',
            'text-foreground/30 hover:text-foreground/70 hover:bg-foreground/[0.06] transition-colors',
            'touch-manipulation'
          )}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      </div>

      <AnimatePresence initial={false}>
        {isOpen && hasBody && (
          <motion.p
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="pl-5 text-xs leading-relaxed text-foreground/65"
          >
            {item.body}
          </motion.p>
        )}
      </AnimatePresence>

      {(hasInlineFix || hasQualityJump || showChatResolve || hasQuickFix || hasJump) && (
        <div className="pl-5 flex flex-wrap items-center gap-1.5">
          {hasInlineFix && (
            <button
              type="button"
              onClick={() => setFillOpen((v) => !v)}
              aria-expanded={fillOpen}
              className={primaryButtonClass}
            >
              {item.ctaLabel}
            </button>
          )}
          {hasQualityJump && (
            <button type="button" onClick={onQualityJump} className={primaryButtonClass}>
              {item.ctaLabel}
            </button>
          )}
          {showChatResolve && (
            <button type="button" onClick={onResolve} className={primaryButtonClass}>
              {item.ctaLabel}
            </button>
          )}
          {hasQuickFix && (
            <button
              type="button"
              onClick={onQuickFix}
              className={quickFixIsPrimary ? primaryButtonClass : secondaryButtonClass}
              data-primary={quickFixIsPrimary || undefined}
            >
              {item.quickFixLabel}
            </button>
          )}
          {hasJump && (
            <button type="button" onClick={onJump} className={linkButtonClass}>
              {item.jumpLabel}
            </button>
          )}
        </div>
      )}

      <AnimatePresence initial={false}>
        {hasInlineFix && fillOpen && onInlineFix && inlineLabels && (
          <InlineFixForm
            key="inline-fix"
            fields={inlineFixFields}
            labels={inlineLabels}
            onApply={onInlineFix}
            onCancel={() => setFillOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

interface InlineFixFormProps {
  fields: NonNullable<QualityWarning['inlineFix']>['fields']
  labels: InlineFixLabels
  onApply: (values: Record<string, number>) => void | Promise<void>
  onCancel: () => void
}

function InlineFixForm({ fields, labels, onApply, onCancel }: InlineFixFormProps) {
  const [raw, setRaw] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const mountedRef = useRef(true)
  useEffect(() => () => void (mountedRef.current = false), [])

  const anyFilled = fields.some((field) => (raw[field.key] ?? '').length > 0)

  const handleApply = async () => {
    if (submitting || !anyFilled) return
    const values: Record<string, number> = {}
    for (const field of fields) {
      const digits = (raw[field.key] ?? '').replace(/\D/g, '')
      values[field.key] = digits ? Number.parseInt(digits, 10) : 0
    }
    setSubmitting(true)
    try {
      await onApply(values)
    } finally {
      if (mountedRef.current) setSubmitting(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.16 }}
      className="pl-5 overflow-hidden"
    >
      <div className="mt-1 space-y-2 rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] p-3">
        {fields.map((field) => (
          <label key={field.key} className="block">
            <span className="text-xs font-medium text-foreground/80">{field.label}</span>
            {field.hint && (
              <span className="ml-1.5 text-[11px] text-foreground/45">{field.hint}</span>
            )}
            <div className="mt-1 flex items-center rounded-lg border border-foreground/[0.10] bg-background focus-within:border-primary/40 transition-colors">
              <span className="pl-2.5 pr-1 text-sm text-foreground/40 select-none">€</span>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                aria-label={field.label}
                value={raw[field.key] ?? ''}
                onChange={(event) =>
                  setRaw((prev) => ({
                    ...prev,
                    [field.key]: event.target.value.replace(/\D/g, ''),
                  }))
                }
                disabled={submitting}
                placeholder="0"
                className="min-h-11 w-full bg-transparent py-2 pr-2.5 text-sm text-foreground tabular-nums outline-none disabled:opacity-50 sm:min-h-0 sm:py-1.5"
              />
            </div>
          </label>
        ))}
        <p className="text-[11px] leading-relaxed text-foreground/45">{labels.note}</p>
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={handleApply}
            disabled={submitting || !anyFilled}
            className={cn(
              'min-h-11 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors touch-manipulation sm:min-h-0 sm:px-3 sm:py-1',
              'bg-primary text-primary-foreground hover:bg-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed'
            )}
          >
            {submitting ? labels.applying : labels.apply}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className={cn(
              'min-h-11 rounded-full px-3.5 py-1.5 text-xs text-foreground/55 sm:min-h-0 sm:px-2.5 sm:py-1',
              'hover:text-foreground/85 hover:bg-foreground/[0.04] transition-colors touch-manipulation',
              'disabled:opacity-50'
            )}
          >
            {labels.cancel}
          </button>
        </div>
      </div>
    </motion.div>
  )
}
