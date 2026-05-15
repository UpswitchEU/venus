function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
  const value = record?.[key]
  return typeof value === 'string' && value.trim() ? value : null
}

export interface GetManualStartupLauncherScopeIdParams {
  session: unknown
  resolvedReportId?: string | null
  reportId?: string | null
}

export function getManualStartupLauncherScopeId({
  session,
  resolvedReportId,
  reportId,
}: GetManualStartupLauncherScopeIdParams): string {
  const sessionRecord = asRecord(session)
  const sessionIdCandidate =
    readString(sessionRecord, 'id') ??
    readString(sessionRecord, 'key') ??
    readString(sessionRecord, 'session_key') ??
    ''

  return resolvedReportId || sessionIdCandidate || reportId || 'studio-launcher'
}

const STARTUP_ISSUE_ANCHORS: Record<string, string> = {
  profile: 'startup-section-profile',
  berkus: 'startup-section-berkus',
  scorecard: 'startup-section-scorecard',
  founder_pedigree: 'startup-section-pedigree',
  traction: 'startup-section-traction',
  exit_story: 'startup-section-exit',
  round_simulator: 'startup-section-round',
}

export function getManualStartupIssueAnchor(step: string | null | undefined): string | null {
  return step ? (STARTUP_ISSUE_ANCHORS[step] ?? null) : null
}
