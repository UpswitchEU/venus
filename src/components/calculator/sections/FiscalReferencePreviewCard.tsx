'use client'

import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'

import { cn } from '@/design-system/utils'
import {
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from '@/design-system/components/Tooltip'
import type { Fiscal4xPreviewMetrics } from '@/lib/omniPreview'

import { PreviewMetricCard } from './previewMetricCards'

/**
 * "Fiscal reference preview" card shown above the manual valuation method
 * sections when the engine routes through the Belgian forfait-4× branch.
 *
 * Design (rebuild 2026-05-12):
 * - Calculator-style formula `anchor + book = implied EV` renders only
 *   when the full triple is available. When book equity is missing the
 *   card collapses to a single hero anchor card + an inline callout —
 *   the previous "anchor + — = —" rendering read as broken rather than
 *   informative.
 * - EBITDA-basis disclosure moved from a stacked paragraph into a
 *   header HelpCircle tooltip so it stays discoverable without
 *   crowding the numbers it qualifies.
 * - Ownership-stake demoted to a small header badge with a tooltip;
 *   the manual flow is almost always 100% and the long hint was
 *   dominating the visual hierarchy.
 *
 * All math lives in `computeFiscal4xPreview`
 * (apps/venus/src/lib/omniPreview/fiscalPreviewMetrics.ts) so this
 * component stays cheap to re-render and trivial to test in isolation.
 */
export function FiscalReferencePreviewCard({
  fiscalPreview,
  previewCurrencyFormatter,
  unavailableMessage,
  className,
}: {
  fiscalPreview: Fiscal4xPreviewMetrics
  previewCurrencyFormatter: Intl.NumberFormat
  unavailableMessage: string | null
  className?: string
}) {
  const t = useTranslations('manualInput.methodSelector')

  const fmt = (n: number | null): string =>
    n != null && Number.isFinite(n) ? previewCurrencyFormatter.format(n) : '—'

  const ownershipPct =
    fiscalPreview.ownershipMultiplierApplied != null
      ? Math.round(fiscalPreview.ownershipMultiplierApplied * 100)
      : null

  const hasAnchor = fiscalPreview.fiscalAnchor != null
  const hasBookEquity =
    fiscalPreview.bookEquityUsed != null && Number.isFinite(fiscalPreview.bookEquityUsed)
  // We render the full a + b = c formula only when both operands are
  // numeric. Otherwise the formula gets replaced with a single hero
  // anchor card + a callout — see comment above the early-return below.
  const showFormula = hasAnchor && hasBookEquity
  const showAnchorOnly = hasAnchor && !hasBookEquity
  const showEmptyState = !hasAnchor
  const showEbitdaBasis =
    hasAnchor && fiscalPreview.ebitdaSource === 'weighted_normalized_historical'

  return (
    <div
      className={cn(
        'rounded-xl border border-foreground/[0.08] bg-foreground/[0.02] px-4 py-3',
        className
      )}
    >
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h4 className="text-sm font-semibold text-foreground">
                {t('sections.fiscalDerivedMetrics')}
              </h4>
              {showEbitdaBasis && (
                <TooltipProvider delayDuration={150}>
                  <TooltipRoot>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        data-testid="fiscal-preview-ebitda-basis-help"
                        aria-label={t('fields.fiscalPreviewEbitdaBasisWeighted')}
                        className="inline-flex shrink-0 items-center justify-center rounded-full text-foreground/40 transition-colors hover:text-foreground/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                      >
                        <HelpCircle aria-hidden className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" align="start" className="max-w-xs">
                      <p className="text-[11px] leading-snug">
                        {t('fields.fiscalPreviewEbitdaBasisWeighted')}
                      </p>
                    </TooltipContent>
                  </TooltipRoot>
                </TooltipProvider>
              )}
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
              {t('fields.fiscalPreviewFootnote')}
            </p>
          </div>
          {ownershipPct != null && (
            <TooltipProvider delayDuration={150}>
              <TooltipRoot>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-testid="fiscal-preview-ownership-badge"
                    className="group inline-flex shrink-0 items-center gap-1.5 rounded-full border border-foreground/10 bg-background/60 px-2.5 py-1 text-[11px] font-medium text-foreground/70 transition-colors hover:border-foreground/20 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/20"
                    aria-label={t('fields.fiscalPreviewOwnershipStake')}
                  >
                    <span className="text-foreground/55">
                      {t('fields.fiscalPreviewOwnershipStake')}
                    </span>
                    <span className="font-semibold tabular-nums text-foreground">
                      {t('fields.fiscalPreviewOwnershipStakeValue', { pct: ownershipPct })}
                    </span>
                    <HelpCircle
                      aria-hidden
                      className="h-3 w-3 text-foreground/40 transition-colors group-hover:text-foreground/60"
                    />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="end" className="max-w-xs">
                  <p className="text-[11px] leading-snug">
                    {t('fields.fiscalPreviewOwnershipStakeHint')}
                  </p>
                </TooltipContent>
              </TooltipRoot>
            </TooltipProvider>
          )}
        </div>

        {showEmptyState && (
          <div
            data-testid="fiscal-preview-empty-state"
            className="rounded-lg border border-dashed border-foreground/[0.15] bg-background/40 px-4 py-5 text-center"
          >
            {/* By construction `fiscalAnchor` is null only when the engine
                returned an `unavailableReason` (see computeFiscal4xPreview),
                which always produces a localized message. The fallback `—`
                exists purely as a defensive sentinel for type-correctness. */}
            <p className="text-[11px] leading-snug text-muted-foreground">
              {unavailableMessage ?? '—'}
            </p>
          </div>
        )}

        {showAnchorOnly && (
          // Single hero anchor card + an inline action callout.  The
          // previous design rendered all three operand cards with two
          // em-dashes — visually it read as "this calculator is
          // broken," which obscured that the anchor itself is already a
          // useful number on its own.
          <div className="space-y-2" data-testid="fiscal-preview-anchor-only">
            <PreviewMetricCard
              label={t('fields.fiscalPreviewAnchor')}
              value={fmt(fiscalPreview.fiscalAnchor)}
              emphasis="primary"
            />
            <div
              data-testid="fiscal-preview-warning"
              className="rounded-lg border border-dashed border-foreground/[0.15] bg-background/40 px-3 py-2"
            >
              {unavailableMessage && (
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {unavailableMessage}
                </p>
              )}
              {fiscalPreview.unavailableReason === 'missing_book_equity' && (
                <p className="mt-1 text-[11px] leading-snug text-foreground/70">
                  {t('fields.fiscalPreviewMissingEquityAction')}
                </p>
              )}
            </div>
          </div>
        )}

        {showFormula && (
          <>
            {unavailableMessage && (
              <div
                data-testid="fiscal-preview-warning"
                className="rounded-lg border border-dashed border-foreground/[0.15] bg-background/40 px-3 py-2"
              >
                <p className="text-[11px] leading-snug text-muted-foreground">
                  {unavailableMessage}
                </p>
              </div>
            )}
            <div
              data-testid="fiscal-preview-formula"
              role="group"
              aria-label={t('fields.fiscalPreviewFormulaA11y')}
              className="flex flex-col gap-2 md:flex-row md:items-stretch md:gap-1.5"
            >
              <div className="md:flex-1 md:min-w-0">
                <PreviewMetricCard
                  label={t('fields.fiscalPreviewAnchor')}
                  value={fmt(fiscalPreview.fiscalAnchor)}
                />
              </div>
              <FormulaConnector symbol="+" />
              <div className="md:flex-1 md:min-w-0">
                <PreviewMetricCard
                  label={t('fields.fiscalPreviewBookEquity')}
                  value={fmt(fiscalPreview.bookEquityUsed)}
                />
              </div>
              <FormulaConnector symbol="=" />
              <div className="md:flex-1 md:min-w-0">
                <PreviewMetricCard
                  label={t('fields.fiscalPreviewImpliedEquity')}
                  value={fmt(fiscalPreview.impliedFiscalEquity)}
                  emphasis="primary"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/**
 * Visual divider between formula operands. Renders as an inline glyph on
 * desktop (sits between cards) and a horizontal centered dash with the
 * symbol on mobile so the formula reads top-to-bottom.
 *
 * Marked `aria-hidden` because the formula relationship is conveyed to
 * assistive tech by the parent group's `aria-label`, and the visible
 * labels of the operand cards already name each value.
 */
function FormulaConnector({ symbol }: { symbol: '+' | '=' }) {
  return (
    <>
      <div
        aria-hidden
        className="hidden items-center justify-center select-none px-1 text-base font-light text-foreground/40 md:flex"
      >
        {symbol}
      </div>
      <div
        aria-hidden
        className="flex items-center justify-center gap-2 select-none md:hidden"
      >
        <span className="h-px flex-1 bg-foreground/[0.08]" />
        <span className="text-[11px] font-semibold text-foreground/40">{symbol}</span>
        <span className="h-px flex-1 bg-foreground/[0.08]" />
      </div>
    </>
  )
}
