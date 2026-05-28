// @vitest-environment node

import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearReportsDeleting,
  isAnyReportDeleteInProgress,
  isReportDeleteInProgress,
  markReportsDeleting,
} from '../manualReportDeleteGuard'

describe('manualReportDeleteGuard', () => {
  beforeEach(() => {
    clearReportsDeleting()
  })

  it('tracks ids under delete and clears them', () => {
    markReportsDeleting(['report-1', 'val_abc'])
    expect(isReportDeleteInProgress('report-1')).toBe(true)
    expect(isReportDeleteInProgress('val_abc')).toBe(true)
    expect(isAnyReportDeleteInProgress()).toBe(true)

    clearReportsDeleting()
    expect(isReportDeleteInProgress('report-1')).toBe(false)
    expect(isAnyReportDeleteInProgress()).toBe(false)
  })

  it('returns true when id is omitted and any delete is in flight', () => {
    markReportsDeleting(['x'])
    expect(isReportDeleteInProgress()).toBe(true)
    expect(isReportDeleteInProgress(null)).toBe(true)
  })

  it('does not block unrelated report ids during a delete', () => {
    markReportsDeleting(['report-a'])
    expect(isReportDeleteInProgress('report-b')).toBe(false)
    expect(isReportDeleteInProgress('report-a')).toBe(true)
  })
})
