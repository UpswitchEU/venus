import type {
  CreateVersionRequest,
  ValuationVersion,
  VersionChanges,
  VersionComparison,
} from '../types/ValuationVersion'
import type { ValuationRequest } from '../types/valuation'
import { dateLikeToUnixMs } from '../utils/date-like'
import { getRenderableReportHtml } from '../utils/safetyNetReportHtml'
import { createRandomId } from '../utils/secureRandom'
import { getFinalValuation as getAccessibleFinalValuation } from '../utils/valuationResultAccess'
import { resolveFormEbitda, resolveFormRevenue } from '../utils/versionDiffDetection'
import { buildVersionDisplayList } from '../utils/versionDisplayModel'

export type PersistedVersionMetadata = ValuationVersion & { _hasHtmlReport?: boolean }

export function generateVersionId(): string {
  return createRandomId('version', 16)
}

export function generateLocalVersionLabel(versionNumber: number, changes?: VersionChanges): string {
  if (changes && changes.significantChanges.length > 0) {
    return `v${versionNumber} - Adjusted ${changes.significantChanges.join(', ')}`
  }
  return `Version ${versionNumber}`
}

export function deduplicateVersionsByNumber(
  versions: readonly ValuationVersion[]
): ValuationVersion[] {
  return buildVersionDisplayList(versions, { sort: 'asc', timestampTie: 'last' })
}

export function mergeBackendVersionsByNumber({
  localVersions,
  backendVersions,
}: {
  localVersions: readonly ValuationVersion[]
  backendVersions: readonly ValuationVersion[]
}): ValuationVersion[] {
  const versionMap = new Map<number, ValuationVersion>()

  deduplicateVersionsByNumber(localVersions).forEach((version) => {
    versionMap.set(version.versionNumber, version)
  })
  backendVersions.forEach((version) => {
    const existing = versionMap.get(version.versionNumber)
    // A background summary must not replace an already loaded immutable report.
    versionMap.set(
      version.versionNumber,
      version.isSummary &&
        existing?.id === version.id &&
        !existing.isSummary &&
        existing.valuationResult
        ? {
            ...version,
            formData: existing.formData,
            valuationResult: existing.valuationResult,
            htmlReport: existing.htmlReport,
            normalization_data: existing.normalization_data,
            tax_latency_data: existing.tax_latency_data,
            isSummary: false,
          }
        : version
    )
  })

  return Array.from(versionMap.values()).sort((a, b) => a.versionNumber - b.versionNumber)
}

export function appendVersionIfMissing({
  versions,
  version,
}: {
  versions: readonly ValuationVersion[]
  version: ValuationVersion
}): { versionExists: boolean; versions: ValuationVersion[] } {
  const deduplicatedVersions = deduplicateVersionsByNumber(versions)
  const versionExists = deduplicatedVersions.some(
    (existing) => existing.versionNumber === version.versionNumber
  )

  return {
    versionExists,
    versions: versionExists
      ? deduplicatedVersions
      : [...deduplicatedVersions, version].sort((a, b) => a.versionNumber - b.versionNumber),
  }
}

export function createLocalVersionSnapshot({
  id = generateVersionId(),
  request,
  versionNumber,
}: {
  id?: string
  request: CreateVersionRequest
  versionNumber: number
}): ValuationVersion {
  return {
    id,
    reportId: request.reportId,
    versionNumber,
    versionLabel:
      request.versionLabel || generateLocalVersionLabel(versionNumber, request.changesSummary),
    createdAt: new Date(),
    createdBy: null,
    formData: request.formData,
    valuationResult: request.valuationResult || null,
    htmlReport: getRenderableReportHtml(request.htmlReport) || null,
    changesSummary: request.changesSummary || {
      totalChanges: 0,
      significantChanges: [],
    },
    isActive: true,
    isPinned: false,
    tags: request.tags || [],
    notes: request.notes,
    normalization_data: request.normalization_data,
    tax_latency_data: request.tax_latency_data,
  }
}

export function markVersionsInactive(versions: readonly ValuationVersion[]): ValuationVersion[] {
  return versions.map((version) => ({
    ...version,
    isActive: false,
  }))
}

