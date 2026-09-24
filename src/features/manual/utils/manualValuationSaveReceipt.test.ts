import { afterEach, describe, expect, it } from 'vitest'
import type { SaveValuationResultResponse } from '@/types/api-responses'
import { rememberSavedReportAlias } from '@/utils/reportIdentityPromotion'
import {
  recordManualValuationSaved,
  resetManualValuationSaveReceiptsForTests,
  wasManualValuationSavedThisVisit,
} from './manualValuationSaveReceipt'

const SESSION_KEY = 'val_receipt12345'
const REPORT_UUID = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b'

function rememberAlias() {
  rememberSavedReportAlias({
    previousId: SESSION_KEY,
    response: { reportId: REPORT_UUID, sessionKey: SESSION_KEY } as SaveValuationResultResponse,
  })
}

describe('manualValuationSaveReceipt', () => {
  afterEach(() => {
    resetManualValuationSaveReceiptsForTests()
    window.localStorage.clear()
  })

  it('is empty until a save is recorded', () => {
    expect(wasManualValuationSavedThisVisit([REPORT_UUID, SESSION_KEY])).toBe(false)
    expect(wasManualValuationSavedThisVisit([])).toBe(false)
    expect(wasManualValuationSavedThisVisit([null, undefined, 42, '  '])).toBe(false)
  })

  it('matches the report it was recorded for, trimmed, and nothing else', () => {
    recordManualValuationSaved([` ${REPORT_UUID} `, null])
    expect(wasManualValuationSavedThisVisit([REPORT_UUID])).toBe(true)
    expect(wasManualValuationSavedThisVisit(['another-report'])).toBe(false)
  })

  it('matches the saved UUID when the receipt was recorded under the session key', () => {
    recordManualValuationSaved([SESSION_KEY])
    expect(wasManualValuationSavedThisVisit([REPORT_UUID])).toBe(false)

    rememberAlias()
    expect(wasManualValuationSavedThisVisit([REPORT_UUID])).toBe(true)
  })

  it('matches the session key when the receipt was recorded under the saved UUID', () => {
    rememberAlias()
    recordManualValuationSaved([REPORT_UUID])
    expect(wasManualValuationSavedThisVisit([SESSION_KEY])).toBe(true)
  })
})
