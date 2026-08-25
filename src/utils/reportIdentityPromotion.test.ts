import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getCanonicalReportAlias,
  promoteSavedReportIdentity,
  REPORT_IDENTITY_PROMOTED_EVENT,
} from './reportIdentityPromotion'

const REPORT_ID = '44444444-4444-4444-8444-444444444444'
const SESSION_KEY = 'val_session_123'

describe('report identity promotion', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('keeps the draft, durable report and engine identities separate', () => {
    const listener = vi.fn()
    window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, listener)

    const identity = promoteSavedReportIdentity({
      previousId: SESSION_KEY,
      response: {
        success: true,
        message: 'saved',
        reportId: REPORT_ID,
        sessionKey: SESSION_KEY,
        engineRunId: 'val_engine_run_9',
      },
    })

    expect(identity).toEqual({
      sessionKey: SESSION_KEY,
      reportId: REPORT_ID,
      engineRunId: 'val_engine_run_9',
    })
    expect(getCanonicalReportAlias(SESSION_KEY)).toBe(REPORT_ID)
    expect(listener).toHaveBeenCalledOnce()

    window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, listener)
  })

  it('never promotes an invalid report UUID or engine id', () => {
    const listener = vi.fn()
    window.addEventListener(REPORT_IDENTITY_PROMOTED_EVENT, listener)

    expect(
      promoteSavedReportIdentity({
        previousId: SESSION_KEY,
        response: {
          success: true,
          message: 'saved',
          reportId: SESSION_KEY,
          sessionKey: SESSION_KEY,
          engineRunId: REPORT_ID,
        },
      })
    ).toEqual({ sessionKey: SESSION_KEY })
    expect(listener).not.toHaveBeenCalled()
    expect(getCanonicalReportAlias(SESSION_KEY)).toBeUndefined()

    window.removeEventListener(REPORT_IDENTITY_PROMOTED_EVENT, listener)
  })
})
