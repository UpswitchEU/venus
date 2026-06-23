import { mergeSessionSurfaceForOptionalPrefill } from '../../../utils/mergeOptionalSessionPrefillFields'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'

export interface SessionReadinessSurface {
  session_data?: Record<string, unknown> | null
}

const MEANINGFUL_SESSION_FIELDS = [
  'company_name',
  'business_type_id',
  'revenue',
  'ebitda',
  'industry',
  'filing_year_confirmed',
  'valuation_result',
  '_valuationResult',
  'html_report',
  'htmlReport',
  '_htmlReport',
  'kbo_number',
  'kboNumber',
  'vat_number',
  'vatNumber',
] as const

function readSessionData(session: SessionReadinessSurface): Record<string, unknown> {
  return session.session_data ?? {}
}

function readYearData(
  merged: Record<string, unknown>,
  sessionData: Record<string, unknown>
): Record<string, unknown> | undefined {
  const value = merged.year_data ?? merged.yearData ?? sessionData.year_data ?? sessionData.yearData
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

export function sessionHasExistingData(session: SessionReadinessSurface): boolean {
  const sessionData = readSessionData(session)
  const merged = mergeSessionSurfaceForOptionalPrefill(sessionData) as Record<string, unknown>

  for (const field of MEANINGFUL_SESSION_FIELDS) {
    const value = merged[field]
    if (value !== null && value !== undefined && value !== '') {
      return true
    }
  }

  const yearData = readYearData(merged, sessionData)
  return yearData ? Object.keys(yearData).length > 0 : false
}

export function sessionHasValuationResult(session: SessionReadinessSurface): boolean {
  const sessionData = readSessionData(session)
  if (sessionData.valuation_result || sessionData._valuationResult) {
    return true
  }

  return !!getFirstRenderableReportHtml(
    typeof sessionData._htmlReport === 'string' ? sessionData._htmlReport : null,
    typeof sessionData.htmlReport === 'string' ? sessionData.htmlReport : null,
    typeof sessionData.html_report === 'string' ? sessionData.html_report : null
  )
}
