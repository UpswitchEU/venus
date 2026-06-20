function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function coerceStatus(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return /^\d{3}$/.test(trimmed) ? Number(trimmed) : undefined
}

function readNumericStatus(value: unknown, seen = new Set<unknown>()): number | undefined {
  const record = asRecord(value)
  if (!record || seen.has(value)) return undefined
  seen.add(value)

  const directStatus = record.status ?? record.statusCode
  const directNumericStatus = coerceStatus(directStatus)
  if (directNumericStatus !== undefined) return directNumericStatus

  const response = asRecord(record.response)
  const responseStatus = coerceStatus(response?.status)
  if (responseStatus !== undefined) return responseStatus

  const context = asRecord(record.context)
  const contextStatus = coerceStatus(context?.statusCode ?? context?.status)
  if (contextStatus !== undefined) return contextStatus

  const nestedStatus = readNumericStatus(context?.originalError, seen)
  if (nestedStatus !== undefined) return nestedStatus

  return readNumericStatus(response?.data, seen)
}

function collectErrorText(value: unknown, seen = new Set<unknown>()): string {
  if (typeof value === 'string') return value
  const record = asRecord(value)
  if (!record || seen.has(value)) return ''
  seen.add(value)

  const parts = [
    typeof record.name === 'string' ? record.name : undefined,
    typeof record.code === 'string' ? record.code : undefined,
    typeof record.message === 'string' ? record.message : undefined,
  ]

  const response = asRecord(record.response)
  const responseData = response?.data
  const responseRecord = asRecord(responseData)
  parts.push(typeof responseData === 'string' ? responseData : undefined)
  parts.push(typeof responseRecord?.message === 'string' ? responseRecord.message : undefined)
  parts.push(typeof responseRecord?.error === 'string' ? responseRecord.error : undefined)

  const context = asRecord(record.context)
  parts.push(typeof context?.code === 'string' ? context.code : undefined)
  parts.push(collectErrorText(context?.originalError, seen))

  return parts.filter(Boolean).join(' ')
}

function readRetryableStatusFromText(text: string): number | undefined {
  const statusMatch = text.match(/\b(?:status(?:\s+code)?|http)\s*:?\s*(408|429|499|5\d{2})\b/i)
  if (statusMatch?.[1]) return Number(statusMatch[1])

  const namedStatusMatch = text.match(
    /\b(408|429|499|5\d{2})\s+(?:request timeout|too many requests|client closed request|service unavailable|server error|internal server error|bad gateway|gateway timeout)\b/i
  )
  return namedStatusMatch?.[1] ? Number(namedStatusMatch[1]) : undefined
}

export function isRetryableSessionSaveError(error: unknown): boolean {
  const status = readNumericStatus(error)
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 409) {
    return false
  }
  // Pool-pressure / BFF timeout - client retry storms make recovery slower.
  if (status === 503 || status === 504) {
    return false
  }
  if (
    status === 408 ||
    status === 429 ||
    status === 499 ||
    (status !== undefined && status >= 500 && status < 600)
  ) {
    return true
  }

  if (error instanceof TypeError) return true

  const text = collectErrorText(error).toLowerCase()
  if (
    text.includes('authentication required') ||
    text.includes('unauthorized') ||
    text.includes('forbidden') ||
    text.includes('invalid authentication token')
  ) {
    return false
  }

  const textStatus = readRetryableStatusFromText(text)
  if (textStatus !== undefined) {
    if (textStatus === 503 || textStatus === 504) return false
    return true
  }

  if (/\bstatus code 503\b/i.test(text) || /\bstatus code 504\b/i.test(text)) {
    return false
  }

  if (
    text.includes('database temporarily unavailable') ||
    text.includes('database pool pressure') ||
    text.includes('session patch deferred')
  ) {
    return false
  }

  return (
    text.includes('fetch') ||
    text.includes('network') ||
    text.includes('econnrefused') ||
    text.includes('econnreset') ||
    text.includes('etimedout') ||
    text.includes('aborterror') ||
    text.includes('aborted') ||
    text.includes('canceled') ||
    text.includes('cancelled') ||
    text.includes('timeout') ||
    text.includes('timed out') ||
    text.includes('did not respond in time') ||
    text.includes('upstream_timeout') ||
    text.includes('server error') ||
    text.includes('bad gateway') ||
    text.includes('gateway timeout')
  )
}
