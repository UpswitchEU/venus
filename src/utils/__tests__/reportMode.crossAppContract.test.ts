/**
 * Locks Mercury redirect URL semantics to Venus advisor-mode parsing.
 *
 * Calculator / modal surfaces use string literals `'accountant'`. Embedded iframe passes
 * `mode` as `accountant` | `seller` from runtime props (`VenusEmbeddedModal`).
 */

import { describe, expect, it } from 'vitest'
import {
  isMercuryAdvisorModeParam,
  MERCURY_ADVISOR_URL_MODE,
  MERCURY_SELLER_EMBED_URL_MODE,
  parseReportModeSearchParam,
  shouldPreserveMercuryEmbedMode,
} from '../reportMode'

describe('reportMode Mercury → Venus advisor URL contract', () => {
  it('keeps the advisor handoff marker distinct from edit/view UI state', () => {
    expect(MERCURY_ADVISOR_URL_MODE).toBe('accountant')
    expect(isMercuryAdvisorModeParam(MERCURY_ADVISOR_URL_MODE)).toBe(true)
    expect(shouldPreserveMercuryEmbedMode(MERCURY_ADVISOR_URL_MODE)).toBe(true)
    expect(parseReportModeSearchParam(MERCURY_ADVISOR_URL_MODE)).toBeUndefined()
  })

  it('keeps seller embedding distinct from advisor and UI modes', () => {
    expect(MERCURY_SELLER_EMBED_URL_MODE).toBe('seller')
    expect(isMercuryAdvisorModeParam(MERCURY_SELLER_EMBED_URL_MODE)).toBe(false)
    expect(shouldPreserveMercuryEmbedMode(MERCURY_SELLER_EMBED_URL_MODE)).toBe(true)
    expect(parseReportModeSearchParam(MERCURY_SELLER_EMBED_URL_MODE)).toBeUndefined()
  })
})
