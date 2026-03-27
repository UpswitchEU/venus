import type { EvEquityWaterfallStep, ValuationResponse } from '../types/valuation'

type ValuationLike = Partial<ValuationResponse> & {
  report_context?: Record<string, unknown>
  details?: Record<string, unknown>
}

/**
 * EV→equity bridge steps: prefer top-level `ev_equity_waterfall_steps`, then
 * `report_context.valuation_waterfall_steps` (Titan-persisted template context).
 */
export function extractEvEquityWaterfallSteps(
  source: ValuationLike | null | undefined
): EvEquityWaterfallStep[] | undefined {
  if (!source) return undefined
  const direct = source.ev_equity_waterfall_steps
  if (Array.isArray(direct) && direct.length > 0) {
    return direct as EvEquityWaterfallStep[]
  }
  const rc = source.report_context
  if (rc && typeof rc === 'object' && !Array.isArray(rc)) {
    const steps = rc['valuation_waterfall_steps']
    if (Array.isArray(steps) && steps.length > 0) {
      return steps as EvEquityWaterfallStep[]
    }
  }
  const details = source.details
  if (details && typeof details === 'object') {
    const nestedRc = details['report_context'] as Record<string, unknown> | undefined
    if (nestedRc && typeof nestedRc === 'object') {
      const steps = nestedRc['valuation_waterfall_steps']
      if (Array.isArray(steps) && steps.length > 0) {
        return steps as EvEquityWaterfallStep[]
      }
    }
  }
  return undefined
}
