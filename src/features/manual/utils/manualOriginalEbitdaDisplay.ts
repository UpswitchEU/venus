import { getReportedEbitdaBaseline } from '@/utils/normalizationMath'

interface GetManualOriginalEbitdaForDisplayParams {
  year: number
  originalEBITDAByYear: Record<number, number>
  formCurrentEbitda?: unknown
  latestFormData?: {
    current_year_data?: { ebitda?: unknown } | null
    ebitda?: unknown
  } | null
  result?: unknown
  report?: unknown
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

export function getManualOriginalEbitdaForDisplay({
  year,
  originalEBITDAByYear,
  formCurrentEbitda,
  latestFormData,
  result,
  report,
}: GetManualOriginalEbitdaForDisplayParams): number {
  const resultRecord = asRecord(result)
  const resultCurrentYearData = asRecord(resultRecord?.current_year_data)
  const resultEbitdaMetadata = asRecord(resultCurrentYearData?.ebitda_normalization_metadata)
  const reportRecord = asRecord(report)

  return getReportedEbitdaBaseline({
    year,
    originalEBITDAByYear,
    fallbackCandidates: [
      formCurrentEbitda,
      latestFormData?.current_year_data?.ebitda,
      latestFormData?.ebitda,
      resultEbitdaMetadata?.reported_ebitda,
      resultRecord?.reported_ebitda,
      reportRecord?.reportedEbitda ?? reportRecord?.reported_ebitda,
    ],
  })
}
