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
 * Design notes (matters for non-trivial label widths in NL/DE):
 *   - Renders a calculator-style formula `anchor + book = implied EV` so the
 *     relationship between the three numbers is obvious at a glance, instead
 *     of a flat 4-card grid that mixed long labels with the meta "ownership"
 *     value and overflowed at narrow widths.
 *   - The "valued ownership stake" was demoted from a peer card to a small
 *     header badge with a tooltip — it is almost always 100% in the manual
 *     flow, and its long explanatory hint dominated the visual hierarchy.
 *   - When the preview is unavailable (non-BE / missing EBITDA / missing
 *     book equity), we render a single empty-state row with the message
 *     instead of a wall of dashes.
 *
 * The component is intentionally presentation-only. All math lives in
 * `computeFiscal4xPreview` (apps/venus/src/lib/omniPreview/fiscalPreviewMetrics.ts)
 * so this card stays cheap to re-render and trivial to test in isolation.
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

  // We can render the formula whenever the base anchor is known. Even when
  // book equity is still missing the formula remains pedagogical (anchor +
  // ? = ?) and the missing-book message tells the user what to fill in next.
  const showFormula = fiscalPreview.fiscalAnchor != null

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
            <h4 className="text-sm font-semibold text-foreground">
              {t('sections.fiscalDerivedMetrics')}
            </h4>
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

        {!showFormula ? (
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
        ) : (
          <>
            {unavailableMessage && (
              <p
                data-testid="fiscal-preview-warning"
                className="text-[11px] leading-snug text-muted-foreground"
              >
                {unavailableMessage}
              </p>
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
