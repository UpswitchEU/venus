'use client'

/**
 * Engine Review — inline advisor review surface for engine-generated suggestions.
 *
 * Why this exists
 * ----------------
 * The engine pre-computes EBITDA normalization suggestions and tax-latency
 * candidates whenever an accountant pulls a client through the integration
 * flow (Yuki / Exact / etc.) or runs an STP bulk valuation. Both data sets
 * historically lived inside `UnifiedNormalizationModal` — reachable only
 * through a button buried in `ChatAssistantDrawer`. Accountants opening a
 * report in Venus saw no inline cue that this work had been done, which made
 * the integration flow feel like a black box compared to the manual-add flow.
 *
 * This section renders the engine's output inline between Step 3
 * (Multi-Year Financials) and the method-specific sections, so:
 *   1. Tax latencies are visible without opening a modal (the historical gap).
 *   2. Pending normalizations get a prominent "Review N pending" CTA that
 *      opens the existing `UnifiedNormalizationModal` for line-by-line
 *      accept/reject (we deliberately reuse the modal — it's the source of
 *      truth, with search / filter / bulk that doesn't make sense inline).
 *   3. The advisor sees a count summary at a glance (X normalizations · Y
 *      tax latencies) so they can audit the engine's work before committing.
 *
 * Numbering: deliberately renders WITHOUT a SectionStatusCircle. This is a
 * review/audit surface, not a sequential input step — adding a numeric badge
 * would either force a cascade renumber of the carve-out and downstream
 * adaptive sections, or compete with them for the same step number. The
 * slight visual deviation from the rest of the wizard mirrors the slight
 * conceptual deviation: this is a checkpoint, not a question.
 *
 * Skips render entirely when both stores are empty — owners with no
 * imported data don't see an empty section.
 */

import { Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { useTaxLatencyStore } from '../../../store/useTaxLatencyStore'
import { useNormalizationStore } from '../../../store/useNormalizationStore'
import { TaxLatencySection } from '../TaxLatencySection'
import { SECTION_HEADER_ROW_CLASS } from './ValuationSectionHeader'

interface EngineReviewSectionProps {
  /** Opens the detailed `UnifiedNormalizationModal` for line-by-line review (search / filter / bulk / edit). */
  onOpenDetailedReview?: () => void
}

export function EngineReviewSection({ onOpenDetailedReview }: EngineReviewSectionProps) {
  const t = useTranslations('manualInput')

  // Zustand selectors — both stores already drive the existing modal, so
  // reading from them here is guaranteed to mirror what the modal would show.
  const normalizationItems = useNormalizationStore((s) => s.items)
  const taxLatencyItems = useTaxLatencyStore((s) => s.items)

  // Skip rendering if there's nothing to surface — mirrors the modal's
  // empty-state suppression so owners who never imported data don't see a
  // hollow advisor section.
  if (normalizationItems.length === 0 && taxLatencyItems.length === 0) {
    return null
  }

  const totalNorms = normalizationItems.length
  const pendingNorms = normalizationItems.filter((n) => n.status === 'pending').length
  const acceptedNorms = normalizationItems.filter((n) => n.status === 'accepted').length
  const taxLatencyCount = taxLatencyItems.length

  // Summary chips are a compact alternative to a paragraph — keeps the
  // header row scannable when both data sets are populated.
  const summaryChips: string[] = []
  if (totalNorms > 0) {
    summaryChips.push(
      `${totalNorms} ${t('normalizations', { count: totalNorms })}`,
    )
  }
  if (taxLatencyCount > 0) {
    summaryChips.push(
      `${taxLatencyCount} ${taxLatencyCount === 1 ? 'tax latency' : 'tax latencies'}`,
    )
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="space-y-4 pt-2"
      data-testid="engine-review-section"
    >
      <div className={cn(SECTION_HEADER_ROW_CLASS, 'flex-wrap')}>
        {/* Sparkles icon stands in for the numbered SectionStatusCircle to
            signal "engine-generated review surface" without claiming a step
            number. Aurora primary tint keeps it visually consistent with the
            sibling step circles. */}
        <span
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
          aria-hidden
        >
          <Sparkles className="h-3.5 w-3.5" />
        </span>
        <h3 className="text-sm font-medium text-foreground">Engine review</h3>
        {summaryChips.length > 0 && (
          <span className="text-xs text-foreground/60">{summaryChips.join(' · ')}</span>
        )}
      </div>

      <p className="ml-8 text-[11px] leading-snug text-foreground/45">
        AI-generated suggestions from imported data. Review and approve before finalizing the
        valuation — this is the work the engine did for you.
      </p>

      {/* Tax latencies — inline expanded. The component reads `useTaxLatencyStore`
          directly (no callback prop) and persists edits straight to the store,
          so embedding it here is a strict UX improvement: same surface, just
          visible without opening a modal. */}
      {taxLatencyCount > 0 && (
        <div className="rounded-xl border border-primary/15 bg-primary/[0.02] p-4">
          <TaxLatencySection alwaysExpanded />
        </div>
      )}

      {/* Pending-normalization CTA — opens the modal for line-by-line
          accept/reject. We don't render `NormalizationTableView` inline yet
          because the modal owns search / filter / bulk / edit affordances
          that aren't worth duplicating in a wizard step. The existing per-year
          summary inside Step 3 (Multi-Year Financials) already exposes counts
          and an "Adjust"/"Normalize" CTA at the year-card level. */}
      {totalNorms > 0 && (
        <div className="ml-8 flex flex-wrap items-center gap-3">
          {pendingNorms > 0 && onOpenDetailedReview ? (
            <button
              type="button"
              onClick={onOpenDetailedReview}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Review {pendingNorms} pending {pendingNorms === 1 ? 'suggestion' : 'suggestions'}
            </button>
          ) : onOpenDetailedReview ? (
            <button
              type="button"
              onClick={onOpenDetailedReview}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-background border border-foreground/10 text-foreground hover:bg-foreground/[0.02] transition-colors"
            >
              Adjust normalizations
            </button>
          ) : null}
          <span className="text-xs text-foreground/50">
            {acceptedNorms > 0
              ? `${acceptedNorms} accepted · ${pendingNorms} pending`
              : `${pendingNorms} pending review`}
          </span>
        </div>
      )}
    </motion.section>
  )
}
