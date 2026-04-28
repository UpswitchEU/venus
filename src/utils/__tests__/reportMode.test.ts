import { describe, expect, it } from 'vitest'
import {
  isMercuryAdvisorModeParam,
  MERCURY_ADVISOR_URL_MODE,
  parseReportModeForInitialUi,
  parseReportModeSearchParam,
} from '../reportMode'

describe('reportMode', () => {
  it('parses only edit and view as UI modes', () => {
    expect(parseReportModeSearchParam('edit')).toBe('edit')
    expect(parseReportModeSearchParam('view')).toBe('view')
    expect(parseReportModeSearchParam('accountant')).toBeUndefined()
    expect(parseReportModeSearchParam(undefined)).toBeUndefined()
    expect(parseReportModeSearchParam('')).toBeUndefined()
    expect(parseReportModeSearchParam('bogus')).toBeUndefined()
    expect(parseReportModeSearchParam('  view  ')).toBe('view')
  })

  it('defaults initial UI to edit for advisor and unknown modes', () => {
    expect(parseReportModeForInitialUi('accountant')).toBe('edit')
    expect(parseReportModeForInitialUi(undefined)).toBe('edit')
    expect(parseReportModeForInitialUi('view')).toBe('view')
  })

  it('exposes Mercury advisor param constant', () => {
    expect(MERCURY_ADVISOR_URL_MODE).toBe('accountant')
    expect(isMercuryAdvisorModeParam('accountant')).toBe(true)
    expect(isMercuryAdvisorModeParam(' edit ')).toBe(false)
  })
})