export function detectVersionChanges(
  oldData: Partial<ValuationRequest>,
  newData: Partial<ValuationRequest>,
  timestamp: Date = new Date()
): VersionChanges {
  const changes: VersionChanges = {
    totalChanges: 0,
    significantChanges: [],
  }

  const oldRev = resolveFormRevenue(oldData)
  const newRev = resolveFormRevenue(newData)
  if (oldRev !== newRev) {
    const percentChange = oldRev !== 0 ? ((newRev - oldRev) / Math.abs(oldRev)) * 100 : 0
    changes.revenue = {
      from: oldRev,
      to: newRev,
      percentChange,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(percentChange) > 10) {
      changes.significantChanges.push('revenue')
    }
  }

  const oldEbit = resolveFormEbitda(oldData)
  const newEbit = resolveFormEbitda(newData)
  if (oldEbit !== newEbit) {
    const percentChange = oldEbit !== 0 ? ((newEbit - oldEbit) / Math.abs(oldEbit)) * 100 : 0
    changes.ebitda = {
      from: oldEbit,
      to: newEbit,
      percentChange,
      timestamp,
    }
    changes.totalChanges++
    if (Math.abs(percentChange) > 10) {
      changes.significantChanges.push('ebitda')
    }
  }

  if (oldData.company_name !== newData.company_name) {
    changes.companyName = {
      from: oldData.company_name || '',
      to: newData.company_name || '',
      timestamp,
    }
    changes.totalChanges++
  }

  if (oldData.founding_year !== newData.founding_year) {
    changes.foundingYear = {
      from: oldData.founding_year ?? 0,
      to: newData.founding_year ?? 0,
      timestamp,
    }
    changes.totalChanges++
  }

  return changes
}

function buildVersionValuationDelta(versionA: ValuationVersion, versionB: ValuationVersion) {
  if (
    !versionA.valuationResult ||
    typeof versionA.valuationResult !== 'object' ||
    !versionB.valuationResult ||
    typeof versionB.valuationResult !== 'object'
  ) {
    return null
  }

  const versionAValue = getAccessibleFinalValuation(versionA.valuationResult)
  const versionBValue = getAccessibleFinalValuation(versionB.valuationResult)
  if (versionAValue == null || versionBValue == null) return null

  const absoluteChange = versionBValue - versionAValue
  const denom = Math.abs(versionAValue) > 1e-9 ? Math.abs(versionAValue) : null
  return {
    absoluteChange,
    percentChange: denom != null ? (absoluteChange / denom) * 100 : 0,
    direction:
      versionBValue > versionAValue
        ? ('increase' as const)
        : versionBValue < versionAValue
          ? ('decrease' as const)
          : ('unchanged' as const),
  }
}

function buildVersionComparisonHighlights(
  changes: VersionChanges
): VersionComparison['highlights'] {
  const highlights: VersionComparison['highlights'] = []

  if (changes.revenue) {
    const percentChange = changes.revenue.percentChange ?? 0
    highlights.push({
      field: 'revenue',
      label: 'Revenue',
      oldValue: changes.revenue.from,
      newValue: changes.revenue.to,
      impact: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
    })
  }

  if (changes.ebitda) {
    const percentChange = changes.ebitda.percentChange ?? 0
    highlights.push({
      field: 'ebitda',
      label: 'EBITDA',
      oldValue: changes.ebitda.from,
      newValue: changes.ebitda.to,
      impact: `${percentChange > 0 ? '+' : ''}${percentChange.toFixed(1)}%`,
    })
  }

  return highlights
}

export function compareValuationVersions(
  versionA: ValuationVersion,
  versionB: ValuationVersion
): VersionComparison {
  const changes = detectVersionChanges(versionA.formData, versionB.formData)

  return {
    versionA,
    versionB,
    changes,
    valuationDelta: buildVersionValuationDelta(versionA, versionB),
    highlights: buildVersionComparisonHighlights(changes),
  }
}

export function partializeVersionHistoryState(state: {
  activeVersions: Record<string, number>
  versions: Record<string, ValuationVersion[]>
}) {
  const reportIds = Object.entries(state.versions)
    .map(([id, versions]) => ({
      id,
      latest: Math.max(0, ...versions.map((version) => dateLikeToUnixMs(version.createdAt) ?? 0)),
    }))
    .sort((a, b) => b.latest - a.latest)
    .slice(0, 10)
    .map((report) => report.id)
  return {
    activeVersions: Object.fromEntries(
      reportIds.flatMap((id) => {
        const selected = state.activeVersions[id]
        return Number.isSafeInteger(selected) && selected > 0 ? [[id, selected]] : []
      })
    ),
  }
}

export function isVersionSelection(
  value: unknown
): value is { activeVersions: Record<string, number> } {
  if (!value || typeof value !== 'object' || !('activeVersions' in value)) return false
  const selected = value.activeVersions
  return (
    !!selected &&
    typeof selected === 'object' &&
    !Array.isArray(selected) &&
    Object.keys(value).length === 1 &&
    Object.keys(selected).length <= 10 &&
    Object.entries(selected).every(
      ([id, number]) =>
        id.length > 0 &&
        id.length <= 200 &&
        typeof number === 'number' &&
        Number.isSafeInteger(number) &&
        number > 0
    )
  )
}
