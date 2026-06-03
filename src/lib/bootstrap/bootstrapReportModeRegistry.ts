import type { ReportMode } from './types'

const BOOTSTRAP_REPORT_MODE_TTL_MS = 5 * 60_000

type BootstrapReportModeEntry = {
  mode: ReportMode
  recordedAt: number
}

const reportModes = new Map<string, BootstrapReportModeEntry>()

function normalizeReportId(reportId: string | null | undefined): string | null {
  const trimmed = reportId?.trim()
  return trimmed ? trimmed : null
}

export function recordBootstrapReportMode(
  reportId: string | null | undefined,
  mode: ReportMode | null | undefined
): void {
  const normalized = normalizeReportId(reportId)
  if (!normalized || !mode) return
  reportModes.set(normalized, { mode, recordedAt: Date.now() })
}

export function getBootstrapReportMode(reportId: string | null | undefined): ReportMode | null {
  const normalized = normalizeReportId(reportId)
  if (!normalized) return null

  const entry = reportModes.get(normalized)
  if (!entry) return null

  if (Date.now() - entry.recordedAt > BOOTSTRAP_REPORT_MODE_TTL_MS) {
    reportModes.delete(normalized)
    return null
  }

  return entry.mode
}

/** @internal Vitest-only */
export function resetBootstrapReportModeRegistryForTests(): void {
  reportModes.clear()
}
