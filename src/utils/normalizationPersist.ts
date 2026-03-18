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

/** Accepted item applies to year */
const appliesToYear = (item: NormalizationItem, year: number) =>
  item.status === 'accepted' &&
  (item.applyAllYears || (item.applyYears?.length ? item.applyYears.includes(year) : item.year === year))

/** Request shape with financial years (from buildValuationRequest output) */
interface RequestWithYears {
  current_year_data?: { year?: number; ebitda?: number }
  historical_years_data?: Array<{ year?: number; ebitda?: number }>
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

  const originalEBITDAByYear: Record<number, number> = {}
  if (cyd?.year != null) originalEBITDAByYear[cyd.year] = Number(cyd.ebitda) ?? 0
  for (const h of hy) {
    if (h?.year != null) originalEBITDAByYear[h.year] = Number(h.ebitda) ?? 0
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
