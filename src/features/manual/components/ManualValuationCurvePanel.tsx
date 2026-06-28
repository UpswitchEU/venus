'use client'

/**
 * Valuation curve panel — the "graph" view in the report workspace.
 *
 * Opened from the trend-graph icon in the toolbar (beside the report/eye icon).
 * The report renders the latest fiscal year; this curve renders every year the
 * engine valued (`valuation_timeline`: history + current + forecast) on the same
 * adaptive method, using Mercury's ported visx chart so the interaction (hover,
 * keyboard, band) is identical to the public pages and advisor surfaces. Forecast
 * years are drawn dashed / hollow so a projection never reads as a settled fact.
 */

import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo } from 'react'
import type { ChartLabels } from '../../../components/valuation-graph'
import {
  buildHeadlineFallbackRows,
  buildTimelineChartRows,
  formatDelta,
  formatGraphCurrency,
  resolveTimelineCurrency,
  ValuationDataTable,
  ValuationTrendChart,
} from '../../../components/valuation-graph'
import { cn } from '../../../design-system/utils'
import { useManualResultsStore } from '../../../store/manual'
import { useSessionStore } from '../../../store/useSessionStore'

function buildCurveLabels(t: (key: string) => string): ChartLabels {
  return {
    date: t('labels.date'),
    range: t('labels.range'),
    midpoint: t('labels.midpoint'),
    askingPrice: t('labels.askingPrice'),
    method: t('labels.method'),
    version: t('labels.version'),
    reportSnapshot: t('labels.valuation'),
    status: t('labels.status'),
    triggerManual: t('labels.triggerManual'),
    triggerAutoRecalculation: t('labels.triggerAutoRecalculation'),
    triggerConversation: t('labels.triggerConversation'),
    triggerAdjustment: t('labels.triggerAdjustment'),
    confidence: t('labels.confidence'),
    actual: t('labels.actual'),
    forecast: t('labels.forecast'),
  }
}

export interface ManualValuationCurvePanelProps {
  /** Force the loading skeleton (e.g. while a recalculation is rendering). */
  loading?: boolean
}

export function ManualValuationCurvePanel({ loading = false }: ManualValuationCurvePanelProps) {
  const t = useTranslations('valuationCurve')
  const locale = useLocale()

  // The freshest result lives in the manual results store; fall back to the
  // session cache (restored sessions) so the curve works on reload too.
  const manualResult = useManualResultsStore((state) => state.result)
  const isCalculating = useManualResultsStore((state) => state.isCalculating)
  const sessionResult = useSessionStore((state) => state.session?.valuationResult)
  const result = manualResult ?? sessionResult ?? null

  const labels = useMemo(() => buildCurveLabels(t), [t])
  const currency = useMemo(() => resolveTimelineCurrency(result), [result])

  const rows = useMemo(() => {
    const timelineRows = buildTimelineChartRows(result?.valuation_timeline)
    if (timelineRows.length > 0) return timelineRows
    // Legacy result without a timeline → still show the headline as one point.
    return buildHeadlineFallbackRows(result)
  }, [result])

  const isLoading = loading || isCalculating

  const latest = rows.length > 0 ? rows[rows.length - 1] : null
  // Compare the latest year against the previous ACTUAL year (skip forecasts) so
  // the headline delta reflects realised movement, not a projection.
  const previousActual = useMemo(() => {
    for (let i = rows.length - 2; i >= 0; i--) {
      if (rows[i].isForecast !== true) return rows[i]
    }
    return null
  }, [rows])
  const delta =
    latest && latest.isForecast !== true
      ? formatDelta(latest.valueMid, previousActual?.valueMid ?? null, locale, currency)
      : null
  const DeltaIcon =
    delta?.tone === 'up' ? TrendingUp : delta?.tone === 'down' ? TrendingDown : Minus

  return (
    <div className="h-full overflow-y-auto bg-background">
      <div className="mx-auto flex h-full max-w-4xl flex-col gap-4 px-4 py-5 sm:px-6">
        <header className="space-y-2">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
            <p className="text-sm leading-relaxed text-foreground/55">{t('subtitle')}</p>
          </div>
          {latest && !isLoading ? (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground/55">
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {formatGraphCurrency(latest.valueMid, currency, locale)}
              </span>
              <span className="tabular-nums">{latest.label}</span>
              {delta ? (
                <span
                  className={cn(
                    'inline-flex items-center gap-1 font-medium',
                    delta.tone === 'up'
                      ? 'text-primary'
                      : delta.tone === 'down'
                        ? 'text-secondary'
                        : 'text-foreground/50'
                  )}
                >
                  <DeltaIcon className="h-3 w-3" aria-hidden />
                  {delta.label}
                </span>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="relative min-h-[20rem] flex-1 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <ValuationTrendChart
            rows={rows}
            locale={locale}
            currency={currency}
            labels={labels}
            loading={isLoading}
            dateMode="year"
            showProjection={false}
            showMethodCaption={false}
            singlePointHint={t('singlePointHint')}
            aria-label={t('ariaLabel')}
            data-testid="valuation-curve-chart"
            emptyState={
              <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 text-center">
                <p className="text-sm font-medium text-foreground/70">{t('emptyTitle')}</p>
                <p className="max-w-[260px] text-xs leading-relaxed text-foreground/40">
                  {t('emptyDescription')}
                </p>
              </div>
            }
          />
        </div>

        {/* The SVG above is aria-hidden; this visually-hidden table is its
            accessible twin — every year's figures for screen-reader users. */}
        {rows.length > 1 ? (
          <ValuationDataTable
            rows={rows}
            locale={locale}
            currency={currency}
            labels={labels}
            caption={t('tableCaption')}
          />
        ) : null}

        <p className="text-[11px] leading-relaxed text-foreground/40">{t('footnote')}</p>
      </div>
    </div>
  )
}

export default ManualValuationCurvePanel
