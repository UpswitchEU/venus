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

import { AlertCircle, Check, Copy, Send } from 'lucide-react'
import { useCallback, useState } from 'react'
import { AuroraButton } from '@/design-system/components/Button'
import { getMilestoneCopy } from '@/features/startup-studio/data/maturityOptions'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { trackStudioRunComplete } from '@/lib/analytics'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  STUDIO_BERKUS_KEYS,
  STUDIO_SCORECARD_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

interface ReportStepProps {
  locale?: 'en' | 'nl'
  onSubmit?: () => void | Promise<void>
  isSubmitting?: boolean
}

export function ReportStep({ locale = 'en', onSubmit, isSubmitting = false }: ReportStepProps) {
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const description = useStartupValuationStore((s) => s.description)
  const evidenceNotes = useStartupValuationStore((s) => s.evidence_notes)
  const maturity = useStartupValuationStore((s) => s.maturity)
  const { benchmark } = useStartupBenchmark(country || 'BE', stage, sector)
  const valuation = useLiveValuation(benchmark)
  // Health-check feed — drives the gate on "Generate report" so blockers
  // get resolved by the co-pilot before the PDF is ever produced.
  const { blockers, warnings } = useStudioIssues(benchmark)

  const [submitError, setSubmitError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // Acknowledgement state for the "generate anyway" override. Local-only
  // so the user has to re-tick on every visit to this step (intentional
  // friction — the whole point is they pause and consider).
  const [ackBlockers, setAckBlockers] = useState(false)

  // Build the deck-ready one-liner: pre-money + raise → post-money + dilution.
  // Numbers come straight from the live preview (the engine returns the
  // canonical figures after submit; this is the "ready to paste" anchor for
  // the founder's pre-seed deck).
  const blendedMid = valuation.blended?.mid ?? null
  const postMoney = blendedMid != null && investment ? blendedMid + investment : null
  const dilutionPct =
    blendedMid != null && investment && postMoney != null && postMoney > 0
      ? (investment / postMoney) * 100
      : null

  const deckSentence = (() => {
    if (blendedMid == null) return null
    const preF = formatEur(blendedMid)
    if (!investment || !postMoney || dilutionPct == null) {
      return locale === 'nl'
        ? `Pre-money waardering: ${preF} (${stage.replace('_', ' ')} · ${sector} · ${country}).`
        : `Pre-money valuation: ${preF} (${stage.replace('_', ' ')} · ${sector} · ${country}).`
    }
    const askF = formatEur(investment)
    const postF = formatEur(postMoney)
    return locale === 'nl'
      ? `${preF} pre-money · op te halen ${askF} · post-money ${postF} · ~${dilutionPct.toFixed(0)}% dilutie (${stage.replace('_', ' ')} · ${sector} · ${country}).`
      : `${preF} pre-money · raising ${askF} · post-money ${postF} · ~${dilutionPct.toFixed(0)}% dilution (${stage.replace('_', ' ')} · ${sector} · ${country}).`
  })()

  const copyDeckSentence = useCallback(async () => {
    if (!deckSentence) return
    try {
      await navigator.clipboard.writeText(deckSentence)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API blocked (insecure context, Safari permissions) —
      // silently no-op; the sentence is already visible on-screen.
    }
  }, [deckSentence])

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
          : `Something went wrong while submitting: ${message}. Please try again.`
      )
    }
  }

  const filledEvidence = [...STUDIO_BERKUS_KEYS, ...STUDIO_SCORECARD_KEYS].filter(
    (key) => (evidenceNotes[key] ?? '').trim().length > 0
  )

  const blended = valuation.blended

  return (
    <div className="space-y-5">
      {/* Deck-ready summary ----------------------------------------- */}
      {deckSentence && (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
                {locale === 'nl' ? 'Klaar voor je deck' : 'Ready for your deck'}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{deckSentence}</p>
              {/* Headline grid: pre / post / dilution */}
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-background/60 p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {locale === 'nl' ? 'Pre-money' : 'Pre-money'}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {formatEur(blendedMid)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {locale === 'nl' ? 'Post-money' : 'Post-money'}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {formatEur(postMoney)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {locale === 'nl' ? 'Dilutie' : 'Dilution'}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {dilutionPct != null ? `${dilutionPct.toFixed(0)}%` : '—'}
                  </p>
                </div>
              </div>
              {valuation.pedigreeMultiplier !== 1.0 && (
                <p className="mt-2 text-[11px] text-foreground/55">
                  {locale === 'nl'
                    ? `Inclusief founder-pedigree multiplier ${valuation.pedigreeMultiplier.toFixed(2)}× op de leg-blend baseline (${formatEur(valuation.blendedPrePedigree?.mid ?? null)}).`
                    : `Includes founder-pedigree multiplier ${valuation.pedigreeMultiplier.toFixed(2)}× on the leg-blend baseline (${formatEur(valuation.blendedPrePedigree?.mid ?? null)}).`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={copyDeckSentence}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-background/80 px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:text-primary"
              aria-label={locale === 'nl' ? 'Kopieer naar klembord' : 'Copy to clipboard'}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied
                ? locale === 'nl'
                  ? 'Gekopieerd'
                  : 'Copied'
                : locale === 'nl'
                  ? 'Kopieer'
                  : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Hero pre-result --------------------------------------------
          Headline-only — we deliberately removed the "preliminary /
          live preview / engine will recompute" disclaimer that used to
          live here. That kind of caveat language belongs in the
          co-pilot dialogue (where the user can act on it), not at the
          top of an investor-facing surface. The engine still owns the
          canonical post-submit number; the hero just shows the same
          shape the report will. */}
      <div className="rounded-2xl border border-foreground/10 bg-gradient-to-br from-primary/10 to-background p-6">
        <p className="text-[10px] uppercase tracking-wide text-foreground/55">
          {locale === 'nl' ? 'Pre-money waardering' : 'Pre-money valuation'}
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

      {/* Health check ---------------------------------------------------
          Single proactive panel that replaces the practice of leaking
          warnings into the rendered PDF. Blockers gate the submit;
          warnings are recommendations; the co-pilot owns the dialogue. */}
      <HealthCheck
        blockerCount={blockers.length}
        warningCount={warnings.length}
        ackBlockers={ackBlockers}
        onAckBlockersChange={setAckBlockers}
        locale={locale}
      />

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
          // Gate the submit when blockers exist and the user hasn't
          // explicitly acknowledged the override. Two levels of intent:
          //   1) `blockers.length === 0` → enabled by default
          //   2) `ackBlockers === true`  → user opted to ship anyway
          // The co-pilot is the path of least resistance for fixing.
          disabled={isSubmitting || (blockers.length > 0 && !ackBlockers)}
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

// ---------------------------------------------------------------------
// HealthCheck
// --------------
// Inline summary panel rendered just above the submit button. Counts only
// — the full list and per-issue actions live in the StudioCoPilot panel,
// reachable via the "Open co-pilot" button. This is intentionally a
// summary surface, not a duplicate of the co-pilot rail; otherwise the
// founder has to act on the same item twice.
// ---------------------------------------------------------------------

interface HealthCheckProps {
  blockerCount: number
  warningCount: number
  ackBlockers: boolean
  onAckBlockersChange: (next: boolean) => void
  locale: 'en' | 'nl'
}

function HealthCheck({
  blockerCount,
  warningCount,
  ackBlockers,
  onAckBlockersChange,
  locale,
}: HealthCheckProps) {
  const totalIssues = blockerCount + warningCount

  if (totalIssues === 0) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-emerald-300/40 bg-emerald-50/60 p-4 text-sm text-emerald-700 dark:border-emerald-700/40 dark:bg-emerald-950/30 dark:text-emerald-300">
        <Check className="h-4 w-4 shrink-0" aria-hidden />
        <p>
          {locale === 'nl'
            ? 'Alles staat — je rapport is klaar om te genereren.'
            : 'All clear — your report is ready to generate.'}
        </p>
      </div>
    )
  }

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
            {(() => {
              if (blockerCount > 0 && warningCount > 0) {
                return locale === 'nl'
                  ? `${blockerCount} blokkerend en ${warningCount} aanbevolen issue${warningCount === 1 ? '' : 's'} te fixen`
                  : `${blockerCount} blocking and ${warningCount} recommended issue${warningCount === 1 ? '' : 's'} to resolve`
              }
              if (blockerCount > 0) {
                return locale === 'nl'
                  ? `${blockerCount} blokkerend issue${blockerCount === 1 ? '' : 's'} — fix met de co-pilot voor PDF`
                  : `${blockerCount} blocking issue${blockerCount === 1 ? '' : 's'} — resolve with the co-pilot before PDF`
              }
              return locale === 'nl'
                ? `${warningCount} aanbevolen verbetering${warningCount === 1 ? '' : 'en'}`
                : `${warningCount} recommended improvement${warningCount === 1 ? '' : 's'}`
            })()}
          </p>
          <p
            className={
              blockerCount > 0
                ? 'mt-1 text-xs leading-relaxed text-rose-700/85 dark:text-rose-300/90'
                : 'mt-1 text-xs leading-relaxed text-amber-700/85 dark:text-amber-300/90'
            }
          >
            {locale === 'nl'
              ? 'De Studio Co-pilot kan elk issue met je oplossen — tik op de knop rechtsonder. Jouw inputs blijven bewaard.'
              : 'The Studio Co-pilot can walk you through each issue — tap the button in the bottom-right. Your inputs are preserved.'}
          </p>

          {blockerCount > 0 && (
            <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-rose-300/40 bg-background/70 px-3 py-2 text-[11px] leading-snug text-rose-800 dark:text-rose-200">
              <input
                type="checkbox"
                checked={ackBlockers}
                onChange={(e) => onAckBlockersChange(e.target.checked)}
                className="mt-0.5 accent-rose-600"
              />
              <span>
                {locale === 'nl'
                  ? 'Ik begrijp dat het rapport minder verdedigbaar is en wil het toch genereren.'
                  : 'I understand the report will be less defensible and want to generate it anyway.'}
              </span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
