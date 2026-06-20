import type {
  CreateVersionRequest,
  ValuationVersion,
  VersionChanges,
  VersionComparison,
} from '../types/ValuationVersion'
import type { ValuationRequest } from '../types/valuation'
import { dateLikeToUnixMs } from '../utils/date-like'
import { normalizeCurrentYearForFiling } from '../utils/fiscalYear'
import { getRenderableReportHtml } from '../utils/safetyNetReportHtml'
import { createRandomId } from '../utils/secureRandom'
import { getFinalValuation as getAccessibleFinalValuation } from '../utils/valuationResultAccess'
import { resolveFormEbitda, resolveFormRevenue } from '../utils/versionDiffDetection'
import { buildCurrentYearData } from '../utils/yearData'

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

function versionCreatedAtMs(version: ValuationVersion): number {
  return dateLikeToUnixMs(version.createdAt) ?? Number.NEGATIVE_INFINITY
}

export function deduplicateVersionsByNumber(
  versions: readonly ValuationVersion[]
): ValuationVersion[] {
  const versionMap = new Map<number, ValuationVersion>()

  versions.forEach((version) => {
    const existing = versionMap.get(version.versionNumber)
    if (!existing || versionCreatedAtMs(version) >= versionCreatedAtMs(existing)) {
      versionMap.set(version.versionNumber, version)
    }
  })

  return Array.from(versionMap.values()).sort((a, b) => a.versionNumber - b.versionNumber)
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
    versionMap.set(version.versionNumber, version)
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
  const MAX_VERSIONS_PER_REPORT = 15
  const MAX_REPORTS = 10
  const lightweight: Record<string, ValuationVersion[]> = {}

  const reportIds = Object.entries(state.versions)
    .map(([id, versions]) => ({
      id,
      latest: Math.max(0, ...versions.map((version) => dateLikeToUnixMs(version.createdAt) ?? 0)),
    }))
    .sort((a, b) => b.latest - a.latest)
    .slice(0, MAX_REPORTS)
    .map((report) => report.id)

  for (const reportId of reportIds) {
    const versions = state.versions[reportId] || []
    const trimmed = versions.slice(-MAX_VERSIONS_PER_REPORT).map((version) => {
      const formData = version.formData
      const lightweightFormData = {
        country_code: formData?.country_code || '',
        company_name: formData?.company_name,
        current_year_data: formData?.current_year_data
          ? buildCurrentYearData({
              year: normalizeCurrentYearForFiling(
                formData.current_year_data.year,
                formData?.filing_year_confirmed
              ),
              revenue: formData.current_year_data.revenue,
              ebitda: formData.current_year_data.ebitda,
              currentYearData: formData.current_year_data,
            })
          : undefined,
        number_of_employees: formData?.number_of_employees,
        number_of_owners: formData?.number_of_owners,
        industry: formData?.industry,
        business_type: formData?.business_type,
      } as unknown as ValuationVersion['formData']
      const versionMetadata = version as PersistedVersionMetadata
      return {
        ...version,
        formData: lightweightFormData,
        valuationResult: null,
        htmlReport: null,
        normalization_data: undefined,
        tax_latency_data: undefined,
        _hasHtmlReport: !!versionMetadata._hasHtmlReport || !!version.htmlReport,
      }
    })
    lightweight[reportId] = trimmed
  }

  const activeVersionsFiltered: Record<string, number> = {}
  for (const reportId of reportIds) {
    if (state.activeVersions[reportId] != null) {
      activeVersionsFiltered[reportId] = state.activeVersions[reportId]
    }
  }

  return {
    versions: lightweight,
    activeVersions: activeVersionsFiltered,
  }
}
