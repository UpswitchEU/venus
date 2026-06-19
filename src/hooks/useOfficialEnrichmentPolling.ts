import { type MutableRefObject, useEffect } from 'react'
import type { useBootstrapSafe } from '../lib/bootstrap'
import type { PrefillSource } from '../lib/bootstrap/types'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import type { ValuationFormData } from '../types/valuation'
import {
  normalizeCurrentYearForFiling,
  normalizeHistoricalYearsForFiling,
} from '../utils/fiscalYear'
import { createContextLogger } from '../utils/logger'
import { mapBelgianOfficialRegistryResponseToOfficialFinancials } from '../utils/mapBelgianOfficialRegistryResponse'
import { hasUsableOfficialFinancialsContent } from '../utils/officialFinancialsContent'
import { applyUserVsOfficialVariance } from '../utils/officialFinancialsVariance'
import { resolveTrustComparisonUserFigures } from '../utils/resolveTrustComparisonUserFigures'

type BootstrapSafeSnapshot = ReturnType<typeof useBootstrapSafe>

const logger = createContextLogger('BootstrapPrefill')
const OFFICIAL_ENRICHMENT_MAX_ATTEMPTS = 90
const OFFICIAL_ENRICHMENT_POLL_INTERVAL_MS = 2000

export function useOfficialEnrichmentPolling(
  bootstrapRef: MutableRefObject<BootstrapSafeSnapshot>
): void {
  useEffect(() => {
    const bootstrap = bootstrapRef.current
    if (!bootstrap) return
    const jobId = bootstrap.prefillData.officialEnrichmentJobId
    if (!jobId || bootstrap.isBootstrapping) return

    let cancelled = false
    let attempts = 0
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    const schedule = (fn: () => void) => {
      timeoutId = setTimeout(fn, OFFICIAL_ENRICHMENT_POLL_INTERVAL_MS)
    }

    const clearOfficialJob = (reason: string) => {
      logger.warn('Async Belgian official enrichment poll stopped', {
        jobId: jobId.substring(0, 8),
        reason,
      })
      bootstrapRef.current?.updatePrefillData({ officialEnrichmentJobId: undefined })
    }

    const poll = async () => {
      if (cancelled || attempts >= OFFICIAL_ENRICHMENT_MAX_ATTEMPTS) {
        if (attempts >= OFFICIAL_ENRICHMENT_MAX_ATTEMPTS) {
          clearOfficialJob(`max_attempts_${OFFICIAL_ENRICHMENT_MAX_ATTEMPTS}`)
        }
        return
      }
      attempts += 1
      try {
        const res = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          credentials: 'include',
        })

        if (!res.ok) {
          if (res.status === 401 || res.status === 403) {
            clearOfficialJob(`http_${res.status}`)
            return
          }
          if (!cancelled) {
            schedule(() => {
              void poll()
            })
          }
          return
        }

        const data = (await res.json()) as {
          status?: string
          result?: Record<string, unknown> | null
        }
        if (cancelled) return

        const status = data.status
        if (status === 'completed') {
          if (!data.result || typeof data.result !== 'object') {
            clearOfficialJob('completed_empty_result')
            return
          }
          mergeOfficialEnrichmentResult(jobId, data.result, bootstrapRef.current)
          return
        }

        if (status === 'failed') {
          clearOfficialJob('job_failed')
          return
        }

        schedule(() => {
          void poll()
        })
      } catch {
        if (!cancelled) {
          schedule(() => {
            void poll()
          })
        }
      }
    }

    void poll()
    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [bootstrapRef])
}

function mergeOfficialEnrichmentResult(
  jobId: string,
  result: Record<string, unknown>,
  bootstrap: BootstrapSafeSnapshot
): void {
  let mapped = mapBelgianOfficialRegistryResponseToOfficialFinancials(result)
  if (mapped && !hasUsableOfficialFinancialsContent(mapped)) {
    logger.warn('Async Belgian official enrichment poll stopped', {
      jobId: jobId.substring(0, 8),
      reason: 'completed_no_usable_filing_content',
    })
    bootstrap?.updatePrefillData({ officialEnrichmentJobId: undefined })
    return
  }

  if (!mapped) {
    logger.warn('Async Belgian official enrichment poll stopped', {
      jobId: jobId.substring(0, 8),
      reason: 'completed_unmappable_registry_payload',
    })
    bootstrap?.updatePrefillData({ officialEnrichmentJobId: undefined })
    return
  }

  const fdBefore = useManualFormStore.getState().formData
  const { updateFormData } = useManualFormStore.getState()
  const { revenue: userRevenue, ebitda: userEbitda } = resolveTrustComparisonUserFigures(
    fdBefore,
    mapped.filingYear
  )
  mapped = applyUserVsOfficialVariance(
    mapped,
    userRevenue,
    userEbitda,
    fdBefore.official_variance_analysis
  )

  const financialPatch: Partial<ValuationFormData> = {
    official_financials: mapped,
    ...(mapped.varianceAnalysis && {
      official_variance_analysis: mapped.varianceAnalysis,
    }),
    ...(mapped.verificationBadge && {
      official_verification_badge: mapped.verificationBadge,
    }),
  }

  if (fdBefore.revenue == null && mapped.revenue != null) {
    financialPatch.revenue = mapped.revenue
  }
  if (fdBefore.ebitda == null && mapped.ebitda != null) {
    financialPatch.ebitda = mapped.ebitda
  }

  const currentYearData = fdBefore.current_year_data
  if (currentYearData && (currentYearData.revenue == null || currentYearData.ebitda == null)) {
    financialPatch.current_year_data = {
      ...currentYearData,
      year: normalizeCurrentYearForFiling(currentYearData.year, fdBefore.filing_year_confirmed),
      revenue:
        currentYearData.revenue == null && mapped.revenue != null
          ? mapped.revenue
          : currentYearData.revenue,
      ebitda:
        currentYearData.ebitda == null && mapped.ebitda != null
          ? mapped.ebitda
          : currentYearData.ebitda,
    }
  }
  if (Array.isArray(fdBefore.historical_years_data)) {
    financialPatch.historical_years_data = normalizeHistoricalYearsForFiling(
      fdBefore.historical_years_data,
      fdBefore.filing_year_confirmed
    )
  }

  updateFormData(financialPatch)
  const prevSources = bootstrap?.prefillData.sources ?? []
  const withoutPending = prevSources.filter((s) => s !== 'official_belgian_filing_pending')
  const sources: PrefillSource[] = withoutPending.includes('official_belgian_filing')
    ? withoutPending
    : [...withoutPending, 'official_belgian_filing']
  bootstrap?.updatePrefillData({
    officialFinancials: mapped,
    officialEnrichmentJobId: undefined,
    sources,
  })
  logger.info('Merged async Belgian official enrichment into form', {
    jobId: jobId.substring(0, 8),
  })
}
