const VENUS_GENERATED_DRAFT_REPORT_ID = /^val_\d+_v[a-z0-9]+$/

export function isLocalHostname(hostname: string | null | undefined): boolean {
  const normalized = (hostname ?? '').trim().toLowerCase()
  if (normalized.startsWith('[')) {
    return normalized.replace(/^\[|\](?::\d+)?$/g, '') === '::1'
  }
  if (normalized === '::1') return true
  const hostOnly = normalized.replace(/:\d+$/, '')
  return hostOnly === 'localhost' || hostOnly === '127.0.0.1' || hostOnly === '::1'
}

export function isVenusGeneratedDraftReportId(reportId: string | null | undefined): boolean {
  return VENUS_GENERATED_DRAFT_REPORT_ID.test((reportId ?? '').trim())
}

export interface LocalDevelopmentVenusDraftReportInput {
  reportId: string | null | undefined
  hostname: string | null | undefined
  sourceApp?: string | null
  clientId?: string | null
  clientToken?: string | null
  nodeEnv?: string
}

export function shouldAllowLocalDevelopmentVenusDraftReport({
  reportId,
  hostname,
  sourceApp,
  clientId,
  clientToken,
  nodeEnv = process.env.NODE_ENV,
}: LocalDevelopmentVenusDraftReportInput): boolean {
  if (nodeEnv !== 'development') return false
  if (!isLocalHostname(hostname)) return false
  if (!isVenusGeneratedDraftReportId(reportId)) return false
  if (sourceApp?.trim().toLowerCase() === 'mercury') return false
  if (clientId?.trim() || clientToken?.trim()) return false
  return true
}
