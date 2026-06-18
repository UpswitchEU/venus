'use client'

/**
 * ReviewDefaultsModal
 * -------------------
 *
 * Confirmation modal shown the first time a founder hits "Generate".
 * Replaces the "click → instant report" pattern (which produced reports
 * built largely on engine defaults the founder never reviewed) with a
 * scannable list of every assumption that will drive the headline,
 * tagged where the value came from a default rather than the founder's
 * own input.
 *
 * Why this exists (audit issue #7, 2026-05-10):
 *   The submit gate only required a company name + one milestone pick.
 *   A founder could generate an "investor-ready" PDF where the engine
 *   silently used:
 *     - the sector inferred from NACE
 *     - Y5 revenue from `STARTUP_SECTOR_DEFAULT_Y5_REVENUE`
 *     - target ROI from `regional_data.default_target_roi_x`
 *     - exit multiple from the regional mid
 *     - dilution from `DILUTION_DEFAULT_PCT`
 *   …none of which they ever saw, let alone defended.
 *
 * The modal lists every assumption + its final value + a "default" tag
 * when the value matches the engine's smart-default for that founder's
 * stage/sector. Cancel takes them back to the wizard with the panel
 * scrolled to the field they want to edit; Confirm fires the actual
 * `onSubmit` and produces the report.
 *
 * Default detection is intentionally exact-match: if the founder's
 * value is byte-identical to the smart-default we tag it. We do *not*
 * try to detect "they typed a different value but it happens to equal
 * a default" — that would require tracking touched-state per field,
 * which the store doesn't carry today. Exact-match is the conservative
 * direction: any false-negative ("we said it was edited but it wasn't")
 * just means one fewer chip; the founder still sees the value.
 */

import { AlertCircle, Check, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo } from 'react'
import { getRegionalBaseline } from '@/components/calculator/sections/startup/regionalBaseline'
import { scrollAnchorIntoManualLayout } from '@/features/manual/utils/manualLayoutScroll'
import { formatEur } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STARTUP_SECTOR_DEFAULT_Y5_REVENUE,
  STARTUP_STAGE_DEFAULT_RAISE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

const DILUTION_DEFAULT_PCT_BY_STAGE: Record<'pre_seed' | 'seed' | 'series_a', number> = {
  pre_seed: 70,
  seed: 60,
  series_a: 50,
}

interface ReviewDefaultsModalProps {
  /** Whether the modal is open. Controlled from the submit footer. */
  open: boolean
  /** Confirm — fires the real `onSubmit` (StartupSubmitFooter wires this). */
  onConfirm: () => void
  /** Cancel — closes the modal without submitting. */
  onCancel: () => void
  /**
   * Optional anchor-id resolver for the "Edit" links per row. The
   * submit footer can pass a smooth-scroll handler so a click on
   * "Edit Y5" sends the user back to the Exit-story section without
   * closing the wizard.
   */
  onJumpTo?: (anchorId: string) => void
}

interface ReviewRow {
  key: string
  label: string
  value: string
  isDefault: boolean
  /** Anchor id of the section the founder should jump to. */
  anchor: string
}

/** Approximate-equal helper for currency / multiplier comparisons. */
function approxEqual(a: number | null | undefined, b: number, eps = 0.5): boolean {
  if (typeof a !== 'number' || !Number.isFinite(a)) return false
  return Math.abs(a - b) <= eps
}

