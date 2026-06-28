import { chartSurfaceClass } from './chart-primitives'
import {
  formatConfidenceScore,
  formatGraphRange,
  resolvePointKindLabel,
  resolvePointLabel,
  resolvePointStatusLabel,
} from './ValuationGraphVisuals.model'
import type { ChartDateMode, ChartLabels, ChartRow } from './valuation-graph-model'
import { formatGraphCurrency, formatTooltipDate, formatYear } from './valuation-graph-model'

export function ValuationTooltipCard({
  row,
  locale,
  currency,
  labels,
  dateMode = 'date',
}: {
  row: ChartRow
  locale: string
  currency?: string | null
  labels: ChartLabels
  /** 'year' ⇒ the header reads "2026" (fiscal year) instead of a full date. */
  dateMode?: ChartDateMode
}) {
  const confidence = formatConfidenceScore(row.confidenceScore)
  const badgeLabel = resolvePointLabel(row, labels)
  const pointKindLabel = resolvePointKindLabel(row, labels)
  return (
    <div className={`w-[280px] max-w-[calc(100vw-2rem)] px-3 py-2.5 text-xs ${chartSurfaceClass}`}>
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-foreground">
            {dateMode === 'year'
              ? formatYear(row.observedAt)
              : formatTooltipDate(row.observedAt, locale)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{pointKindLabel}</p>
        </div>
        <span
          className="max-w-[9rem] shrink-0 truncate rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] font-medium text-primary"
          title={badgeLabel}
        >
          {badgeLabel}
        </span>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
        <dt className="text-muted-foreground">{labels.status}</dt>
        <dd className="text-right text-foreground/85">{resolvePointStatusLabel(row, labels)}</dd>
        <dt className="text-muted-foreground">{labels.midpoint}</dt>
        <dd className="text-right font-mono font-semibold tabular-nums text-foreground">
          {formatGraphCurrency(row.valueMid, currency, locale)}
        </dd>
        {row.rangeHigh > row.rangeLow ? (
          <>
            <dt className="text-muted-foreground">{labels.range}</dt>
            <dd className="text-right font-mono tabular-nums text-foreground/85">
              {formatGraphRange(row, currency, locale)}
            </dd>
          </>
        ) : null}
        {row.askingPrice != null ? (
          <>
            <dt className="text-muted-foreground">{labels.askingPrice}</dt>
            <dd className="text-right font-mono tabular-nums text-foreground/85">
              {formatGraphCurrency(row.askingPrice, currency, locale)}
            </dd>
          </>
        ) : null}
        {row.methodology ? (
          <>
            <dt className="text-muted-foreground">{labels.method}</dt>
            <dd className="break-words text-right leading-snug text-foreground/85">
              {row.methodology}
            </dd>
          </>
        ) : null}
        {confidence ? (
          <>
            <dt className="text-muted-foreground">{labels.confidence}</dt>
            <dd className="text-right font-mono tabular-nums text-foreground/85">{confidence}</dd>
          </>
        ) : null}
      </dl>
    </div>
  )
}
