'use client'

/**
 * Step 8 — Pre-submit gate.
 *
 * The left panel is for INPUT.  The valuation report (rendered
 * server-side by ValuationIQ) is the canonical advisory OUTPUT.
 * Earlier versions of this step duplicated the report's headline
 * (deck-ready sentence, football field, evidence rollup, narrative
 * — every block that exists on the PDF), which competed with the
 * actual report and forced founders to read the same numbers twice.
 *
 * This step now does ONE thing: tells the founder whether they're
 * ready to click submit, and surfaces the blockers/warnings they
 * still need to fix.  Each finding carries a "fix in {step}" jump
 * link that scrolls them straight to the offending input section —
 * no hunting through the panel.
 *
 * Everything that used to live here:
 *   - deck-ready one-liner            → startup_one_pager.html
 *   - football field                  → startup_one_pager.html / exec_summary
 *   - evidence rollup                 → startup_method_breakdown.html
 *   - narrative                       → startup_executive_summary.html
 *   - "X% pedigree multiplier" chip   → startup_method_breakdown.html
 *
 * The full HTML/PDF report is rendered server-side by ValuationIQ once
 * `StartupSubmitFooter` (sibling component below the panel) fires the
 * canonical `valuationService.calculateValuation` call.  This step is
 * deliberately preview-only — no network, no submit button.
 */

import { AlertCircle, ArrowRight, Check } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useStudioIssues, type StudioIssue } from '@/features/startup-studio/hooks/useStudioIssues'
import { useStudioLocale } from '@/features/startup-studio/i18n/useStudioLocale'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

interface ReportStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
  /** Forwarded by `StartupValuationPanel`; unused on this step. */
  advisorMode?: boolean
}

/** Map a StudioStepId to the DOM anchor `StartupValuationPanel` mounts. */
const STEP_ANCHOR: Record<string, string> = {
  profile: 'startup-section-profile',
  berkus: 'startup-section-berkus',
  scorecard: 'startup-section-scorecard',
  founder_pedigree: 'startup-section-pedigree',
  traction: 'startup-section-traction',
  exit_story: 'startup-section-exit',
  round_simulator: 'startup-section-round',
  report: 'startup-section-report',
}

function jumpToStep(stepId: string): void {
  if (typeof window === 'undefined') return
  const anchor = STEP_ANCHOR[stepId]
  if (!anchor) return
  const el = document.getElementById(anchor)
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function ReportStep(_props: ReportStepProps) {
  const locale = useStudioLocale()
  const t = useTranslations('startupStudio.report')
  const tHealth = useTranslations('startupStudio.health')
  const tSections = useTranslations('startupStudio.sections')
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code)
  const { benchmark } = useStartupBenchmark(country || 'BE', stage, sector)
  const { blockers, warnings } = useStudioIssues(benchmark)

  const total = blockers.length + warnings.length

  return (
    <div className="space-y-5">
      <PreSubmitSummary blockerCount={blockers.length} warningCount={warnings.length} />

      {total > 0 && (
        <IssueList
          issues={[...blockers, ...warnings]}
          locale={locale}
          tSections={tSections}
          tHealth={tHealth}
        />
      )}

      {/* Inline jump CTA — the canonical submit lives in the sticky
          StartupSubmitFooter below the panel.  We render a clear
          "scroll-to-submit" affordance (not the actual submit, to keep
          one source of truth for gating, validation and analytics). */}
      <button
        type="button"
        onClick={() => {
          if (typeof window === 'undefined') return
          const el = document.getElementById('startup-submit-footer')
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          }
        }}
        aria-label={t('submitJumpAria')}
        className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-5 text-left transition hover:border-primary hover:from-primary/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground sm:text-base">
            {t('submitJumpLabel')}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-foreground/60">
            {t('submitJumpHint')}
          </p>
        </div>
        <span
          aria-hidden
          className="shrink-0 text-2xl text-primary transition-transform group-hover:translate-y-0.5"
        >
          ↓
        </span>
      </button>
    </div>
  )
}

