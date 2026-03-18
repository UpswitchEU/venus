/**
 * Normalization Persist Utilities
 *
 * Shared logic for persisting normalizations before valuation calculation
 * and for sync-after-accept/reject/change flows.
 * Ensures normalizations are durable in Titan.
 *
 * @module utils/normalizationPersist
 */

import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationModal'
import { useNormalizationStore } from '../store/useNormalizationStore'
import { getLastFullFiscalYear } from './fiscalYear'
import { isValidSessionId } from './sessionIdValidation'
import { appliesToYear } from './normalizationMath'

/** Request shape with financial years (from buildValuationRequest output) */
interface RequestWithYears {
  current_year_data?: {
    year?: number
    ebitda?: number
    ebitda_normalization_metadata?: { reported_ebitda?: number }
  }
  historical_years_data?: Array<{
    year?: number
    ebitda?: number
    ebitda_normalization_metadata?: { reported_ebitda?: number }
  }>
}

/**
 * Persist all accepted normalizations to Titan before calculation.
 * Call this immediately before valuationService.calculateValuation.
 *
 * @param reportId - Session/report ID (UUID or session key)
 * @param request - Valuation request with current_year_data and historical_years_data
 * @returns true if proceed (no normalizations or persist succeeded), false if failed
 */
export async function persistNormalizationsBeforeCalculate(
  reportId: string,
  request: RequestWithYears
): Promise<boolean> {
  if (!isValidSessionId(reportId)) return true
  const hasAnyNorm = useNormalizationStore.getState().items.some((n) => n.status === 'accepted')
  if (!hasAnyNorm) return true

  const cyd = request.current_year_data
  const hy = request.historical_years_data || []
  const years = [
    ...new Set([
      ...(cyd?.year != null ? [cyd.year] : []),
      ...hy.map((h) => h?.year).filter((y): y is number => Number.isFinite(y)),
    ]),
  ].filter(Number.isFinite) as number[]

  // CRITICAL: Use reported_ebitda (raw) from metadata when present.
  // buildValuationRequest puts normalized ebitda in cyd.ebitda when normalizations exist;
  // using that would double-apply adjustments when persisting to Titan.
  const originalEBITDAByYear: Record<number, number> = {}
  const safeEbitda = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
  const getReportedEbitda = (yd: { ebitda?: number; ebitda_normalization_metadata?: { reported_ebitda?: number } }) =>
    safeEbitda(yd?.ebitda_normalization_metadata?.reported_ebitda ?? yd?.ebitda)
  if (cyd?.year != null) originalEBITDAByYear[cyd.year] = getReportedEbitda(cyd)
  for (const h of hy) {
    if (h?.year != null) originalEBITDAByYear[h.year] = getReportedEbitda(h)
  }

  const yearsToUse = years.length > 0 ? years : [getLastFullFiscalYear()]
  const persist = () =>
    useNormalizationStore.getState().persistAllToTitan(reportId, originalEBITDAByYear, yearsToUse)

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      await persist()
      return true
    } catch {
      if (attempt < 2) {
        await new Promise((r) => setTimeout(r, 1000))
      } else {
        return false
      }
    }
  }
  return false
}

/**
 * Persist or delete normalizations for given years.
 * For each year: persist if any accepted item applies; else delete.
 * Shared by accept/reject/change handlers to avoid duplicate logic.
 *
 * @param reportId - Session/report ID
 * @param years - Years to sync
 * @param originalEBITDAByYear - Reported EBITDA per year
 * @param norms - Current normalization items (after accept/reject/change)
 */
export async function persistOrDeleteNormalizationsForYears(
  reportId: string,
  years: number[],
  originalEBITDAByYear: Record<number, number>,
  norms: NormalizationItem[]
): Promise<void> {
  if (!isValidSessionId(reportId)) return
  const { normalizationService } = await import('../services/ebitdaNormalizationService')
  const { persistToTitan } = useNormalizationStore.getState()

  await Promise.all(
    years.map((year) => {
      const hasAcceptedForYear = norms.some((n) => appliesToYear(n, year))
      if (hasAcceptedForYear) {
        return persistToTitan(
          reportId,
          year,
          Number.isFinite(originalEBITDAByYear[year]) ? originalEBITDAByYear[year]! : 0
        )
      }
      return normalizationService.deleteNormalization(reportId, year).catch(() => undefined)
    })
  )
}
