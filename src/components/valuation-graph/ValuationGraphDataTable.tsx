import {
  formatConfidenceScore,
  formatGraphRange,
  resolvePointLabel,
  resolvePointStatusLabel,
} from './ValuationGraphVisuals.model'
import {
  type ChartDateMode,
  type ChartLabels,
  type ChartRow,
  formatGraphCurrency,
  formatTooltipDate,
  formatYear,
} from './valuation-graph-model'

/**
 * Visually-hidden (`sr-only`) data table that mirrors the multi-point chart.
 * The SVG itself is `aria-hidden`, so this table is the sole accessible
 * representation: screen-reader and keyboard users get every point's figures
 * without needing pointer-driven tooltips.
 */
export function ValuationDataTable({
  rows,
  locale,
  currency,
  labels,
  caption,
  dateMode = 'date',
}: {
  rows: ChartRow[]
  locale: string
  currency?: string | null
  labels: ChartLabels
  caption: string
  dateMode?: ChartDateMode
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{labels.date}</th>
          <th scope="col">{labels.midpoint}</th>
          <th scope="col">{labels.range}</th>
          <th scope="col">{labels.askingPrice}</th>
          <th scope="col">{labels.status}</th>
          <th scope="col">{labels.method}</th>
          <th scope="col">{labels.confidence}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const rowLabel = resolvePointLabel(row, labels)
          return (
            <tr key={row.id}>
              <th scope="row">
                {dateMode === 'year'
                  ? formatYear(row.observedAt)
                  : formatTooltipDate(row.observedAt, locale)}
                {row.source === 'valuation_version' && row.versionNumber != null
                  ? ` · ${labels.version} ${row.versionNumber}`
                  : ''}
                {row.source !== 'valuation_version' && rowLabel !== labels.reportSnapshot
                  ? ` · ${rowLabel}`
                  : ''}
              </th>
              <td>{formatGraphCurrency(row.valueMid, currency, locale)}</td>
              <td>
                {row.rangeHigh > row.rangeLow ? formatGraphRange(row, currency, locale) : '-'}
              </td>
              <td>
                {row.askingPrice != null
                  ? formatGraphCurrency(row.askingPrice, currency, locale)
                  : '-'}
              </td>
              <td>{resolvePointStatusLabel(row, labels)}</td>
              <td>{row.methodology ?? '-'}</td>
              <td>{formatConfidenceScore(row.confidenceScore) ?? '-'}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
