// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import type { ValuationVersion } from '@/types/ValuationVersion'
import type { ValuationRequest, ValuationResponse } from '@/types/valuation'
import {
  type ManualVersioningExecutorDeps,
  runManualCalculationVersioning,
} from './manualVersioningExecutor'

function request(overrides: Partial<ValuationRequest> = {}): ValuationRequest {
  return {
    company_name: 'Acme BV',
    country_code: 'BE',
    industry: 'services',
    business_model: 'services',
    founding_year: 2001,
    current_year_data: {
      year: 2025,
      revenue: 1_000_000,
      ebitda: 100_000,
    },
    revenue: 1_000_000,
    ebitda: 100_000,
    ...overrides,
  }
}

function response(html = '<main>report</main>'): ValuationResponse {
  return {
    success: true,
    html_report: html,
  } as ValuationResponse
}

function version(overrides: Partial<ValuationVersion> = {}): ValuationVersion {
  return {
    id: 'version-1',
    reportId: 'report-1',
    versionNumber: 1,
    versionLabel: 'v1',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    createdBy: null,
    formData: request(),
    valuationResult: null,
    htmlReport: null,
    changesSummary: { totalChanges: 0, significantChanges: [] },
    isActive: true,
    isPinned: false,
    ...overrides,
  }
}

function deps(overrides: Partial<ManualVersioningExecutorDeps> = {}): ManualVersioningExecutorDeps {
  return {
    fetchVersions: vi.fn().mockResolvedValue(undefined),
    getLatestVersion: vi.fn().mockReturnValue({ versionNumber: 1 }),
    createVersion: vi.fn().mockResolvedValue(version({ id: 'version-3', versionNumber: 3 })),
    snapshotNormalizationsToVersion: vi.fn().mockResolvedValue(undefined),
    logRegeneration: vi.fn(),
    ...overrides,
  }
}

describe('runManualCalculationVersioning', () => {
  it('logs the first Titan-created version', async () => {
    const d = deps({ getLatestVersion: vi.fn().mockReturnValue({ versionNumber: 1 }) })

    const result = await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: null,
      request: request(),
      valuationResult: response(),
      calculationDurationMs: 123,
      userId: 'user-1',
      deps: d,
    })

    expect(result).toEqual({ aborted: false, versionCreationFailed: false })
    expect(d.logRegeneration).toHaveBeenCalledWith(
      'report-1',
      1,
      { totalChanges: 0, significantChanges: [] },
      123,
      'user-1'
    )
    expect(d.createVersion).not.toHaveBeenCalled()
  })

  it('logs Titan regeneration when the latest version advanced', async () => {
    const previous = version({ versionNumber: 2, formData: request() })
    const d = deps({ getLatestVersion: vi.fn().mockReturnValue({ versionNumber: 3 }) })

    await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: previous,
      request: request({ revenue: 1_250_000 }),
      valuationResult: response(),
      calculationDurationMs: 456,
      deps: d,
    })

    expect(d.logRegeneration).toHaveBeenCalledWith(
      'report-1',
      3,
      expect.objectContaining({
        revenue: expect.objectContaining({ from: 1_000_000, to: 1_250_000 }),
      }),
      456,
      undefined
    )
    expect(d.createVersion).not.toHaveBeenCalled()
  })

  it('creates, snapshots, and audits a Venus-side version when Titan did not advance', async () => {
    const previous = version({ versionNumber: 2, formData: request() })
    const d = deps({ getLatestVersion: vi.fn().mockReturnValue({ versionNumber: 2 }) })
    const nextRequest = request({ revenue: 1_250_000 })

    await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: previous,
      request: nextRequest,
      valuationResult: response('<main>real report</main>'),
      calculationDurationMs: 789,
      deps: d,
    })

    expect(d.createVersion).toHaveBeenCalledWith(
      expect.objectContaining({
        reportId: 'report-1',
        formData: nextRequest,
        htmlReport: '<main>real report</main>',
        versionLabel: expect.stringContaining('v3'),
      })
    )
    expect(d.snapshotNormalizationsToVersion).toHaveBeenCalledWith('report-1', 'version-3')
    expect(d.logRegeneration).toHaveBeenCalledWith(
      'report-1',
      3,
      expect.objectContaining({
        revenue: expect.objectContaining({ from: 1_000_000, to: 1_250_000 }),
      }),
      789,
      undefined
    )
  })

  it('returns fetch errors without running version effects', async () => {
    const fetchError = new Error('offline')
    const d = deps({ fetchVersions: vi.fn().mockRejectedValue(fetchError) })

    const result = await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: null,
      request: request(),
      valuationResult: response(),
      calculationDurationMs: 1,
      deps: d,
    })

    expect(result).toEqual({ aborted: false, versionCreationFailed: false, fetchError })
    expect(d.getLatestVersion).not.toHaveBeenCalled()
    expect(d.createVersion).not.toHaveBeenCalled()
    expect(d.logRegeneration).not.toHaveBeenCalled()
  })

  it('aborts stale runs after fetch before side effects', async () => {
    const d = deps()
    const result = await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: null,
      request: request(),
      valuationResult: response(),
      calculationDurationMs: 1,
      isStillTarget: () => false,
      deps: d,
    })

    expect(result).toEqual({ aborted: true, versionCreationFailed: false })
    expect(d.getLatestVersion).not.toHaveBeenCalled()
    expect(d.logRegeneration).not.toHaveBeenCalled()
  })

  it('returns version errors as non-fatal calculation failures', async () => {
    const versionError = new Error('version create failed')
    const previous = version({ versionNumber: 2, formData: request() })
    const d = deps({
      getLatestVersion: vi.fn().mockReturnValue({ versionNumber: 2 }),
      createVersion: vi.fn().mockRejectedValue(versionError),
    })

    const result = await runManualCalculationVersioning({
      reportId: 'report-1',
      previousVersion: previous,
      request: request({ revenue: 1_250_000 }),
      valuationResult: response(),
      calculationDurationMs: 1,
      deps: d,
    })

    expect(result).toEqual({ aborted: false, versionCreationFailed: true, versionError })
  })
})
