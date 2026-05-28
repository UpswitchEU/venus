import { describe, expect, it } from 'vitest'
import {
  BOOTSTRAP_TIMEOUT_USER_MESSAGE,
  SESSION_NOT_READY_USER_MESSAGE,
} from '../bootstrapUserMessages'

describe('bootstrapUserMessages', () => {
  it('exports stable bootstrap timeout copy', () => {
    expect(BOOTSTRAP_TIMEOUT_USER_MESSAGE).toMatch(/try again/i)
    expect(BOOTSTRAP_TIMEOUT_USER_MESSAGE.length).toBeGreaterThan(20)
  })

  it('exports stable session-not-ready copy', () => {
    expect(SESSION_NOT_READY_USER_MESSAGE).toMatch(/initializing/i)
    expect(SESSION_NOT_READY_USER_MESSAGE.length).toBeGreaterThan(20)
  })
})
