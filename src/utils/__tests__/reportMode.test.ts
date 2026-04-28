import { describe, expect, it } from 'vitest'
import {
  isMercuryAdvisorModeParam,
  MERCURY_ADVISOR_URL_MODE,
  MERCURY_SELLER_EMBED_URL_MODE,
  parseReportModeForInitialUi,
  parseReportModeSearchParam,
  shouldPreserveMercuryEmbedMode,
} from '../reportMode'

describe('reportMode', () => {
  it('parses only edit and view as UI modes', () => {
    expect(parseReportModeSearchParam('edit')).toBe('edit')
    expect(parseReportModeSearchParam('view')).toBe('view')
    expect(parseReportModeSearchParam('accountant')).toBeUndefined()
    expect(parseReportModeSearchParam('seller')).toBeUndefined()
    expect(parseReportModeSearchParam(undefined)).toBeUndefined()
    expect(parseReportModeSearchParam('')).toBeUndefined()
    expect(parseReportModeSearchParam('bogus')).toBeUndefined()
    expect(parseReportModeSearchParam('  view  ')).toBe('view')
  })

  it('defaults initial UI to edit for mercury persona and unknown modes', () => {
    expect(parseReportModeForInitialUi('accountant')).toBe('edit')
    expect(parseReportModeForInitialUi('seller')).toBe('edit')
    expect(parseReportModeForInitialUi(undefined)).toBe('edit')
    expect(parseReportModeForInitialUi('view')).toBe('view')
  })

  it('preserves Mercury embed persona values when collapsing UI edit', () => {
    expect(shouldPreserveMercuryEmbedMode('accountant')).toBe(true)
    expect(shouldPreserveMercuryEmbedMode('seller')).toBe(true)
    expect(shouldPreserveMercuryEmbedMode('')).toBe(false)
    expect(shouldPreserveMercuryEmbedMode(undefined)).toBe(false)
    expect(shouldPreserveMercuryEmbedMode('edit')).toBe(false)
    expect(shouldPreserveMercuryEmbedMode(' view ')).toBe(false)
  })

  it('exposes Mercury param constants aligned with iframe + redirect callers', () => {
    expect(MERCURY_ADVISOR_URL_MODE).toBe('accountant')
    expect(MERCURY_SELLER_EMBED_URL_MODE).toBe('seller')
    expect(isMercuryAdvisorModeParam('accountant')).toBe(true)
    expect(isMercuryAdvisorModeParam(' edit ')).toBe(false)
  })
})
