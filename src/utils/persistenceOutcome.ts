export interface PersistenceFailure {
  kind: 'temporary' | 'subscription' | 'access' | 'conflict' | 'validation'
  message: string
  status?: number
  code?: string
  canManageBilling?: boolean
  retryAfterMs?: number
}

export type PersistenceOutcome =
  | { status: 'acknowledged' }
  | { status: 'deferred'; failure: PersistenceFailure }
  | { status: 'skipped' }

/** Read transport facts through Axios, fetch, ApplicationError and Nest wrappers. */
export function persistenceFailure(error: unknown): PersistenceFailure {
  const queue: unknown[] = [error]
  const seen = new Set<unknown>()
  let canManageBilling: boolean | undefined
  let status: number | undefined
  let code: string | undefined
  let retryAfterMs: number | undefined
  const message =
    error instanceof Error
      ? error.message
      : error &&
          typeof error === 'object' &&
          'message' in error &&
          typeof error.message === 'string'
        ? error.message
        : 'Changes could not be saved'
  while (queue.length && seen.size < 30) {
    const value = queue.shift()
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    const row = value as Record<string, unknown>
    if (typeof row.canManageBilling === 'boolean') canManageBilling = row.canManageBilling
    const numeric = Number(row.statusCode ?? row.status)
    if (Number.isFinite(numeric) && numeric >= 400 && numeric <= 599) status ??= numeric
    if (typeof row.kind === 'string' && row.kind === 'temporary' && status == null) status = 503
    if (typeof row.code === 'string' && (!code || row.code.startsWith('ADVISORY_'))) code = row.code
    if (typeof row.retryAfterMs === 'number')
      retryAfterMs = Math.max(retryAfterMs ?? 0, row.retryAfterMs)
    if (row.headers && typeof row.headers === 'object') {
      const headers = row.headers as Record<string, unknown>
      const hint = headers['retry-after'] ?? headers['Retry-After']
      if (typeof hint === 'string' || typeof hint === 'number') {
        const seconds = Number(hint)
        const delay = Number.isFinite(seconds)
          ? seconds * 1000
          : Date.parse(String(hint)) - Date.now()
        if (Number.isFinite(delay)) retryAfterMs = Math.max(retryAfterMs ?? 0, delay)
      }
    }
    for (const key of [
      'context',
      'originalError',
      'cause',
      'response',
      'responseData',
      'data',
      'details',
      'error',
      'persistenceOutcome',
      'failure',
    ]) {
      queue.push(row[key])
    }
  }
  const kind: PersistenceFailure['kind'] =
    status === 401 || status === 403
      ? 'access'
      : status === 402 || code === 'ADVISORY_SUBSCRIPTION_REQUIRED'
        ? 'subscription'
        : status === 409
          ? 'conflict'
          : status === 408 ||
              status === 499 ||
              status === 429 ||
              (status != null && status >= 500) ||
              code === 'ADVISORY_VERIFICATION_UNAVAILABLE' ||
              error instanceof TypeError ||
              /network|timeout|timed out|temporarily unavailable|service unavailable|unable to verify your firm subscription|status(?: code)? (?:499|5\d\d)/i.test(
                message
              )
            ? 'temporary'
            : 'validation'
  return { kind, message, status, code, retryAfterMs, canManageBilling }
}

export function requirePersistenceAcknowledgement(outcome: PersistenceOutcome): void {
  if (outcome.status === 'acknowledged') return
  throw Object.assign(
    new Error(
      outcome.status === 'deferred' ? outcome.failure.message : 'Save was not acknowledged'
    ),
    {
      status: outcome.status === 'deferred' ? outcome.failure.status : undefined,
      persistenceOutcome: outcome,
    }
  )
}
