import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationReportData } from '@/components/calculator'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import type { ValuationResponse } from '@/types/valuation'
import { useSynthesisReportHeadlineSync } from './useSynthesisReportHeadlineSync'

describe('useSynthesisReportHeadlineSync', () => {
  beforeEach(() => {
    useManualResultsStore.setState({
      preSelectedMethods: ['dcf', 'ebitda_multiple'],
      userWeights: { dcf: 70, ebitda_multiple: 30 },
      selectedMethod: 'upswitch_adaptive',
    } as Parameters<typeof useManualResultsStore.setState>[0])
  })

  it('updates report valuation when live synthesis blend changes', () => {
    const setReport = vi.fn()
    const result = {
      weighted_valuation: { blended_equity_value: 500_000 },
      valuation_results: {
        dcf: { available: true, value: 616_744, details: {} },
        ebitda_multiple: { available: true, value: 453_502, details: {} },
      },
    } as unknown as ValuationResponse

    const report: ValuationReportData = {
      id: 'draft',
      companyName: 'Creatief bureau',
      valuation: 384_000,
      valuationLow: 300_000,
      valuationHigh: 450_000,
      ebitda: 100_000,
      multiple: 3,
      generatedAt: new Date(),
      confidenceLevel: 'medium',
      metrics: [],
    }

    renderHook(() =>
      useSynthesisReportHeadlineSync({
        result,
        report,
        selectedMethod: 'upswitch_adaptive',
        setReport,
      })
    )

    expect(setReport).toHaveBeenCalled()
    const updater = setReport.mock.calls[0][0] as (prev: ValuationReportData) => ValuationReportData
    const next = updater(report)
    expect(next.valuation).toBe(567_771)
    expect(next.recommendedAskingPrice).toBe(567_771)
  })

  it('syncs recommendedAskingPrice from live blend without server weighted_valuation', () => {
    const setReport = vi.fn()
    const result = {
      valuation_results: {
        dcf: { available: true, value: 616_744, details: {} },
        ebitda_multiple: { available: true, value: 453_502, details: {} },
        upswitch_adaptive: { available: true, value: 384_000, details: {} },
      },
    } as unknown as ValuationResponse

    renderHook(() =>
      useSynthesisReportHeadlineSync({
        result,
        report: {
          id: 'draft',
          companyName: 'Co',
          valuation: 384_000,
          recommendedAskingPrice: 384_000,
          ebitda: 10,
          multiple: 1,
          generatedAt: new Date(),
          confidenceLevel: 'low',
          metrics: [],
        },
        selectedMethod: 'upswitch_adaptive',
        setReport,
      })
    )

    const updater = setReport.mock.calls[0][0] as (prev: ValuationReportData) => ValuationReportData
    const next = updater({
      valuation: 384_000,
      recommendedAskingPrice: 384_000,
    } as ValuationReportData)
    expect(next.valuation).toBe(567_771)
    expect(next.recommendedAskingPrice).toBe(567_771)
  })

  it('uses persisted weighted_valuation when store has no live blend weights', () => {
    useManualResultsStore.setState({
      preSelectedMethods: ['upswitch_adaptive'],
      userWeights: {},
    } as Parameters<typeof useManualResultsStore.setState>[0])

    const setReport = vi.fn()
    const result = {
      weighted_valuation: { blended_equity_value: 567_771 },
      valuation_results: {
        upswitch_adaptive: { available: true, value: 384_000, details: {} },
      },
    } as unknown as ValuationResponse

    renderHook(() =>
      useSynthesisReportHeadlineSync({
        result,
        report: {
          id: 'draft',
          companyName: 'Co',
          valuation: 384_000,
          ebitda: 10,
          multiple: 1,
          generatedAt: new Date(),
          confidenceLevel: 'low',
          metrics: [],
        },
        selectedMethod: 'upswitch_adaptive',
        setReport,
      })
    )

    expect(setReport).toHaveBeenCalled()
    const updater = setReport.mock.calls[0][0] as (prev: ValuationReportData) => ValuationReportData
    expect(updater({ valuation: 384_000 } as ValuationReportData).valuation).toBe(567_771)
  })

  it('does not update when headline already matches method-only valuation', () => {
    const setReport = vi.fn()
    useManualResultsStore.setState({
      preSelectedMethods: ['upswitch_adaptive'],
      userWeights: {},
    } as Parameters<typeof useManualResultsStore.setState>[0])

    renderHook(() =>
      useSynthesisReportHeadlineSync({
        result: {
          valuation_results: {
            upswitch_adaptive: { available: true, value: 100, details: {} },
          },
        } as ValuationResponse,
        report: {
          id: 'draft',
          companyName: 'Co',
          valuation: 100,
          valuationLow: 80,
          valuationHigh: 120,
          ebitda: 10,
          multiple: 1,
          generatedAt: new Date(),
          confidenceLevel: 'low',
          metrics: [],
        },
        selectedMethod: 'upswitch_adaptive',
        setReport,
      })
    )

    expect(setReport).not.toHaveBeenCalled()
  })
})
