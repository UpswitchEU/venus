// @vitest-environment node

import { describe, expect, it } from 'vitest'
import {
  getManualStartupIssueAnchor,
  getManualStartupLauncherScopeId,
} from './manualStartupAssistantSurface'

describe('manualStartupAssistantSurface', () => {
  it('resolves launcher scope id from report, session, route, or fallback', () => {
    expect(
      getManualStartupLauncherScopeId({
        session: { id: 'session-id' },
        resolvedReportId: 'report-id',
        reportId: 'route-id',
      })
    ).toBe('report-id')
    expect(getManualStartupLauncherScopeId({ session: { key: 'session-key' } })).toBe('session-key')
    expect(getManualStartupLauncherScopeId({ session: null, reportId: 'route-id' })).toBe(
      'route-id'
    )
    expect(getManualStartupLauncherScopeId({ session: null })).toBe('studio-launcher')
  })

  it('maps startup issue steps to form anchors', () => {
    expect(getManualStartupIssueAnchor('profile')).toBe('startup-section-profile')
    expect(getManualStartupIssueAnchor('round_simulator')).toBe('startup-section-round')
    expect(getManualStartupIssueAnchor('unknown')).toBeNull()
    expect(getManualStartupIssueAnchor(undefined)).toBeNull()
  })
})
