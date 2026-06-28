/**
 * Valuation trend chart — the value-over-fiscal-years curve, ported from Mercury's
 * universal valuation graph (visx). Venus feeds it the engine's `valuation_timeline`.
 */

export { ValuationDataTable } from './ValuationGraphVisuals'
export type { ValuationTrendChartProps } from './ValuationTrendChart'
export { ValuationTrendChart } from './ValuationTrendChart'
export {
  buildChartRows,
  type ChartDateMode,
  type ChartLabels,
  type ChartRow,
  formatDate,
  formatDelta,
  formatGraphCurrency,
  type ValuationGraphPoint,
  type ValuationMilestoneMarker,
} from './valuation-graph-model'
export {
  buildHeadlineFallbackRows,
  buildTimelineChartRows,
  resolveTimelineCurrency,
} from './valuation-timeline-rows'
