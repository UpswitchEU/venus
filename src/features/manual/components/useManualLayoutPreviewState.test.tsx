import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { ValuationReportData } from '../../../components/calculator'
import type { ValuationSession } from '../../../types/valuation'
import { useManualLayoutPreviewState } from './useManualLayoutPreviewState'

function makeReport(overrides: Partial<ValuationReportData> = {}): ValuationReportData {
  return {
    id: 'report-1',
    companyName: 'Acme BV',
    valuation: 470_000,
    ebitda: 100_000,
    multiple: 4.7,
    generatedAt: new Date('2026-01-01T00:00:00Z'),
    htmlReport: '<main>report</main>',
    ...overrides,
  }
}

function makeSession(overrides: Partial<ValuationSession> = {}): ValuationSession {
  return {
    reportId: 'report-1',
    currentView: 'manual',
    dataSource: 'manual',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    partialData: {},
    htmlReport: '<main>session report</main>',
    ...overrides,
  }
}

describe('useManualLayoutPreviewState', () => {
  it('derives startup route state without calculating a browser-side valuation', () => {
    const { result } = renderHook(() =>
      useManualLayoutPreviewState({
        isGenerating: false,
        preparerAppliedMedian: 5.5,
        preparerBenchmarkMedian: 4.5,
        preSelectedMethod: 'startup_valuation',
        report: makeReport(),
        reportId: 'report-1',
        resolvedReportId: 'report-1',
        restorationComplete: true,
        result: {
          details: {
            sustainable_ebitda: 100_000,
            net_debt: 50_000,
            balance_sheet_adjustments: [{ amount: 10_000 }, { value: -5_000 }],
          },
        },
        selectedMethod: 'ebitda_multiple',
        session: null,
      })
    )

    expect(result.current.isStartupAssistantRoute).toBe(true)
    expect(result.current.effectiveAssistantMethod).toBe('startup_valuation')
    expect(result.current.effectiveIsRestoringExistingReport).toBe(false)
    expect(result.current).not.toHaveProperty('liveMultipleReportPreview')
  })

  it('keeps the restoration gate active while a restorable session is hydrating', () => {
    const { result } = renderHook(() =>
      useManualLayoutPreviewState({
        isGenerating: false,
        preparerAppliedMedian: null,
        preparerBenchmarkMedian: null,
        preSelectedMethod: null,
        report: null,
        reportId: 'report-1',
        resolvedReportId: 'report-1',
        restorationComplete: false,
        result: null,
        selectedMethod: 'dcf',
        session: makeSession(),
      })
    )

    expect(result.current.isStartupAssistantRoute).toBe(false)
    expect(result.current.effectiveIsRestoringExistingReport).toBe(true)
  })
})
