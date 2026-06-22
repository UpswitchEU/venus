import type { ValuationRequest, ValuationSession } from '../../types/valuation'
import { generateReportId } from '../../utils/reportIdGenerator'
import { getRenderableReportHtml } from '../../utils/safetyNetReportHtml'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function asDate(value: unknown): Date | undefined {
  const raw = typeof value === 'string' || typeof value === 'number' ? value : undefined
  if (raw === undefined) return undefined
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? undefined : date
}

function asSessionData(value: unknown): Partial<ValuationRequest> {
  return (asRecord(value) ?? {}) as unknown as Partial<ValuationRequest>
}

export function mapReportFlowTypeToCurrentView(
  flowType: string | null | undefined,
  currentView?: string
): 'manual' | 'conversational' {
  if (
    flowType === 'conversational' ||
    currentView === 'conversational' ||
    currentView === 'ai-guided'
  ) {
    return 'conversational'
  }
  return 'manual'
}

export function mapReportFlowTypeToDataSource(
  flowType: string | null | undefined,
  dataSource?: string
): 'manual' | 'conversational' | 'mixed' {
  if (
    flowType === 'conversational' ||
    dataSource === 'conversational' ||
    dataSource === 'ai-guided'
  ) {
    return 'conversational'
  }
  return 'manual'
}

export function normalizeReportListItem(value: unknown): ValuationSession {
  const report = asRecord(value) ?? {}
  const partialData = asSessionData(report.partial_data)
  const sessionData = asSessionData(report.session_data ?? report.valuation_data)
  const enrichedSessionData = {
    ...sessionData,
    ...(typeof report.company_name === 'string' && !sessionData.company_name
      ? { company_name: report.company_name }
      : {}),
  }

  return {
    reportId: asString(report.id) ?? asString(report.report_id) ?? generateReportId(),
    currentView: mapReportFlowTypeToCurrentView(
      asString(report.flow_type),
      asString(report.current_view)
    ),
    dataSource: mapReportFlowTypeToDataSource(
      asString(report.flow_type),
      asString(report.data_source)
    ),
    name: asString(report.name),
    createdAt: asDate(report.created_at) ?? new Date(),
    updatedAt: asDate(report.updated_at) ?? new Date(),
    completedAt: asDate(report.completed_at),
    partialData,
    sessionData: enrichedSessionData,
    valuationResult:
      (asRecord(report.valuation_result) as unknown as ValuationSession['valuationResult']) ||
      undefined,
    htmlReport: getRenderableReportHtml(asString(report.html_report)) || undefined,
    calculatedAt: asDate(report.calculated_at),
  } as ValuationSession
}

export function normalizeReportListPayload(payload: unknown): ValuationSession[] {
  const json = asRecord(payload)
  const reportsPayload = json?.data ?? json?.sessions
  const reports = Array.isArray(reportsPayload) ? reportsPayload : []
  return reports.map(normalizeReportListItem)
}
