import { coalesceFiniteNumber } from '@/lib/omniPreview'
import { getFinalValuation } from '@/utils/valuationResultAccess'

export interface ManualLiveMultiplePreview {
  previewEquity: number
  delta: number
  appliedMultiple: number
  benchmarkMultiple: number
}

interface BuildManualLiveMultiplePreviewParams {
  result: unknown
  report: { htmlReport?: string | null; valuation?: number | null } | null
  methodAcceptsOverride: boolean
  appliedMedian: number | null
  benchmarkMedian: number | null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readFiniteNumber(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function readOptionalFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function readPositiveFiniteNumber(value: unknown): number | null {
  const numeric = readOptionalFiniteNumber(value)
  return numeric != null && numeric > 0 ? numeric : null
}

function sumBalanceSheetAdjustments(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (!Array.isArray(value)) return 0

  return value.reduce((sum, item) => {
    const record = asRecord(item)
    return sum + coalesceFiniteNumber(record?.amount ?? record?.value ?? record?.adjustment)
  }, 0)
}

export function buildManualLiveMultiplePreview({
  result,
  report,
  methodAcceptsOverride,
  appliedMedian,
  benchmarkMedian,
}: BuildManualLiveMultiplePreviewParams): ManualLiveMultiplePreview | null {
  const resultRecord = asRecord(result)
  const details = asRecord(resultRecord?.details)
  const sustainableEbitda = readFiniteNumber(
    details?.sustainable_ebitda ?? details?.weighted_ebitda_total ?? resultRecord?.ebitda ?? 0
  )
  const netDebt = readFiniteNumber(details?.net_debt ?? resultRecord?.net_debt ?? 0)
  const balanceSheetAdj = sumBalanceSheetAdjustments(
    details?.balance_sheet_adjustments ?? resultRecord?.balance_sheet_adjustments
  )
  const currentHeadline = readFiniteNumber(
    readPositiveFiniteNumber(report?.valuation) ?? getFinalValuation(resultRecord) ?? 0
  )
  const appliedMultiple = readOptionalFiniteNumber(appliedMedian)
  const resultMultiples = asRecord(resultRecord?.multiples_valuation)
  const benchmarkMultiple =
    readOptionalFiniteNumber(benchmarkMedian) ??
    readOptionalFiniteNumber(resultMultiples?.ebitda_multiple)

  if (
    !report?.htmlReport ||
    !methodAcceptsOverride ||
    appliedMultiple == null ||
    benchmarkMultiple == null ||
    Math.abs(appliedMultiple - benchmarkMultiple) < 0.005 ||
    sustainableEbitda <= 0
  ) {
    return null
  }

  const previewEquity = Math.round(sustainableEbitda * appliedMultiple - netDebt + balanceSheetAdj)
  if (!Number.isFinite(previewEquity)) return null

  return {
    previewEquity,
    delta: previewEquity - currentHeadline,
    appliedMultiple,
    benchmarkMultiple,
  }
}
