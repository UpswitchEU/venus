import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearScopedGlobalBootstrapResult,
  getScopedGlobalBootstrapReportId,
  getScopedGlobalBootstrapResult,
  hasScopedGlobalBootstrapResult,
  rememberScopedGlobalBootstrapResult,
} from './BootstrapProviderCache'
import type { BootstrapContext, SessionBootstrapState } from './types'
import { DEFAULT_BOOTSTRAP_STATE } from './types'

const baseContext: BootstrapContext = {
  url: 'https://valuation.upswitch.app/nl/reports/report-a',
  reportId: 'report-a',
  clientId: 'client-a',
  flow: 'manual',
  locale: 'nl',
  sourceApp: 'mercury',
}

function makeBootstrapState(reportId: string): SessionBootstrapState {
  return {
    ...DEFAULT_BOOTSTRAP_STATE,
    report: {
      ...DEFAULT_BOOTSTRAP_STATE.report,
      mode: 'existing',
      reportId,
    },
  }
}

describe('BootstrapProvider scoped global cache', () => {
  beforeEach(() => {
    clearScopedGlobalBootstrapResult()
  })

  it('returns a remembered existing report only for the exact scoped context', () => {
    const result = makeBootstrapState('report-a')

    rememberScopedGlobalBootstrapResult(baseContext, result)

    expect(hasScopedGlobalBootstrapResult()).toBe(true)
    expect(getScopedGlobalBootstrapReportId()).toBe('report-a')
    expect(getScopedGlobalBootstrapResult(baseContext)).toBe(result)
    expect(
      getScopedGlobalBootstrapResult({
        ...baseContext,
        clientId: 'client-b',
      })
    ).toBeNull()
  })

  it('does not hydrate new report creation from the immortal module cache', () => {
    rememberScopedGlobalBootstrapResult(
      {
        ...baseContext,
        reportId: 'new',
      },
      makeBootstrapState('server-minted-report')
    )

    expect(hasScopedGlobalBootstrapResult()).toBe(false)
    expect(getScopedGlobalBootstrapReportId()).toBeNull()
  })

  it('clears the cache when Titan resolves a different existing report', () => {
    rememberScopedGlobalBootstrapResult(baseContext, makeBootstrapState('other-report'))

    expect(hasScopedGlobalBootstrapResult()).toBe(false)
    expect(getScopedGlobalBootstrapResult(baseContext)).toBeNull()
  })

  it('can be explicitly reset between logout, retry, and context switch flows', () => {
    rememberScopedGlobalBootstrapResult(baseContext, makeBootstrapState('report-a'))

    clearScopedGlobalBootstrapResult()

    expect(hasScopedGlobalBootstrapResult()).toBe(false)
    expect(getScopedGlobalBootstrapReportId()).toBeNull()
    expect(getScopedGlobalBootstrapResult(baseContext)).toBeNull()
  })
})
