import type { AxiosRequestConfig } from 'axios'
import { apiLogger } from '../../utils/logger'
import { getRenderableReportHtml } from '../../utils/safetyNetReportHtml'

type UnknownRecord = Record<string, unknown>

export type HttpResponseDataExtraction = {
  nestedData: unknown
  responseData: unknown
}

export type ValuationResponseEndpointKind = 'calculate' | 'session'

export type ValuationResponseDiagnosticSnapshot = {
  endpointType: ValuationResponseEndpointKind
  extractedDataKeys: string[]
  extractedDataType: string
  extractionMethod: 'direct' | 'nested'
  hasExtractedData: boolean
  hasHtmlReport: boolean
  hasNestedData: boolean
  hasPdfUrl: boolean
  hasRawData: boolean
  htmlReportLength: number
  htmlReportPreview: string
  htmlReportType: string
  method: string | undefined
  nestedDataKeys: string[]
  rawDataKeys: string[]
  rawDataType: string
  url: string | undefined
}

function isUnknownRecord(value: unknown): value is UnknownRecord {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function getRecordValue(value: unknown, key: string): unknown {
  return isUnknownRecord(value) ? value[key] : undefined
}

function getStringRecordValue(value: unknown, key: string): string | undefined {
  const field = getRecordValue(value, key)
  return typeof field === 'string' ? field : undefined
}

function getObjectKeys(value: unknown): string[] {
  return isUnknownRecord(value) ? Object.keys(value) : []
}

export function extractHttpResponseData(rawData: unknown): HttpResponseDataExtraction {
  const nestedData = getRecordValue(rawData, 'data')
  return {
    nestedData,
    responseData: nestedData || rawData,
  }
}

export function classifyValuationResponseEndpoint(
  config: Pick<AxiosRequestConfig, 'method' | 'url'>
): ValuationResponseEndpointKind | null {
  const method = config.method?.toUpperCase()
  const isPutResultEndpoint = config.url?.includes('/result') && method === 'PUT'

  if (config.url?.includes('/valuations/calculate') && method === 'POST') {
    return 'calculate'
  }

  if (config.url?.includes('/valuation-sessions/') && !isPutResultEndpoint) {
    return 'session'
  }

  return null
}

export function buildValuationResponseDiagnosticSnapshot({
  config,
  nestedData,
  rawData,
  responseData,
}: {
  config: Pick<AxiosRequestConfig, 'method' | 'url'>
  nestedData: unknown
  rawData: unknown
  responseData: unknown
}): ValuationResponseDiagnosticSnapshot | null {
  const endpointType = classifyValuationResponseEndpoint(config)
  if (!endpointType) return null

  const htmlReport = getStringRecordValue(responseData, 'html_report')

  return {
    endpointType,
    extractedDataKeys: getObjectKeys(responseData),
    extractedDataType: typeof responseData,
    extractionMethod: nestedData ? 'nested' : 'direct',
    hasExtractedData: !!responseData,
    hasHtmlReport: !!htmlReport,
    hasNestedData: !!nestedData,
    hasPdfUrl: !!getRecordValue(responseData, 'pdf_url'),
    hasRawData: !!rawData,
    htmlReportLength: htmlReport?.length || 0,
    htmlReportPreview: htmlReport?.substring(0, 200) || 'N/A',
    htmlReportType: typeof getRecordValue(responseData, 'html_report'),
    method: config.method,
    nestedDataKeys: getObjectKeys(nestedData),
    rawDataKeys: getObjectKeys(rawData),
    rawDataType: typeof rawData,
    url: config.url,
  }
}

export function logValuationResponseDiagnostics({
  config,
  nestedData,
  rawData,
  responseData,
}: {
  config: Pick<AxiosRequestConfig, 'method' | 'url'>
  nestedData: unknown
  rawData: unknown
  responseData: unknown
}): void {
  const snapshot = buildValuationResponseDiagnosticSnapshot({
    config,
    nestedData,
    rawData,
    responseData,
  })
  if (!snapshot) return

  apiLogger.info('DIAGNOSTIC: Valuation response received', snapshot)

  if (snapshot.endpointType !== 'calculate') return

  const renderableHtmlReport = getRenderableReportHtml(
    getStringRecordValue(responseData, 'html_report')
  )
  if (!renderableHtmlReport) {
    apiLogger.error('CRITICAL: html_report missing or empty in valuation response', {
      url: config.url,
      hasExtractedData: !!responseData,
      extractedDataKeys: snapshot.extractedDataKeys,
      rawResponseSample: JSON.stringify(rawData).substring(0, 1000),
      note: 'POST /calculate endpoints should always return HTML reports',
    })
    return
  }

  apiLogger.info('SUCCESS: html_report found in valuation response', {
    url: config.url,
    htmlReportLength: renderableHtmlReport.length,
    htmlReportPreview: renderableHtmlReport.substring(0, 200),
  })
}
