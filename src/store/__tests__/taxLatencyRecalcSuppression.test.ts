/**
 * Unit tests for the latency recalc-suppression contract.
 *
 * The ManualLayout subscription drives auto-recalc on tax-latency changes, but
 * programmatic mutations (version restore, session hydration) need to bypass
 * that recalc. The contract is:
 *
 *  - `suppressNextLatencyRecalc(N)` queues N skips for the upcoming subscriber
 *    notifications.
 *  - `consumeLatencyRecalcSuppression()` is called by the subscriber on EVERY
 *    notification; it returns true (and decrements) when a skip was queued.
 *  - `resetLatencyRecalcSuppression()` clears the queue, called by the
 *    subscription effect on mount so pre-mount bumps don't leak into the first
 *    real user edit observed by the fresh subscriber.
 *
 * These helpers are co-located with the store but their behaviour is the
 * subtle, hard-to-debug part of the latency-edit auto-recalc loop, so they get
 * dedicated coverage.
 */

import { afterEach, describe, expect, it } from 'vitest'
import {
  consumeLatencyRecalcSuppression,
  resetLatencyRecalcSuppression,
  suppressNextLatencyRecalc,
} from '../useTaxLatencyStore'

describe('latency recalc suppression contract', () => {
  afterEach(() => {
    resetLatencyRecalcSuppression()
  })

  it('returns false when no suppression has been queued', () => {
    expect(consumeLatencyRecalcSuppression()).toBe(false)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })

  it('decrements one skip per consume call', () => {
    suppressNextLatencyRecalc(1)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })

  it('queues multiple skips when a single restore performs N mutations', () => {
    suppressNextLatencyRecalc(3)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })

  it('clamps negative counts to zero (suppressNextLatencyRecalc(-5) is a no-op)', () => {
    suppressNextLatencyRecalc(-5)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })

  it('drops every queued skip on reset (used by the subscription on mount)', () => {
    suppressNextLatencyRecalc(2)
    resetLatencyRecalcSuppression()
    expect(consumeLatencyRecalcSuppression()).toBe(false)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })

  it('accumulates additive bumps across multiple suppressNext calls', () => {
    suppressNextLatencyRecalc()
    suppressNextLatencyRecalc()
    suppressNextLatencyRecalc()
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(true)
    expect(consumeLatencyRecalcSuppression()).toBe(false)
  })
})
