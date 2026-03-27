/**
 * Keeps official_variance_analysis in sync when the user edits revenue/EBITDA
 * while official_financials is present (sync bootstrap does this server-side;
 * async merge + this hook match that behavior on the client).
 */

import { useEffect } from 'react'
import { useManualFormStore } from '../store/manual/useManualFormStore'
import { applyUserVsOfficialVariance } from '../utils/officialFinancialsVariance'
import { resolveTrustComparisonUserFigures } from '../utils/resolveTrustComparisonUserFigures'

export function useSyncOfficialVarianceFromForm(): void {
  const revenue = useManualFormStore((s) => s.formData.revenue)
  const ebitda = useManualFormStore((s) => s.formData.ebitda)
  const cyRev = useManualFormStore((s) => s.formData.current_year_data?.revenue)
  const cyEbit = useManualFormStore((s) => s.formData.current_year_data?.ebitda)
  const histYears = useManualFormStore((s) => s.formData.historical_years_data)
  const cyYear = useManualFormStore((s) => s.formData.current_year_data?.year)
  const officialFilingYear = useManualFormStore((s) => s.formData.official_financials?.filingYear)
  const hasOfficial = useManualFormStore((s) => !!s.formData.official_financials)

  useEffect(() => {
    if (!hasOfficial) return

    const fd = useManualFormStore.getState().formData
    const of = fd.official_financials
    if (!of) return

    const { revenue: userR, ebitda: userE } = resolveTrustComparisonUserFigures(fd, of.filingYear)
    const next = applyUserVsOfficialVariance(of, userR, userE, fd.official_variance_analysis)
    const va = fd.official_variance_analysis
    const nv = next.varianceAnalysis
    if (
      va?.state === nv?.state &&
      va?.explanationRequired === nv?.explanationRequired &&
      va?.severity === nv?.severity &&
      va?.maxVariancePercent === nv?.maxVariancePercent &&
      (va?.explanation ?? '') === (nv?.explanation ?? '')
    ) {
      return
    }

    useManualFormStore.getState().updateFormData({
      official_financials: next,
      official_variance_analysis: next.varianceAnalysis,
    })
  }, [revenue, ebitda, cyRev, cyEbit, cyYear, histYears, officialFilingYear, hasOfficial])
}
