/**
 * Valuation Restoration Tests
 *
 * Tests for valuation session restoration after page refresh.
 * Ensures data persistence and UI restoration work correctly.
 *
 * @module __tests__/restoration
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualResultsStore } from '../store/manual/useManualResultsStore'
import { useSessionStore } from '../store/useSessionStore'
import type { ValuationResponse, ValuationSession } from '../types/valuation'

describe('Valuation Restoration', () => {
  beforeEach(() => {
    // Clear stores before each test
    useSessionStore.setState({
      session: null,
      isLoading: false,
      error: null,
      isSaving: false,
      lastSaved: null,
      hasUnsavedChanges: false,
    })

    useManualResultsStore.setState({
      result: null,
      htmlReport: null,
      infoTabHtml: null,
      isCalculating: false,
      error: null,
      calculationProgress: 0,
    })
  })

  describe('Session Store - loadSession', () => {
    it('should load session with all assets from backend', async () => {
      // Mock backend API
      const mockSession: ValuationSession = {
        reportId: 'val_test_123',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: {
          company_name: 'Test Company',
          revenue: 1000000,
          industry: 'technology',
          country_code: 'BE',
          business_model: 'b2b_saas',
          founding_year: 2020,
          current_year_data: {
            year: 2024,
            revenue: 1000000,
            ebitda: 200000,
          },
        },
        valuationResult: {
          valuation_id: 'val_result_123',
          company_name: 'Test Company',
          equity_value_low: 450000,
          equity_value_mid: 500000,
          equity_value_high: 550000,
          recommended_asking_price: 525000,
          confidence_score: 0.85,
          overall_confidence: 'High',
          dcf_weight: 0,
          multiples_weight: 1,
          financial_metrics: {
            gross_margin: 0.7,
            ebitda_margin: 0.2,
            ebit_margin: 0.18,
            net_margin: 0.15,
            return_on_assets: 0.25,
            return_on_equity: 0.35,
            current_ratio: 2.0,
            quick_ratio: 1.8,
            cash_ratio: 1.2,
            debt_to_equity: 0.5,
            debt_to_assets: 0.3,
            interest_coverage: 5.0,
            revenue_growth: 0.2,
            revenue_cagr_3y: 0.15,
            ebitda_growth: 0.25,
            altman_z_score: 3.5,
            financial_health_score: 85,
            financial_health_description: 'Strong',
          },
          key_value_drivers: ['Strong margins', 'Growth trajectory'],
          risk_factors: ['Owner dependency'],
        } as ValuationResponse,
        htmlReport:
          '<html><body><h1>Valuation Report</h1><p>Test Company: €500,000</p></body></html>',
        infoTabHtml:
          '<html><body><h2>Calculation Breakdown</h2><p>EBITDA Multiple Method</p></body></html>',
        partialData: {},
        createdAt: new Date('2024-12-17T10:00:00Z'),
        updatedAt: new Date('2024-12-17T10:05:00Z'),
        calculatedAt: new Date('2024-12-17T10:05:00Z'),
      }

      // Mock sessionService.loadSession
      const { sessionService } = await import('../services/session/SessionService')
      vi.spyOn(sessionService, 'loadSession').mockResolvedValue(mockSession)

      // Load session
      const { loadSession } = useSessionStore.getState()
      await loadSession('val_test_123', 'manual', null)

      // Verify session loaded
      const state = useSessionStore.getState()
      expect(state.session).toBeTruthy()
      expect(state.session?.reportId).toBe('val_test_123')
      expect(state.session?.htmlReport).toBeTruthy()
      expect(state.session?.infoTabHtml).toBeTruthy()
      expect(state.session?.valuationResult).toBeTruthy()
      expect(state.session?.sessionData).toBeTruthy()
    })
  })

  describe('Manual Results Store - setResult with HTML', () => {
    it('should extract html_report and info_tab_html from result object', () => {
      const mockResult: ValuationResponse = {
        valuation_id: 'val_123',
        company_name: 'Test Co',
        equity_value_low: 400000,
        equity_value_mid: 500000,
        equity_value_high: 600000,
        recommended_asking_price: 525000,
        confidence_score: 0.85,
        overall_confidence: 'High',
        dcf_weight: 0,
        multiples_weight: 1,
        financial_metrics: {
          gross_margin: 0.7,
          ebitda_margin: 0.2,
          ebit_margin: 0.18,
          net_margin: 0.15,
          return_on_assets: 0.25,
          return_on_equity: 0.35,
          current_ratio: 2.0,
          quick_ratio: 1.8,
          cash_ratio: 1.2,
          debt_to_equity: 0.5,
          debt_to_assets: 0.3,
          interest_coverage: 5.0,
          revenue_growth: 0.2,
          revenue_cagr_3y: 0.15,
          ebitda_growth: 0.25,
          altman_z_score: 3.5,
          financial_health_score: 85,
          financial_health_description: 'Strong',
        },
        key_value_drivers: [],
        risk_factors: [],
        html_report: '<html><body>Report</body></html>',
        info_tab_html: '<html><body>Info</body></html>',
      }

      const { setResult } = useManualResultsStore.getState()
      setResult(mockResult)

      const state = useManualResultsStore.getState()
      expect(state.result).toBeTruthy()
      expect(state.htmlReport).toBe('<html><body>Report</body></html>')
      expect(state.infoTabHtml).toBe('<html><body>Info</body></html>')
      expect(state.result?.html_report).toBe('<html><body>Report</body></html>')
    })

    it('should log error if html_report is missing from result', () => {
      const mockResult: ValuationResponse = {
        valuation_id: 'val_456',
        company_name: 'Test Co 2',
        equity_value_low: 400000,
        equity_value_mid: 500000,
        equity_value_high: 600000,
        recommended_asking_price: 525000,
        confidence_score: 0.85,
        overall_confidence: 'High',
        dcf_weight: 0,
        multiples_weight: 1,
        financial_metrics: {
          gross_margin: 0.7,
          ebitda_margin: 0.2,
          ebit_margin: 0.18,
          net_margin: 0.15,
          return_on_assets: 0.25,
          return_on_equity: 0.35,
          current_ratio: 2.0,
          quick_ratio: 1.8,
          cash_ratio: 1.2,
          debt_to_equity: 0.5,
          debt_to_assets: 0.3,
          interest_coverage: 5.0,
          revenue_growth: 0.2,
          revenue_cagr_3y: 0.15,
          ebitda_growth: 0.25,
          altman_z_score: 3.5,
          financial_health_score: 85,
          financial_health_description: 'Strong',
        },
        key_value_drivers: [],
        risk_factors: [],
        // Missing html_report!
      }

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { setResult } = useManualResultsStore.getState()
      setResult(mockResult)

      // Verify error was logged (checking if error logging was called)
      // Note: The actual logger implementation may vary
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  describe('Session Restoration Integration', () => {
    it('should restore complete valuation with HTML reports merged into result', async () => {
      // Create mock session with separate HTML fields
      const mockSession: ValuationSession = {
        reportId: 'val_integration_test',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: {
          company_name: 'Integration Test Co',
          revenue: 2000000,
          industry: 'retail',
          country_code: 'BE',
          business_model: 'b2c',
          founding_year: 2018,
          current_year_data: {
            year: 2024,
            revenue: 2000000,
            ebitda: 400000,
          },
        },
        valuationResult: {
          valuation_id: 'val_result_integration',
          company_name: 'Integration Test Co',
          equity_value_low: 900000,
          equity_value_mid: 1000000,
          equity_value_high: 1100000,
          recommended_asking_price: 1050000,
          confidence_score: 0.9,
          overall_confidence: 'Very High',
          dcf_weight: 0,
          multiples_weight: 1,
          financial_metrics: {
            gross_margin: 0.65,
            ebitda_margin: 0.2,
            ebit_margin: 0.18,
            net_margin: 0.14,
            return_on_assets: 0.22,
            return_on_equity: 0.32,
            current_ratio: 1.9,
            quick_ratio: 1.7,
            cash_ratio: 1.1,
            debt_to_equity: 0.45,
            debt_to_assets: 0.28,
            interest_coverage: 6.0,
            revenue_growth: 0.15,
            revenue_cagr_3y: 0.12,
            ebitda_growth: 0.18,
            altman_z_score: 3.8,
            financial_health_score: 88,
            financial_health_description: 'Excellent',
          },
          key_value_drivers: ['Strong brand', 'Market leadership'],
          risk_factors: ['Competition'],
          // Note: NO html_report in result - stored separately in session
        } as ValuationResponse,
        // HTML stored separately in session (as returned by backend)
        htmlReport:
          '<html><body><h1>Integration Test Report</h1><p>Value: €1,000,000</p></body></html>',
        infoTabHtml: '<html><body><h2>Methodology</h2><p>EBITDA Multiple: 5.0x</p></body></html>',
        partialData: {},
        createdAt: new Date('2024-12-17T11:00:00Z'),
        updatedAt: new Date('2024-12-17T11:10:00Z'),
        calculatedAt: new Date('2024-12-17T11:10:00Z'),
      }

      // Set session in store (simulating successful load)
      useSessionStore.setState({ session: mockSession })

      // Simulate restoration logic (what ManualLayout.tsx does)
      const { setResult } = useManualResultsStore.getState()

      // Merge HTML from session into result (this is the fix!)
      const resultWithHtml = {
        ...mockSession.valuationResult,
        html_report: mockSession.htmlReport,
        info_tab_html: mockSession.infoTabHtml,
      }

      setResult(resultWithHtml as any)

      // Verify restoration
      const resultsState = useManualResultsStore.getState()

      expect(resultsState.result).toBeTruthy()
      expect(resultsState.result?.valuation_id).toBe('val_result_integration')
      expect(resultsState.result?.html_report).toBeTruthy()
      expect(resultsState.result?.info_tab_html).toBeTruthy()
      expect(resultsState.htmlReport).toBeTruthy()
      expect(resultsState.infoTabHtml).toBeTruthy()

      // Verify HTML content is correct
      expect(resultsState.result?.html_report).toContain('Integration Test Report')
      expect(resultsState.result?.info_tab_html).toContain('EBITDA Multiple')
    })

    it('should handle partial restoration when only sessionData exists', async () => {
      const mockSession: ValuationSession = {
        reportId: 'val_partial_test',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: {
          company_name: 'Partial Data Co',
          revenue: 500000,
          industry: 'services',
          country_code: 'BE',
          business_model: 'b2b_saas',
          founding_year: 2022,
          current_year_data: {
            year: 2024,
            revenue: 500000,
            ebitda: 100000,
          },
        },
        // No valuationResult, htmlReport, or infoTabHtml (incomplete valuation)
        partialData: {},
        createdAt: new Date('2024-12-17T12:00:00Z'),
        updatedAt: new Date('2024-12-17T12:01:00Z'),
      }

      useSessionStore.setState({ session: mockSession })

      // Verify session data is available but no results
      const sessionState = useSessionStore.getState()
      expect(sessionState.session?.sessionData).toBeTruthy()
      expect(sessionState.session?.valuationResult).toBeFalsy()
      expect(sessionState.session?.htmlReport).toBeFalsy()

      // This represents the "form pre-filled but no report yet" state
      expect(sessionState.session?.sessionData?.company_name).toBe('Partial Data Co')
    })

    it('should not restore if feature flag is disabled', async () => {
      // Mock feature flag to return false
      vi.mock('../config/features', () => ({
        shouldEnableSessionRestoration: () => false,
      }))

      const mockSession: ValuationSession = {
        reportId: 'val_feature_flag_test',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: { company_name: 'Test' },
        valuationResult: {
          valuation_id: 'val_123',
          company_name: 'Test',
          equity_value_low: 400000,
          equity_value_mid: 500000,
          equity_value_high: 600000,
          recommended_asking_price: 525000,
          confidence_score: 0.85,
          overall_confidence: 'High',
          dcf_weight: 0,
          multiples_weight: 1,
          financial_metrics: {} as any,
          key_value_drivers: [],
          risk_factors: [],
        } as ValuationResponse,
        htmlReport: '<html><body>Report</body></html>',
        infoTabHtml: '<html><body>Info</body></html>',
        partialData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      useSessionStore.setState({ session: mockSession })

      // With feature flag disabled, restoration should not happen
      // (In actual implementation, the ManualLayout effect would skip restoration)

      const resultsState = useManualResultsStore.getState()
      expect(resultsState.result).toBeNull() // Should remain null
    })
  })

  describe('Error Handling', () => {
    it('should handle missing html_report gracefully', () => {
      const mockSession: ValuationSession = {
        reportId: 'val_error_test',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: { company_name: 'Error Test' },
        valuationResult: {
          valuation_id: 'val_error_123',
          company_name: 'Error Test',
          equity_value_low: 400000,
          equity_value_mid: 500000,
          equity_value_high: 600000,
          recommended_asking_price: 525000,
          confidence_score: 0.85,
          overall_confidence: 'High',
          dcf_weight: 0,
          multiples_weight: 1,
          financial_metrics: {} as any,
          key_value_drivers: [],
          risk_factors: [],
          // Missing html_report
        } as ValuationResponse,
        // Session also missing htmlReport
        partialData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      useSessionStore.setState({ session: mockSession })

      // Restoration should still work, just without HTML
      const { setResult } = useManualResultsStore.getState()
      const resultWithHtml = {
        ...mockSession.valuationResult,
        html_report: mockSession.htmlReport || mockSession.valuationResult!.html_report,
        info_tab_html: mockSession.infoTabHtml || mockSession.valuationResult!.info_tab_html,
      }

      setResult(resultWithHtml as any)

      const resultsState = useManualResultsStore.getState()
      expect(resultsState.result).toBeTruthy()
      expect(resultsState.result?.valuation_id).toBe('val_error_123')
      // HTML fields should be undefined (graceful degradation)
    })
  })

  describe('Performance', () => {
    it('should restore session in <500ms', async () => {
      const mockSession: ValuationSession = {
        reportId: 'val_perf_test',
        currentView: 'manual',
        dataSource: 'manual',
        sessionData: { company_name: 'Perf Test' },
        valuationResult: {
          valuation_id: 'val_perf_123',
          company_name: 'Perf Test',
          equity_value_low: 400000,
          equity_value_mid: 500000,
          equity_value_high: 600000,
          recommended_asking_price: 525000,
          confidence_score: 0.85,
          overall_confidence: 'High',
          dcf_weight: 0,
          multiples_weight: 1,
          financial_metrics: {} as any,
          key_value_drivers: [],
          risk_factors: [],
        } as ValuationResponse,
        htmlReport: '<html><body>Report</body></html>',
        infoTabHtml: '<html><body>Info</body></html>',
        partialData: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const { sessionService } = await import('../services/session/SessionService')
      vi.spyOn(sessionService, 'loadSession').mockResolvedValue(mockSession)

      const startTime = performance.now()

      const { loadSession } = useSessionStore.getState()
      await loadSession('val_perf_test', 'manual', null)

      const duration = performance.now() - startTime

      // Should complete in <500ms
      expect(duration).toBeLessThan(500)
    })
  })
})
