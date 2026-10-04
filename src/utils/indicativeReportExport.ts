type RecordValue = Record<string, unknown>

export function reportRecord(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : {}
}

export type IndicativeExportRequest = {
  expected_run_hash: string
  expected_updated_at: string
  language: 'en' | 'nl' | 'fr'
  include_pdf: boolean
}

export function parseIndicativeExportRequest(value: unknown): IndicativeExportRequest {
  const body = reportRecord(value)
  if (
    Object.keys(body).some(
      (key) =>
        !['expected_run_hash', 'expected_updated_at', 'language', 'include_pdf'].includes(key)
    ) ||
    typeof body.expected_run_hash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(body.expected_run_hash) ||
    typeof body.expected_updated_at !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(body.expected_updated_at) ||
    !Number.isFinite(Date.parse(body.expected_updated_at)) ||
    !['en', 'nl', 'fr'].includes(String(body.language)) ||
    typeof body.include_pdf !== 'boolean'
  ) {
    throw new Error(
      'A saved calculation hash, exact report revision and supported language are required.'
    )
  }
  if (
    new Date(body.expected_updated_at as string).toISOString().slice(0, 19) !==
    (body.expected_updated_at as string).slice(0, 19)
  )
    throw new Error('Invalid saved report revision date.')
  return body as IndicativeExportRequest
}

export function savedIndicativeRun(report: unknown): RecordValue | null {
  const envelope = reportRecord(report)
  const saved = Object.keys(reportRecord(envelope.data)).length
    ? reportRecord(envelope.data)
    : envelope
  const result = reportRecord(saved.valuation_result)
  const direct = reportRecord(result.valuation_run)
  const nested = reportRecord(reportRecord(result.details).valuation_run)
  const run = Object.keys(direct).length ? direct : nested
  if (run.schema_version !== 'valuation_run.v2') return null
  // An attested/defensible report continues through its existing formal lane.
  const tier = reportRecord(run.response_snapshot).data_tier ?? result.data_tier ?? saved.data_tier
  if (tier !== 'indicative') return null
  if (
    Object.keys(direct).length &&
    Object.keys(nested).length &&
    direct.run_hash !== nested.run_hash
  ) {
    throw new Error('Saved calculation identities conflict. Reload before exporting.')
  }
  return run
}

export function savedIndicativeExportRequest(
  report: unknown,
  language: string,
  includePdf = true
): IndicativeExportRequest | null {
  const run = savedIndicativeRun(report)
  if (!run) return null
  const envelope = reportRecord(report)
  const saved = Object.keys(reportRecord(envelope.data)).length
    ? reportRecord(envelope.data)
    : envelope
  // Never use a session timestamp, calculation time, or the browser clock here.
  return parseIndicativeExportRequest({
    expected_run_hash: run.run_hash,
    expected_updated_at: saved.updated_at,
    language,
    include_pdf: includePdf,
  })
}
