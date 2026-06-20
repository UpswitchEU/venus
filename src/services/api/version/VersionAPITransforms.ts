import type {
  CreateVersionRequest,
  ValuationVersion,
  VersionChanges,
  VersionComparison,
  VersionStatistics,
} from '../../../types/ValuationVersion'
import type { ValuationRequest, ValuationResponse } from '../../../types/valuation'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'

type UnknownRecord = Record<string, unknown>

export interface VersionConversationContext {
  conversation: unknown
  triggerMessage: unknown
  triggerType: string
  context: unknown
}

const EMPTY_CHANGES_SUMMARY: VersionChanges = { totalChanges: 0, significantChanges: [] }

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function nestedRecord(value: UnknownRecord | null | undefined, key: string): UnknownRecord | null {
  return value ? asRecord(value[key]) : null
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value : fallback
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function asNumber(value: unknown, fallback = 0): number {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

function asOptionalNumber(value: unknown): number | undefined {
  const numeric = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(numeric) ? numeric : undefined
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function asDate(value: unknown): Date {
  const date = new Date(asString(value, new Date().toISOString()))
  return Number.isNaN(date.getTime()) ? new Date() : date
}

function asValuationDeltaDirection(value: unknown): 'increase' | 'decrease' | 'unchanged' {
  return value === 'increase' || value === 'decrease' || value === 'unchanged' ? value : 'unchanged'
}

function asVersionChanges(value: unknown): VersionChanges {
  const changes = asRecord(value)
  return changes ? (changes as unknown as VersionChanges) : { ...EMPTY_CHANGES_SUMMARY }
}

function asValuationRequest(value: unknown): ValuationRequest {
  return (asRecord(value) ?? {}) as unknown as ValuationRequest
}

function asValuationResponse(value: unknown): ValuationResponse | null {
  const response = asRecord(value)
  return response ? (response as unknown as ValuationResponse) : null
}

function asHighlights(value: unknown): VersionComparison['highlights'] {
  return Array.isArray(value) ? (value as VersionComparison['highlights']) : []
}

function asMostChangedFields(value: unknown): VersionStatistics['mostChangedFields'] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item) => {
    const field = asRecord(item)
    if (!field) return []

    return [
      {
        field: asString(field.field),
        changeCount: asNumber(field.change_count ?? field.changeCount),
      },
    ]
  })
}

export function buildCreateVersionBackendRequest(request: CreateVersionRequest) {
  return {
    version_label: request.versionLabel,
    form_data: request.formData,
    valuation_result: request.valuationResult,
    html_report: request.htmlReport,
    changes_summary: request.changesSummary,
    notes: request.notes,
    tags: request.tags,
    normalization_data: request.normalization_data,
    tax_latency_data: request.tax_latency_data,
  }
}

export function transformVersionFromBackend(backendVersion: unknown): ValuationVersion {
  const backend = asRecord(backendVersion) ?? {}
  const versionData = nestedRecord(backend, 'version_data') ?? {}
  const outputs = nestedRecord(versionData, 'outputs')
  const outputDetails = nestedRecord(outputs, 'details')
  const versionNumber = asNumber(backend.version_number, 1)
  const formData =
    backend.formData ?? versionData.formData ?? versionData.inputs ?? backend.form_data ?? {}
  const valuationResult =
    backend.valuationResult ?? versionData.valuationResult ?? outputs ?? backend.valuation_result
  const normalizationData =
    asRecord(backend.normalization_data) ?? asRecord(versionData.normalization_data)
  const taxLatencyData = Array.isArray(backend.tax_latency_data)
    ? backend.tax_latency_data
    : Array.isArray(versionData.tax_latency_data)
      ? versionData.tax_latency_data
      : undefined

  return {
    id: asString(backend.id, `version-${versionNumber}`),
    reportId: asString(backend.report_id, asString(backend.reportId)),
    versionNumber,
    versionLabel: asString(backend.version_label, `Version ${versionNumber}`),
    createdAt: asDate(backend.created_at),
    createdBy: asNullableString(backend.created_by) ?? asNullableString(backend.createdBy),
    formData: asValuationRequest(formData),
    valuationResult: asValuationResponse(valuationResult),
    htmlReport:
      getFirstRenderableReportHtml(
        asNullableString(backend.htmlReport),
        asNullableString(versionData.htmlReport),
        asNullableString(outputs?.html_report),
        asNullableString(outputDetails?.html_report),
        asNullableString(backend.html_report)
      ) || null,
    changesSummary: asVersionChanges(backend.changesSummary ?? backend.changes_summary),
    isActive: asBoolean(backend.isActive, asBoolean(backend.is_active)),
    isPinned: asBoolean(backend.isPinned, asBoolean(backend.is_pinned)),
    calculationDuration_ms:
      asOptionalNumber(backend.calculationDuration_ms) ??
      asOptionalNumber(backend.calculation_duration_ms),
    tags: asStringArray(backend.tags),
    notes: asOptionalString(backend.notes),
    normalization_data: normalizationData as ValuationVersion['normalization_data'] | undefined,
    tax_latency_data: taxLatencyData as ValuationVersion['tax_latency_data'] | undefined,
  }
}

export function transformVersionComparison(dataValue: unknown): VersionComparison {
  const data = asRecord(dataValue)
  if (!data) {
    throw new Error('Invalid comparison response')
  }

  const valuationDelta = asRecord(data.valuation_delta)

  return {
    versionA: transformVersionFromBackend(data.version_a),
    versionB: transformVersionFromBackend(data.version_b),
    changes: asVersionChanges(data.changes),
    valuationDelta: valuationDelta
      ? {
          absoluteChange: asNumber(valuationDelta.absolute_change),
          percentChange: asNumber(valuationDelta.percent_change),
          direction: asValuationDeltaDirection(valuationDelta.direction),
        }
      : null,
    highlights: asHighlights(data.highlights),
  }
}

export function transformVersionStatistics(dataValue: unknown): VersionStatistics {
  const data = asRecord(dataValue)
  if (!data) {
    throw new Error('Invalid statistics response')
  }

  const firstVersion = asRecord(data.first_version)
  const latestVersion = asRecord(data.latest_version)

  return {
    totalVersions: asNumber(data.total_versions),
    averageTimeBetweenVersions_hours: asNumber(data.avg_time_between_versions_hours),
    mostChangedFields: asMostChangedFields(data.most_changed_fields),
    averageValuationChange_percent: asNumber(data.avg_valuation_change_percent),
    firstVersion: {
      number: asNumber(firstVersion?.number),
      createdAt: asDate(firstVersion?.created_at),
    },
    latestVersion: {
      number: asNumber(latestVersion?.number),
      createdAt: asDate(latestVersion?.created_at),
    },
  }
}

export function transformVersionConversationContext(
  dataValue: unknown
): VersionConversationContext | null {
  const data = asRecord(dataValue)
  if (!data) return null

  return {
    conversation: data.conversation,
    triggerMessage: data.trigger_message,
    triggerType: asString(data.trigger_type),
    context: data.context,
  }
}
