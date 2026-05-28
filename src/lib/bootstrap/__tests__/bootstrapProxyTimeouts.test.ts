import { describe, expect, it } from 'vitest'
import {
  bootstrapTitanCallTimeoutMs,
  remainingBootstrapRouteBudgetMs,
  VENUS_BOOTSTRAP_BFF_TIMEOUT_MS,
  VENUS_BOOTSTRAP_CLIENT_ABORT_MS,
  VENUS_BOOTSTRAP_ROUTE_BUDGET_MS,
} from '../bootstrapProxyTimeouts'

describe('bootstrapProxyTimeouts', () => {
  it('keeps client abort above BFF timeout', () => {
    expect(VENUS_BOOTSTRAP_CLIENT_ABORT_MS).toBeGreaterThan(VENUS_BOOTSTRAP_BFF_TIMEOUT_MS)
  })

  it('keeps route budget under typical maxDuration (30s)', () => {
    expect(VENUS_BOOTSTRAP_ROUTE_BUDGET_MS).toBeLessThanOrEqual(30_000)
  })

  it('caps Titan call timeout to remaining route budget', () => {
    const start = 1_000
    const now = start + 25_000
    expect(bootstrapTitanCallTimeoutMs(start, now)).toBe(
      Math.min(VENUS_BOOTSTRAP_BFF_TIMEOUT_MS, VENUS_BOOTSTRAP_ROUTE_BUDGET_MS - 25_000)
    )
  })

  it('never returns less than 1s remaining budget', () => {
    const start = 0
    expect(remainingBootstrapRouteBudgetMs(start, 100_000)).toBe(1_000)
  })
})
