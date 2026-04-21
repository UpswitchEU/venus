'use client'

/**
 * Step 6 — Investor-ready report (review + submit).
 *
 * Rendered in two halves:
 *   1. A live "pre-result" summary using `useLiveValuation` so the
 *      founder sees the same blended range that the engine will return
 *      (Berkus + SaaS Forward + VC) plus a football-field bar chart.
 *   2. The evidence sentences the founder typed for each milestone —
 *      these are the "why" lines that surface in the PDF.
 *
 * The actual full HTML/PDF report is rendered by the legacy
 * `StartupFounderDashboard` after the parent route triggers the
 * Titan calculate call (via the `onComplete` callback supplied to
 * `StudioShell`).  This step is deliberately *not* a network call —
 * it's the founder's final preview before submitting.
 */

import { AlertCircle, Send } from 'lucide-react'
import { useState } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import {
  STUDIO_BERKUS_KEYS,
  STUDIO_SCORECARD_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { trackStudioRunComplete } from '@/lib/analytics'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import { getMilestoneCopy } from '@/features/startup-studio/data/maturityOptions'

interface ReportStepProps {
  locale?: 'en' | 'nl'
  onSubmit?: () => void | Promise<void>
  isSubmitting?: boolean
}

export function ReportStep({ locale = 'en', onSubmit, isSubmitting = false }: ReportStepProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code)
  const description = useStartupValuationStore((s) => s.description)
  const evidenceNotes = useStartupValuationStore((s) => s.evidence_notes)
  const maturity = useStartupValuationStore((s) => s.maturity)
  const { benchmark } = useStartupBenchmark(country || 'BE', stage, sector)
  const valuation = useLiveValuation(benchmark)

  const [submitError, setSubmitError] = useState<string | null>(null)

  const handleSubmit = async () => {
    setSubmitError(null)
    // Report id isn't yet available at this point — the parent route
    // creates it after submit.  Pass an empty string so analytics still
    // fires; the downstream `studio_run_complete` event from the
    // results page carries the canonical report id.
    trackStudioRunComplete('', stage)
    try {
      await onSubmit?.()
    } catch (err) {
      // Surface the error to the founder rather than silently swallow.
      // The parent owns the loading state, so we just need a local
      // message; resetting `isSubmitting` is the parent's job.
      const message = err instanceof Error ? err.message : String(err ?? 'Unknown error')
      setSubmitError(
        locale === 'nl'
          ? `Iets ging mis bij het indienen: ${message}. Probeer het opnieuw.`
          : `Something went wrong while submitting: ${message}. Please try again.`,
      )
    }
  }

  const filledEvidence = [...STUDIO_BERKUS_KEYS, ...STUDIO_SCORECARD_KEYS].filter(
    (key) => (evidenceNotes[key] ?? '').trim().length > 0,
  )

  const blended = valuation.blended

  return (
    <div className="space-y-5">
      {/* Hero pre-result -------------------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-gradient-to-br from-primary/10 to-background p-6">
        <p className="text-[10px] uppercase tracking-wide text-foreground/55">
          {locale === 'nl' ? 'Voorlopige pre-money' : 'Preliminary pre-money'}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">
          {formatEur(blended?.mid ?? null)}
        </p>
        <p className="mt-1 text-sm text-foreground/65">
          {locale === 'nl' ? 'Range: ' : 'Range: '}
          <span className="font-semibold tabular-nums">{formatEur(blended?.low ?? null)}</span>
          {' – '}
          <span className="font-semibold tabular-nums">{formatEur(blended?.high ?? null)}</span>
        </p>
        <p className="mt-3 text-xs text-foreground/55">
          {locale === 'nl'
            ? 'Dit is een live preview op basis van je inputs. De definitieve waardering wordt door de engine berekend.'
            : 'This is a live preview based on your inputs. The final valuation is computed by the engine.'}
        </p>
      </div>

      {/* Football field --------------------------------------------- */}
      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">
          {locale === 'nl' ? 'Football field per methode' : 'Football field per method'}
        </h3>

        {(() => {
          const max = Math.max(...valuation.legs.map((l) => l.value ?? 0), 1)
          return (
            <div className="space-y-3">
              {valuation.legs.map((leg) => {
                const value = leg.value ?? 0
                return (
                  <div key={leg.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{leg.label}</span>
                      <span className="tabular-nums text-foreground/65">
                        {formatEur(leg.value)}{' '}
                        <span className="text-foreground/40">
                          ({(leg.weight * 100).toFixed(0)}%)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-foreground/5">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${(value / max) * 100}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}
      </div>

      {/* Evidence sentences ----------------------------------------- */}
      {filledEvidence.length > 0 && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-1 text-sm font-semibold text-foreground">
            {locale === 'nl' ? 'Jouw onderbouwing' : 'Your evidence'}
          </h3>
          <p className="mb-4 text-xs text-foreground/55">
            {locale === 'nl'
              ? 'Deze zinnen verschijnen onder elke kaart in de investor PDF.'
              : 'These sentences appear under each card in the investor PDF.'}
          </p>
          <ul className="space-y-3">
            {filledEvidence.map((key) => {
              const copy = getMilestoneCopy(key, locale)
              return (
                <li key={key} className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    {copy.title}{' '}
                    <span className="text-foreground/45">
                      · {locale === 'nl' ? 'niveau' : 'level'} {maturity[key]}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/75">
                    {evidenceNotes[key]}
                  </p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Description ------------------------------------------------ */}
      {description && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">
            {locale === 'nl' ? 'Pitch' : 'Pitch'}
          </h3>
          <p className="text-sm leading-relaxed text-foreground/75">{description}</p>
        </div>
      )}

      {/* Action bar — PDF / share live on the report page after the
          engine returns; surfacing them here would tempt founders to
          export the wizard preview as if it were the investor PDF. */}
      <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 border-t border-foreground/10 bg-background/90 px-6 py-4 backdrop-blur">
        <p className="max-w-md text-xs text-foreground/55">
          {locale === 'nl'
            ? 'PDF en deelbare link verschijnen op het rapport zodra de engine je eindwaardering heeft berekend.'
            : 'PDF and shareable link appear on the report once the engine has computed your final valuation.'}
        </p>

        <AuroraButton
          variant="primary"
          size="sm"
          onClick={handleSubmit}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="gap-1.5"
        >
          <Send className="h-3.5 w-3.5" />
          {isSubmitting
            ? locale === 'nl'
              ? 'Berekenen…'
              : 'Calculating…'
            : locale === 'nl'
              ? 'Genereer eindrapport'
              : 'Generate full report'}
        </AuroraButton>
      </div>

      {submitError && (
        <p
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-rose-300/60 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/40 dark:text-rose-300"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          {submitError}
        </p>
      )}
    </div>
  )
}
