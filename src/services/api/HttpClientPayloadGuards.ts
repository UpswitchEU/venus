import type { AxiosRequestConfig } from 'axios'

type UnknownRecord = Record<string, unknown>

export const VALUATION_RESULT_HTML_OMIT_BYTES = 10 * 1024 * 1024

const VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS = [
  'htmlReport',
  'html_report',
  '_htmlReport',
  'pdfHtmlReport',
  'pdf_html_report',
  '_pdfHtmlReport',
  'pdfHtml',
  'reportHtml',
] as const

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function isValuationResultSaveConfig(config: AxiosRequestConfig): boolean {
  const method = String(config.method ?? '').toUpperCase()
  const url = String(config.url ?? '')
  return method === 'PUT' && url.includes('/api/v2/valuations/sessions/') && url.includes('/result')
}

export function getConfigReportBlobLengths(config: AxiosRequestConfig): Record<string, number> {
  const data = config.data
  if (!isUnknownRecord(data)) {
    return {}
  }

  const lengths: Record<string, number> = {}
  for (const key of VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS) {
    const value = data[key]
    if (typeof value === 'string' && value.length > 0) {
      lengths[key] = value.length
    }
  }
  return lengths
}

function hasConfigReportBlobs(config: AxiosRequestConfig): boolean {
  return Object.keys(getConfigReportBlobLengths(config)).length > 0
}

function estimateJsonByteLength(value: unknown): number {
  try {
    const serialized = JSON.stringify(value)
    if (!serialized) {
      return 0
    }
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(serialized).byteLength
    }
    return serialized.length
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

/**
 * Break down a valuation-result PUT body by top-level field so oversized request
 * logs identify the bloater, including object-shaped fields such as sessionData.
 */
export function getConfigBodyFieldByteLengths(config: AxiosRequestConfig): Record<string, number> {
  const data = config.data
  if (!isUnknownRecord(data)) {
    return {}
  }

  const lengths: Record<string, number> = {}
  for (const key of Object.keys(data)) {
    if (data[key] === undefined) continue
    lengths[key] = estimateJsonByteLength(data[key])
  }
  return lengths
}

export function withoutConfigReportBlobs(config: AxiosRequestConfig): AxiosRequestConfig | null {
  if (!isValuationResultSaveConfig(config) || !hasConfigReportBlobs(config)) {
    return null
  }

  const data = { ...(config.data as UnknownRecord) }
  for (const key of VALUATION_RESULT_TOP_LEVEL_BLOB_KEYS) {
    if (typeof data[key] === 'string') {
      data[key] = undefined
    }
  }

  return {
    ...config,
    data,
  }
}

export function omitOversizedValuationResultReportBlobs(config: AxiosRequestConfig): {
  config: AxiosRequestConfig
  estimatedBodyBytes?: number
  omitted: boolean
} {
  if (!isValuationResultSaveConfig(config) || !hasConfigReportBlobs(config)) {
    return { config, omitted: false }
  }

  const estimatedBodyBytes = estimateJsonByteLength(config.data)
  if (estimatedBodyBytes <= VALUATION_RESULT_HTML_OMIT_BYTES) {
    return { config, estimatedBodyBytes, omitted: false }
  }

  return {
    config: withoutConfigReportBlobs(config) ?? config,
    estimatedBodyBytes,
    omitted: true,
  }
}
