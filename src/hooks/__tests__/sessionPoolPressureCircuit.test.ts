import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest'
import {
  awaitSessionPoolPressureGate,
  getSessionPatchThrottleRemainingMs,
  getSessionPoolPressureCooldownRemainingMs,
  isSessionPoolPressureCircuitOpen,
  isUpstreamPoolPressureHttpStatus,
  parseRetryAfterMs,
  recordSessionPoolPressure503,
  recordSessionPoolPressureFromHttpError,
  recordSuccessfulSessionPatch,
  resetSessionPoolPressureCircuitForTests,
  SESSION_AUTOSAVE_MIN_INTERVAL_MS,
  SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS,
  SESSION_POOL_PRESSURE_MAX_COOLDOWN_MS,
} from '../sessionPoolPressureCircuit'

describe('sessionPoolPressureCircuit', () => {
  beforeEach(() => {
    resetSessionPoolPressureCircuitForTests()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('identifies upstream pool-pressure HTTP statuses', () => {
    expect(isUpstreamPoolPressureHttpStatus(503)).toBe(true)
    expect(isUpstreamPoolPressureHttpStatus(504)).toBe(true)
    expect(isUpstreamPoolPressureHttpStatus(502)).toBe(false)
    expect(isUpstreamPoolPressureHttpStatus(undefined)).toBe(false)
  })

  it('opens the circuit on 503 and closes after base cooldown', () => {
    const now = 1_000_000
    recordSessionPoolPressure503(now)
    expect(isSessionPoolPressureCircuitOpen(now)).toBe(true)
    expect(getSessionPoolPressureCooldownRemainingMs(now + 1)).toBe(
      SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS - 1
    )
    expect(isSessionPoolPressureCircuitOpen(now + SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS)).toBe(
      false
    )
  })

  it('uses exponential backoff on consecutive failures', () => {
    const now = 0
    recordSessionPoolPressure503(now)
    expect(getSessionPoolPressureCooldownRemainingMs(now)).toBe(
      SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS
    )

    recordSessionPoolPressure503(now + 100)
    expect(getSessionPoolPressureCooldownRemainingMs(now + 100)).toBe(
      SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS * 2
    )

    recordSessionPoolPressure503(now + 200)
    recordSessionPoolPressure503(now + 300)
    expect(getSessionPoolPressureCooldownRemainingMs(now + 300)).toBe(
      SESSION_POOL_PRESSURE_MAX_COOLDOWN_MS
    )
  })

  it('respects Retry-After header when longer than backoff', () => {
    const now = 5_000
    recordSessionPoolPressure503(now, 20_000)
    expect(getSessionPoolPressureCooldownRemainingMs(now)).toBe(20_000)
  })

  it('records pool pressure from HTTP 503/504 errors only', () => {
    const now = 10_000
    recordSessionPoolPressureFromHttpError(
      { response: { status: 502, headers: {} } },
      now
    )
    expect(isSessionPoolPressureCircuitOpen(now)).toBe(false)

    recordSessionPoolPressureFromHttpError(
      { response: { status: 503, headers: { 'retry-after': '5' } } },
      now
    )
    expect(isSessionPoolPressureCircuitOpen(now)).toBe(true)
    // Retry-After shorter than base exponential backoff — base 8s wins.
    expect(getSessionPoolPressureCooldownRemainingMs(now)).toBe(
      SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS
    )
  })

  it('throttles autosaves after a successful patch', () => {
    const now = 100_000
    recordSuccessfulSessionPatch(now)
    expect(getSessionPatchThrottleRemainingMs(now)).toBe(SESSION_AUTOSAVE_MIN_INTERVAL_MS)
    expect(getSessionPatchThrottleRemainingMs(now + SESSION_AUTOSAVE_MIN_INTERVAL_MS)).toBe(0)
  })

  it('resets failure count after successful patch', () => {
    const now = 0
    recordSessionPoolPressure503(now)
    recordSessionPoolPressure503(now + 1)
    recordSuccessfulSessionPatch(now + 2)
    const afterPriorCooldown = now + 1 + SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS * 2 + 1
    recordSessionPoolPressure503(afterPriorCooldown)
    expect(getSessionPoolPressureCooldownRemainingMs(afterPriorCooldown)).toBe(
      SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS
    )
  })

  it('parseRetryAfterMs handles seconds and HTTP dates', () => {
    const now = 1_000_000
    expect(parseRetryAfterMs('3', now)).toBe(3000)
    expect(parseRetryAfterMs('7.5', now)).toBe(7500)
  })

  it('awaitSessionPoolPressureGate resolves immediately when circuit is closed', async () => {
    const gate = awaitSessionPoolPressureGate()
    await expect(gate).resolves.toBe(true)
  })

  it('awaitSessionPoolPressureGate waits until cooldown expires', async () => {
    vi.setSystemTime(0)
    recordSessionPoolPressure503(0)
    const onWait = vi.fn()
    const gatePromise = awaitSessionPoolPressureGate({ onWait })

    await vi.advanceTimersByTimeAsync(SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS)
    await expect(gatePromise).resolves.toBe(true)
    expect(onWait).toHaveBeenCalled()
    expect(isSessionPoolPressureCircuitOpen(SESSION_POOL_PRESSURE_BASE_COOLDOWN_MS)).toBe(false)
  })

  it('awaitSessionPoolPressureGate respects post-success throttle', async () => {
    vi.setSystemTime(100_000)
    recordSuccessfulSessionPatch(100_000)
    const gatePromise = awaitSessionPoolPressureGate()

    await vi.advanceTimersByTimeAsync(SESSION_AUTOSAVE_MIN_INTERVAL_MS)
    await expect(gatePromise).resolves.toBe(true)
    expect(getSessionPatchThrottleRemainingMs(100_000 + SESSION_AUTOSAVE_MIN_INTERVAL_MS)).toBe(0)
  })

  it('awaitSessionPoolPressureGate aborts when shouldContinue returns false', async () => {
    vi.setSystemTime(0)
    recordSessionPoolPressure503(0)
    const gatePromise = awaitSessionPoolPressureGate({
      shouldContinue: () => false,
    })
    await expect(gatePromise).resolves.toBe(false)
  })

  it('awaitSessionPoolPressureGate returns false when maxWaitMs elapses', async () => {
    vi.setSystemTime(0)
    recordSessionPoolPressure503(0)
    const gatePromise = awaitSessionPoolPressureGate({ maxWaitMs: 500 })
    await vi.advanceTimersByTimeAsync(500)
    await expect(gatePromise).resolves.toBe(false)
  })
})
