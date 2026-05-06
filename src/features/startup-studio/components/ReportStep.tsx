'use client'

/**
 * Step 8 — Investor-ready preview.
 *
 * Live "pre-result" summary the founder sees inside the unified
 * `StartupValuationPanel` before clicking the canonical submit footer
 * below the panel.  Three blocks:
 *   1. Deck-ready one-liner with pre-money / post-money / dilution rollup.
 *      Pre-money matches the Round step: term-sheet target if set, else the
 *      live leg blend from `useLiveValuation`.
 *   2. Football-field bar chart per leg.
 *   3. Evidence sentences the founder typed for each milestone — the
 *      "why" lines that surface in the PDF investor narrative.
 *
 * The full HTML/PDF report is rendered server-side by ValuationIQ once
 * `StartupSubmitFooter` (sibling component below the panel) fires the
 * canonical `valuationService.calculateValuation` call.  This step is
 * deliberately preview-only — no network, no submit button.  Health
 * issues that would gate a credible PDF are routed to the Studio
 * Co-pilot rail rather than blocking inline.
 */

import { AlertCircle, Check, Copy } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { getMilestoneCopy } from '@/features/startup-studio/data/maturityOptions'
import { formatEur, useLiveValuation } from '@/features/startup-studio/hooks/useLiveValuation'
import { useStudioIssues } from '@/features/startup-studio/hooks/useStudioIssues'
import { useStudioLocale } from '@/features/startup-studio/i18n/useStudioLocale'
import { useStartupBenchmark } from '@/lib/benchmarks/useStartupBenchmark'
import {
  isValidPreMoneyTarget,
  resolveHeadlinePreMoney,
} from '@/features/startup-studio/utils/resolveHeadlinePreMoney'
import {
  STUDIO_BERKUS_KEYS,
  STUDIO_SCORECARD_KEYS,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'

const REPORT_LEG_KEYS = ['berkus', 'vc', 'saas_forward', 'scorecard'] as const

interface ReportStepProps {
  /** @deprecated Route locale from next-intl is used. */
  locale?: 'en' | 'nl'
}

export function ReportStep(_props: ReportStepProps) {
  const locale = useStudioLocale()
  const t = useTranslations('startupStudio.report')
  const tRound = useTranslations('startupStudio.round')
  const tCommon = useTranslations('startupStudio.common')
  const tMaturity = useTranslations('startupStudio.common.maturityLabels')
  const tStageLabels = useTranslations('startupStudio.companyCard.stageLabels')
  const tSectorLabels = useTranslations('startupStudio.narrative.sectorLabels')
  const stage = useStartupValuationStore((s) => s.stage)
  const sector = useStartupValuationStore((s) => s.sector)
  const country = useStartupValuationStore((s) => s.country_code)
  const investment = useStartupValuationStore((s) => s.investment_amount_sought)
  const capTable = useStartupValuationStore((s) => s.cap_table)
  const description = useStartupValuationStore((s) => s.description)
  const evidenceNotes = useStartupValuationStore((s) => s.evidence_notes)
  const maturity = useStartupValuationStore((s) => s.maturity)
  const { benchmark } = useStartupBenchmark(country || 'BE', stage, sector)
  const valuation = useLiveValuation(benchmark)
  const { blockers, warnings } = useStudioIssues(benchmark)

  const [copied, setCopied] = useState(false)

  const blendedMid = valuation.blended?.mid ?? null
  const headlinePre = headlinePreMoney(capTable.pre_money_target, blendedMid)
  const postMoney = headlinePre != null && investment ? headlinePre + investment : null
  const dilutionPct =
    headlinePre != null && investment && postMoney != null && postMoney > 0
      ? (investment / postMoney) * 100
      : null

  const usesBlendPreMoney = capTable.pre_money_target == null
  const preMoneyForTypicalSlice =
    investment != null && investment > 0 && Number.isFinite(investment)
      ? (() => {
          const target = 0.12
          const pre = investment / target - investment
          return pre > 0 && Number.isFinite(pre) ? pre : null
        })()
      : null
  const showHighRoundDilutionHint =
    pricedRoundForCopy &&
    investment != null &&
    investment > 0 &&
    dilutionPct != null &&
    dilutionPct > 22 &&
    preMoneyForTypicalSlice != null

  const stageLabel = tStageLabels(stage)
  const sectorLabel = tSectorLabels(sector)
  const countryStr = country ?? ''

  const deckSentence = (() => {
    if (headlinePre == null) return null
    const preF = formatEur(headlinePre)
    if (!investment || !postMoney || dilutionPct == null) {
      return t('deckPreOnly', {
        preF,
        stage: stageLabel,
        sector: sectorLabel,
        country: countryStr,
      })
    }
    const askF = formatEur(investment)
    const postF = formatEur(postMoney)
    return t('deckFull', {
      preF,
      askF,
      postF,
      dilution: dilutionPct.toFixed(0),
      stage: stageLabel,
      sector: sectorLabel,
      country: countryStr,
    })
  })()

  const copyDeckSentence = useCallback(async () => {
    if (!deckSentence) return
    try {
      await navigator.clipboard.writeText(deckSentence)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API blocked — sentence remains visible on-screen.
    }
  }, [deckSentence])

  const filledEvidence = [...STUDIO_BERKUS_KEYS, ...STUDIO_SCORECARD_KEYS].filter(
    (key) => (evidenceNotes[key] ?? '').trim().length > 0,
  )

  const blended = valuation.blended

  function legLabel(key: string, fallback: string): string {
    if ((REPORT_LEG_KEYS as readonly string[]).includes(key)) {
      return t(`legLabels.${key}` as 'legLabels.berkus')
    }
    return fallback
  }

  return (
    <div className="space-y-5">
      {deckSentence && (
        <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/[0.08] to-primary/[0.02] p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-medium uppercase tracking-wide text-primary">
                {t('readyForDeck')}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-foreground">{deckSentence}</p>
              <div className="mt-4 grid grid-cols-3 gap-3 rounded-lg bg-background/60 p-3">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {tCommon('preMoney')}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {formatEur(headlinePre)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {tCommon('postMoney')}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {formatEur(postMoney)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-foreground/55">
                    {tCommon('dilution')}
                  </p>
                  <p className="mt-0.5 text-lg font-bold tabular-nums text-foreground">
                    {dilutionPct != null ? `${dilutionPct.toFixed(0)}%` : '—'}
                  </p>
                </div>
              </div>
              {investment != null && investment > 0 && postMoney != null && (
                <p className="mt-3 text-[11px] leading-snug text-foreground/55">{t('dilutionDefinition')}</p>
              )}
              <p className="mt-2 text-[11px] leading-snug text-foreground/55">
                {usesBlendPreMoney ? t('preMoneySourceBlended') : t('preMoneySourceOverride')}
              </p>
              {showHighRoundDilutionHint && dilutionPct != null && (
                <p className="mt-2 rounded-md border border-amber-400/40 bg-amber-50/50 px-3 py-2 text-[11px] leading-snug text-amber-950/90 dark:border-amber-700/35 dark:bg-amber-950/30 dark:text-amber-100/85">
                  {tRound('roundDilutionHighHint', {
                    roundPct: dilutionPct.toFixed(1),
                    preHint: formatEur(preMoneyForTypicalSlice),
                  })}
                </p>
              )}
              {valuation.pedigreeMultiplier !== 1.0 && (
                <p className="mt-2 text-[11px] text-foreground/55">
                  {t('pedigreeIncluded', {
                    mult: valuation.pedigreeMultiplier.toFixed(2),
                    mid: formatEur(valuation.blendedPrePedigree?.mid ?? null),
                  })}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={copyDeckSentence}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-foreground/15 bg-background/80 px-3 py-2 text-xs font-medium text-foreground/80 transition hover:border-primary hover:text-primary"
              aria-label={t('copyAria')}
            >
              <Copy className="h-3.5 w-3.5" />
              {copied ? t('copied') : t('copy')}
            </button>
          </div>
        </div>
      )}

      {blended && (
        <p className="text-xs text-foreground/65">
          {t('range')}
          <span className="font-semibold tabular-nums text-foreground">{formatEur(blended.low)}</span>
          {' – '}
          <span className="font-semibold tabular-nums text-foreground">{formatEur(blended.high)}</span>
        </p>
      )}

      <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">{t('footballFieldTitle')}</h3>

        {(() => {
          const max = Math.max(...valuation.legs.map((l) => l.value ?? 0), 1)
          return (
            <div className="space-y-3">
              {valuation.legs.map((leg) => {
                const value = leg.value ?? 0
                const label = legLabel(leg.key, leg.label)
                return (
                  <div key={leg.key}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-medium text-foreground">{label}</span>
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

      {filledEvidence.length > 0 && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-1 text-sm font-semibold text-foreground">{t('yourEvidence')}</h3>
          <p className="mb-4 text-xs text-foreground/55">{t('evidenceHint')}</p>
          <ul className="space-y-3">
            {filledEvidence.map((key) => {
              const copy = getMilestoneCopy(key, locale)
              return (
                <li key={key} className="rounded-lg bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-foreground">
                    {copy.title}{' '}
                    <span className="text-foreground/45">
                      · {tCommon('level')} {maturity[key]}
                    </span>
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-foreground/75">{evidenceNotes[key]}</p>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {description && (
        <div className="rounded-2xl border border-foreground/10 bg-background/60 p-6">
          <h3 className="mb-2 text-sm font-semibold text-foreground">{t('pitch')}</h3>
          <p className="text-sm leading-relaxed text-foreground/75">{description}</p>
        </div>
      )}

      <HealthCheck blockerCount={blockers.length} warningCount={warnings.length} />
    </div>
  )
}

interface HealthCheckProps {
  blockerCount: number
  warningCount: number
}

function HealthCheck({ blockerCount, warningCount }: HealthCheckProps) {
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
          <p
            className={
              blockerCount > 0
                ? 'mt-1 text-xs leading-relaxed text-rose-700/85 dark:text-rose-300/90'
                : 'mt-1 text-xs leading-relaxed text-amber-700/85 dark:text-amber-300/90'
            }
          >
            {t('assistantHint')}
          </p>
        </div>
      </div>
    </div>
  )
}