export function ReviewDefaultsModal({
  open,
  onConfirm,
  onCancel,
  onJumpTo,
}: ReviewDefaultsModalProps) {
  const t = useTranslations('startupStudio.reviewGate')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const country = useStartupValuationStore((s) => s.country_code) || 'BE'
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const sectorWasUserSet = useStartupValuationStore((s) => s._sectorWasUserSet)
  const y5 = useStartupValuationStore((s) => s.year5_revenue_projection)
  const exitMultiple = useStartupValuationStore((s) => s.exit_revenue_multiple)
  const targetRoi = useStartupValuationStore((s) => s.target_roi_x)
  const dilution = useStartupValuationStore((s) => s.dilution_assumption_pct)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)

  const { benchmark } = useStartupBenchmark(country, stage, sector)
  const stageDefaultRoi = getRegionalBaseline(country, stage).default_target_roi_x
  const sectorDefaultY5 = STARTUP_SECTOR_DEFAULT_Y5_REVENUE[sector] ?? 5_000_000
  const benchmarkMidMultiple = Math.round(
    (benchmark.exit_multiple_low + benchmark.exit_multiple_high) / 2
  )
  const stageDefaultRaise = STARTUP_STAGE_DEFAULT_RAISE[stage]
  const stageDefaultDilution = DILUTION_DEFAULT_PCT_BY_STAGE[stage]

  const rows: ReviewRow[] = useMemo(() => {
    const out: ReviewRow[] = []

    out.push({
      key: 'stage',
      label: t('row.stage'),
      value: tStageLabels(stage),
      isDefault: false,
      anchor: 'startup-section-profile',
    })

    out.push({
      key: 'sector',
      label: t('row.sector'),
      value: tSectorLabels(sector),
      isDefault: !sectorWasUserSet,
      anchor: 'startup-section-profile',
    })

    out.push({
      key: 'year5',
      label: t('row.y5'),
      value: y5 != null ? formatEur(y5) : '—',
      isDefault: approxEqual(y5, sectorDefaultY5, 1),
      anchor: 'startup-section-exit',
    })

    out.push({
      key: 'exit_multiple',
      label: t('row.exitMultiple'),
      value: exitMultiple != null ? `${exitMultiple}×` : '—',
      isDefault: approxEqual(exitMultiple, benchmarkMidMultiple, 0.05),
      anchor: 'startup-section-exit',
    })

    out.push({
      key: 'roi',
      label: t('row.targetRoi'),
      value: targetRoi != null ? `${targetRoi}×` : '—',
      isDefault: approxEqual(targetRoi, stageDefaultRoi, 0.5),
      anchor: 'startup-section-exit',
    })

    out.push({
      key: 'investment',
      label: t('row.investment'),
      value: investment != null ? formatEur(investment) : '—',
      isDefault: approxEqual(investment, stageDefaultRaise, 1),
      anchor: 'startup-section-profile',
    })

    if (dilution != null) {
      out.push({
        key: 'dilution',
        label: t('row.dilution'),
        value: `${dilution}%`,
        isDefault: approxEqual(dilution, stageDefaultDilution, 0.5),
        anchor: 'startup-section-round',
      })
    }

    return out
  }, [
    t,
    tStageLabels,
    tSectorLabels,
    stage,
    sector,
    sectorWasUserSet,
    y5,
    exitMultiple,
    targetRoi,
    investment,
    dilution,
    sectorDefaultY5,
    benchmarkMidMultiple,
    stageDefaultRoi,
    stageDefaultRaise,
    stageDefaultDilution,
  ])

  const defaultCount = rows.filter((r) => r.isDefault).length

  // Esc-to-close keyboard handling. Mirrors every Aurora modal.
  useEffect(() => {
    if (!open) return
    if (typeof window === 'undefined') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancel])

  const handleJump = useCallback(
    (anchorId: string) => {
      if (onJumpTo) {
        onJumpTo(anchorId)
        return
      }
      if (typeof window === 'undefined') return
      scrollAnchorIntoManualLayout(anchorId, { behavior: 'smooth', block: 'start' })
    },
    [onJumpTo]
  )

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="review-gate-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      {/* Backdrop — click to cancel. */}
      <button
        type="button"
        aria-label={t('closeAria')}
        onClick={onCancel}
        className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-xl rounded-2xl border border-foreground/10 bg-background shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-foreground/10 px-6 py-5">
          <div>
            <h2
              id="review-gate-title"
              className="text-lg font-semibold leading-tight text-foreground"
            >
              {t('title')}
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-foreground/60">
              {defaultCount > 0
                ? t('subtitleWithDefaults', { count: defaultCount })
                : t('subtitleAllReviewed')}
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label={t('closeAria')}
            className="shrink-0 rounded-full p-1 text-foreground/55 transition hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-4">
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center justify-between gap-3 rounded-lg border border-foreground/10 bg-background/60 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-foreground/55">
                    {row.label}
                  </p>
                  <p className="mt-0.5 truncate font-semibold tabular-nums text-foreground">
                    {row.value}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {row.isDefault && (
                    <span
                      title={t('defaultChipTooltip')}
                      className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300"
                    >
                      <AlertCircle className="h-3 w-3" aria-hidden />
                      {t('defaultChip')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => handleJump(row.anchor)}
                    className="rounded-md border border-foreground/15 bg-background px-2 py-1 text-[11px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary"
                  >
                    {t('editBtn')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-foreground/10 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-foreground/15 bg-background px-4 py-2 text-sm font-medium text-foreground/80 transition hover:border-foreground/30 hover:text-foreground"
          >
            {t('cancelBtn')}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <Check className="h-4 w-4" aria-hidden />
            {t('confirmBtn')}
          </button>
        </footer>
      </div>
    </div>
  )
}

export default ReviewDefaultsModal
