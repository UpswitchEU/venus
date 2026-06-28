import {
  type ChartDateMode,
  formatAxisDate,
  formatGraphCurrency,
  formatYear,
} from './valuation-graph-model'

export function YAxisTickLabels({
  scale,
  tickValues,
  locale,
  currency,
}: {
  scale: (value: number) => number | undefined
  tickValues: number[]
  locale: string
  currency?: string | null
}) {
  return (
    <g className="valuation-graph-y-axis">
      {tickValues.map((value) => (
        <text
          key={value}
          x={-8}
          y={scale(value) ?? 0}
          textAnchor="end"
          dominantBaseline="middle"
          fill="hsl(var(--muted-foreground))"
          fontSize={11}
          fontFamily="var(--font-sans, inherit)"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatGraphCurrency(value, currency, locale)}
        </text>
      ))}
    </g>
  )
}

export function XAxisTickLabels({
  scale,
  tickValues,
  top,
  locale,
  includeTimeOnTicks,
  dateMode = 'date',
}: {
  scale: (value: Date) => number | undefined
  tickValues: Date[]
  top: number
  locale: string
  includeTimeOnTicks: boolean
  /** 'year' ⇒ render the fiscal year ("2026") instead of a calendar date. */
  dateMode?: ChartDateMode
}) {
  // In year mode a tick that repeats a year already shown adds noise, not
  // information — drop the duplicate label (keeps the tick spacing intact).
  const seenYears = new Set<string>()
  return (
    <g className="valuation-graph-x-axis" transform={`translate(0, ${top})`}>
      {tickValues.map((value) => {
        let label: string
        if (dateMode === 'year') {
          label = formatYear(value)
          if (seenYears.has(label)) return null
          seenYears.add(label)
        } else {
          label = formatAxisDate(value, locale, includeTimeOnTicks)
        }
        return (
          <text
            key={value.toISOString()}
            x={scale(value) ?? 0}
            y={18}
            textAnchor="middle"
            fill="hsl(var(--muted-foreground))"
            fontSize={11}
            fontFamily="var(--font-sans, inherit)"
          >
            {label}
          </text>
        )
      })}
    </g>
  )
}
