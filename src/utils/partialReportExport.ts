import { parseIndicativeExportRequest, reportRecord } from './indicativeReportExport'

export type PartialExportRequest = {
  expected_content_sha256: string
  expected_updated_at: string
  language: 'en' | 'nl' | 'fr'
  include_pdf: boolean
}

export function parsePartialExportRequest(value: unknown): PartialExportRequest {
  const body = reportRecord(value)
  if (
    Object.keys(body).some(
      (key) =>
        !['expected_content_sha256', 'expected_updated_at', 'language', 'include_pdf'].includes(key)
    )
  )
    throw new Error('Unexpected partial export field')
  const checked = parseIndicativeExportRequest({
    expected_run_hash: body.expected_content_sha256,
    expected_updated_at: body.expected_updated_at,
    language: body.language,
    include_pdf: body.include_pdf,
  })
  return {
    expected_content_sha256: checked.expected_run_hash,
    expected_updated_at: checked.expected_updated_at,
    language: checked.language,
    include_pdf: checked.include_pdf,
  }
}

export function savedPartialAssessment(report: unknown): Record<string, unknown> | null {
  const envelope = reportRecord(report)
  const saved = Object.keys(reportRecord(envelope.data)).length
    ? reportRecord(envelope.data)
    : envelope
  const result = reportRecord(saved.valuation_result)
  const value = saved.partial_valuation ?? result.partial_valuation
  if (value == null) {
    if (
      saved.valuation_method === 'partial_assessment' ||
      result.schema_version === 'persisted_partial_assessment.v1'
    )
      throw new Error('Saved partial assessment is missing. Reload before exporting.')
    return null
  }
  const assessment = reportRecord(value)
  if (
    !['partial_valuation.v1', 'partial_valuation.v2', 'partial_valuation.v3'].includes(String(assessment.schema_version)) ||
    assessment.advisor_acceptance_required !== false ||
    assessment.private_save_allowed !== true ||
    typeof assessment.content_sha256 !== 'string' ||
    !/^[0-9a-f]{64}$/.test(assessment.content_sha256)
  )
    throw new Error('Saved partial assessment identity is incomplete.')
  return assessment
}

export function savedPartialExportRequest(
  report: unknown,
  language: string,
  includePdf = true
): PartialExportRequest | null {
  const assessment = savedPartialAssessment(report)
  if (!assessment) return null
  const envelope = reportRecord(report)
  const saved = Object.keys(reportRecord(envelope.data)).length
    ? reportRecord(envelope.data)
    : envelope
  return parsePartialExportRequest({
    expected_content_sha256: assessment.content_sha256,
    expected_updated_at: saved.updated_at,
    language,
    include_pdf: includePdf,
  })
}