interface PreSubmitSummaryProps {
  blockerCount: number
  warningCount: number
}

/**
 * Top-of-step status banner.  Three states:
 *   - all clear → emerald "ready to submit"
 *   - blockers > 0 → rose "must fix before submit"
 *   - warnings only → amber "will still ship, but recommended fix"
 */
function PreSubmitSummary({ blockerCount, warningCount }: PreSubmitSummaryProps) {
  const t = useTranslations('startupStudio.health')
  const totalIssues = blockerCount + warningCount

  if (totalIssues === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-50/60 p-4 text-sm text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        <p>{t('allClear')}</p>
      </div>
    )
  }

  const title = (() => {
    if (blockerCount > 0 && warningCount > 0) {
      return t('mixed', { blockerCount, warningCount })
    }
    if (blockerCount > 0) {
      return t('blockersOnly', { count: blockerCount })
    }
    return t('warningsOnly', { count: warningCount })
  })()

  return (
    <div
      className={
        blockerCount > 0
          ? 'rounded-2xl border border-rose-300/50 bg-rose-50/60 p-5 dark:border-rose-700/40 dark:bg-rose-950/25'
          : 'rounded-2xl border border-amber-300/50 bg-amber-50/60 p-5 dark:border-amber-700/40 dark:bg-amber-950/25'
      }
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className={
            blockerCount > 0
              ? 'mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400'
              : 'mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400'
          }
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={
              blockerCount > 0
                ? 'text-sm font-semibold text-rose-800 dark:text-rose-200'
                : 'text-sm font-semibold text-amber-800 dark:text-amber-200'
            }
          >
            {title}
          </p>
        </div>
      </div>
    </div>
  )
}

interface IssueListProps {
  issues: StudioIssue[]
  locale: 'en' | 'nl'
  tSections: ReturnType<typeof useTranslations>
  tHealth: ReturnType<typeof useTranslations>
}

/**
 * Inline list of blockers + warnings with one-click jumps to the
 * offending step.  The audit (A13) flagged that the previous "Open
 * the assistant" hint forced founders into 2 extra clicks just to
 * see what was wrong — this list gives them the diagnosis + the
 * action in one surface.
 */
function IssueList({ issues, locale, tSections, tHealth }: IssueListProps) {
  return (
    <ul className="space-y-2">
      {issues.map((issue) => {
        const isBlocker = issue.severity === 'block'
        return (
          <li
            key={issue.id}
            className={
              isBlocker
                ? 'rounded-xl border border-rose-200/60 bg-rose-50/40 p-3 dark:border-rose-800/40 dark:bg-rose-950/20'
                : 'rounded-xl border border-amber-200/60 bg-amber-50/40 p-3 dark:border-amber-800/40 dark:bg-amber-950/20'
            }
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={
                  isBlocker
                    ? 'mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-rose-500'
                    : 'mt-0.5 inline-block h-2 w-2 shrink-0 rounded-full bg-amber-500'
                }
              />
              <div className="min-w-0 flex-1">
                <p
                  className={
                    isBlocker
                      ? 'text-xs font-semibold text-rose-900 dark:text-rose-200'
                      : 'text-xs font-semibold text-amber-900 dark:text-amber-200'
                  }
                >
                  {issue.title[locale]}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/65">
                  {issue.action[locale]}
                </p>
              </div>
              <button
                type="button"
                onClick={() => jumpToStep(issue.step)}
                aria-label={tHealth('jumpToStepAria', {
                  step: tSections(issue.step),
                })}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-foreground/15 bg-background px-2 py-1 text-[10px] font-medium text-foreground/75 transition hover:border-primary/50 hover:text-primary"
              >
                {tSections(issue.step)}
                <ArrowRight className="h-3 w-3" aria-hidden />
              </button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
