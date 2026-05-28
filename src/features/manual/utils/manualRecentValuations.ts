import type { RecentValuation } from '@/components/calculator'
import { isSessionKey, valuationIdsReferToSameReport } from '@/utils/identifiers'

interface BuildManualRecentValuationsParams {
  rawRecentValuations: RecentValuation[]
  reportId: string
  resolvedReportId?: string | null
  sessionReportId?: string | null
  activeSessionKey?: string | null
  sessionName?: string | null
  sessionUpdatedAt?: unknown
  sessionCreatedAt?: unknown
  currentReport?: {
    companyName?: string | null
    generatedAt?: Date | null
  } | null
  collectedCompanyName?: string | null
  isAccountantFlow: boolean
  clientCompanyName?: string | null
  unnamedLabel: string
  now?: Date
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null
}

function trimOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function readDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === 'string' || typeof value === 'number') {
    const date = new Date(value)
    if (Number.isFinite(date.getTime())) return date
  }
  return null
}

export function mapReportsResponseToRecentValuations(
  data: unknown,
  {
    unnamedLabel,
    limit = 5,
    now = new Date(),
  }: {
    unnamedLabel: string
    limit?: number
    now?: Date
  }
): RecentValuation[] {
  const root = asRecord(data)
  const reports =
    root?.reports ??
    root?.data ??
    root?.items ??
    root?.sessions ??
    (Array.isArray(data) ? data : [])

  if (!Array.isArray(reports)) return []

  return reports
    .slice(0, limit)
    .map((report): RecentValuation | null => {
      const record = asRecord(report)
      if (!record) return null

      const id =
        readString(record.id) ?? readString(record.report_id) ?? readString(record.reportId)
      if (!id) return null

      const companyName =
        readString(record.company_name) ??
        readString(record.companyName) ??
        readString(record.name) ??
        unnamedLabel

      const status = readString(record.status)

      return {
        id,
        companyName,
        updatedAt:
          readDate(record.updated_at) ??
          readDate(record.updatedAt) ??
          readDate(record.created_at) ??
          now,
        isDraft: status === 'draft' || status === 'in_progress',
        deleteMode: 'report',
      }
    })
    .filter((valuation): valuation is RecentValuation => valuation !== null)
}

export function buildManualRecentValuations({
  rawRecentValuations,
  reportId,
  resolvedReportId,
  sessionReportId,
  activeSessionKey,
  sessionName,
  sessionUpdatedAt,
  sessionCreatedAt,
  currentReport,
  collectedCompanyName,
  isAccountantFlow,
  clientCompanyName,
  unnamedLabel,
  now = new Date(),
}: BuildManualRecentValuationsParams): RecentValuation[] {
  const currentId =
    sessionReportId || (reportId && reportId !== 'new' ? reportId : null) || activeSessionKey
  const idForMatch = resolvedReportId || currentId
  const matchCandidates = [
    idForMatch,
    currentId,
    sessionReportId,
    activeSessionKey,
    reportId,
    resolvedReportId,
  ].filter((candidate): candidate is string => typeof candidate === 'string' && candidate !== '')

  const inList =
    matchCandidates.length > 0 &&
    rawRecentValuations.some((valuation) => matchCandidates.includes(valuation.id))

  if (!((currentId || (reportId && reportId !== 'new') || currentReport) && !inList)) {
    return rawRecentValuations
  }

  const prependedId = sessionReportId || resolvedReportId || currentId || reportId
  if (!prependedId) return rawRecentValuations

  const companyName =
    trimOrNull(currentReport?.companyName) ??
    trimOrNull(collectedCompanyName) ??
    trimOrNull(sessionName) ??
    (isAccountantFlow ? trimOrNull(clientCompanyName) : null) ??
    unnamedLabel

  const updatedAt =
    readDate(sessionUpdatedAt) ??
    readDate(sessionCreatedAt) ??
    readDate(currentReport?.generatedAt) ??
    now

  // Draft `val_*` sessions without a linked report row must use session DELETE, not report DELETE.
  const isSessionOnly = isSessionKey(prependedId) && !sessionReportId

  return [
    {
      id: prependedId,
      companyName,
      updatedAt,
      isDraft: isSessionOnly || !currentReport,
      deleteMode: isSessionOnly ? 'session' : 'report',
    },
    ...rawRecentValuations,
  ]
}

export function filterRemainingRecentValuationsAfterDelete({
  rawRecentValuations,
  deletedId,
  sessionReportId,
  sessionKey,
}: {
  rawRecentValuations: RecentValuation[]
  deletedId: string
  sessionReportId?: string | null
  sessionKey?: string | null
}): RecentValuation[] {
  return rawRecentValuations.filter(
    (valuation) =>
      !valuationIdsReferToSameReport(valuation.id, deletedId, {
        sessionReportId: sessionReportId ?? undefined,
        sessionKey: sessionKey ?? undefined,
      })
  )
}
