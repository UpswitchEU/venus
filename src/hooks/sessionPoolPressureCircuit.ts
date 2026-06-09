/** Base cooldown after the first pool-pressure 503/504 in a burst. */
export const SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS = 8000

/** Cap for exponential backoff (8s → 16s → 32s). */
export const SESSION_POOL_PRESSURE_MAX_COOLDOWN_MS = 32_000

/** @deprecated Use SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS — kept for tests. */
export const SESSION_POOL_PRESSURE_COOLDOWN_MS = SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS

/** Minimum spacing between successful session PATCH autosaves after recovery. */
export const SESSION_AUTOSAVE_MIN_INTERVAL_MS = 3000

let circuitOpenUntil = 0
let consecutiveFailures = 0
let lastSuccessfulPatchAt = 0

export function isUpstreamPoolPressureHttpStatus(status: number | undefined | null): boolean {
  return status === 503 || status === 504
}

export function parseRetryAfterMs(retryAfter: string | undefined | null, now = Date.now()): number | undefined {
  if (!retryAfter?.trim()) {
    return undefined
  }
  const trimmed = retryAfter.trim()
  const asSeconds = Number(trimmed)
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.ceil(asSeconds * 1000)
  }
  const asDate = Date.parse(trimmed)
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - now)
  }
  return undefined
}

function readRetryAfterHeader(headers: Record<string, unknown> | undefined, now: number): number | undefined {
  if (!headers) {
    return undefined
  }
  for (const key of ['retry-after', 'Retry-After']) {
    const raw = headers[key]
    if (typeof raw === 'string') {
      return parseRetryAfterMs(raw, now)
    }
    if (Array.isArray(raw) && typeof raw[0] === 'string') {
      return parseRetryAfterMs(raw[0], now)
    }
  }
  return undefined
}

/** Record pool-pressure cooldown from a failed session HTTP response (503/504). */
export function recordSessionPoolPressureFromHttpError(error: unknown, now = Date.now()): void {
  const response = (error as { response?: { status?: number; headers?: Record<string, unknown> } })
    .response
  const status = response?.status
  if (!isUpstreamPoolPressureHttpStatus(status)) {
    return
  }
  recordSessionPoolPressure503(now, readRetryAfterHeader(response?.headers, now))
}

export function recordSessionPoolPressure503(now = Date.now(), retryAfterMs?: number): void {
  consecutiveFailures = Math.min(consecutiveFailures + 1, 6)
  const exponential =
    SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS * 2 ** Math.max(0, consecutiveFailures - 1)
  const backoffMs = Math.min(exponential, SESSION_POOL_PRESSURE_MAX_COOLDOWN_MS)
  const cooldownMs = Math.max(backoffMs, retryAfterMs ?? 0)
  circuitOpenUntil = Math.max(circuitOpenUntil, now + cooldownMs)
}

export function recordSuccessfulSessionPatch(now = Date.now()): void {
  consecutiveFailures = 0
  lastSuccessfulPatchAt = now
}

export function getSessionPatchThrottleRemainingMs(now = Date.now()): number {
  if (lastSuccessfulPatchAt <= 0) {
    return 0
  }
  return Math.max(0, SESSION_AUTOSAVE_MIN_INTERVAL_MS - (now - lastSuccessfulPatchAt))
}

export function isSessionPoolPressureCircuitOpen(now = Date.now()): boolean {
  return now < circuitOpenUntil
}

export function getSessionPoolPressureCooldownRemainingMs(now = Date.now()): number {
  return Math.max(0, circuitOpenUntil - now)
}

export type SessionPoolPressureGateOptions = {
  /** Abort waiting when this returns false (e.g. session unmounted). */
  shouldContinue?: () => boolean
  /** Max total wait before giving up; omit to wait until the gate opens. */
  maxWaitMs?: number
  onWait?: (waitMs: number) => void
}

/** Wait until pool-pressure cooldown and post-success throttle both allow a PATCH. */
export async function awaitSessionPoolPressureGate(
  options?: SessionPoolPressureGateOptions
): Promise<boolean> {
  const deadline =
    options?.maxWaitMs != null ? Date.now() + options.maxWaitMs : Number.POSITIVE_INFINITY

  for (;;) {
    if (options?.shouldContinue && !options.shouldContinue()) {
      return false
    }
    if (!isSessionPoolPressureCircuitOpen() && getSessionPatchThrottleRemainingMs() <= 0) {
      return true
    }
    if (Date.now() >= deadline) {
      return false
    }
    const waitMs = Math.min(
      Math.max(
        getSessionPoolPressureCooldownRemainingMs(),
        getSessionPatchThrottleRemainingMs(),
        250
      ),
      deadline - Date.now()
    )
    options?.onWait?.(waitMs)
    await new Promise((resolve) => setTimeout(resolve, waitMs))
  }
}

export function resetSessionPoolPressureCircuitForTests(): void {
  circuitOpenUntil = 0
  consecutiveFailures = 0
  lastSuccessfulPatchAt = 0
}
