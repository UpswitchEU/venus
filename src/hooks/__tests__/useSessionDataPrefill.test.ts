/**
 * useSessionDataPrefill — React #185 feedback-loop guard
 *
 * Locks in the contract that prefill must NOT re-fire when the form store
 * mutates (other hooks updating fields, the user typing, autosave, etc.).
 * The hook used to subscribe to the whole form store and list 10+
 * `formData.X` deps, so every `updateFormData` re-fired the effect and
 * relied on the `hasPrefilledRef` gate — which was reset whenever
 * `optionalPrefillSig` flipped (a frequent occurrence during bootstrap
 * settling). The combination was a self-feedback loop one reset away
 * from cascading into the React #185 crash on the Mercury accountant
 * existing-report flow.
 */

import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useSessionStore } from '../../store/useSessionStore'
import { useSessionDataPrefill } from '../useSessionDataPrefill'

const { mockUseBootstrapSafe } = vi.hoisted(() => ({
  mockUseBootstrapSafe: vi.fn(),
}))

vi.mock('../../lib/bootstrap', () => ({
  useBootstrapSafe: mockUseBootstrapSafe,
}))

describe('useSessionDataPrefill (React #185 feedback-loop guard)', () => {
  beforeEach(() => {
    useManualFormStore.getState().resetForm()
    useSessionStore.setState({
      session: null,
      restorationComplete: false,
    })
    mockUseBootstrapSafe.mockReset()
  })

  function seedExistingReportSession(reportId: string, sessionData: Record<string, unknown>) {
    useSessionStore.setState({
      session: {
        reportId,
        currentView: 'manual' as const,
        dataSource: 'manual' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
        sessionData,
        partialData: {},
      },
      restorationComplete: true,
    })
  }

  function bootstrapWithoutMeaningfulPrefill(reportId: string) {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: false,
      report: {
        mode: 'existing' as const,
        reportId,
        hasExistingData: true,
        hasValuationResult: false,
      },
      prefillData: {
        sources: [],
        companyInfo: undefined,
        businessType: undefined,
        financials: undefined,
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })
  }

  it('does not re-fire updateFormData when an unrelated form field changes', async () => {
    bootstrapWithoutMeaningfulPrefill('val_loop_guard')
    seedExistingReportSession('val_loop_guard', {
      company_name: 'Session Origin BV',
      kbo_number: '0123456789',
    })

    const updateFormDataSpy = vi.fn(useManualFormStore.getState().updateFormData)
    useManualFormStore.setState({ updateFormData: updateFormDataSpy })

    renderHook(() => useSessionDataPrefill())

    // Wait for the initial prefill to land.
    await waitFor(() => {
      expect(useManualFormStore.getState().formData.company_name).toBe('Session Origin BV')
    })

    const callCountAfterInitialPrefill = updateFormDataSpy.mock.calls.length
    expect(callCountAfterInitialPrefill).toBeGreaterThanOrEqual(1)

    // Mutate an UNRELATED form field — simulates another hook (autosave,
    // user typing, a sibling prefill) writing to the form store.
    await act(async () => {
      useManualFormStore.getState().updateFormData({ business_description: 'edited' })
    })

    // updateFormData was called by the test itself, so the spy count goes up
    // by 1 — but the hook MUST NOT have called it again in response.
    expect(updateFormDataSpy).toHaveBeenCalledTimes(callCountAfterInitialPrefill + 1)
  })

  it('does not re-fire updateFormData when bootstrap reference is stable across re-renders', async () => {
    bootstrapWithoutMeaningfulPrefill('val_stable_bootstrap')
    seedExistingReportSession('val_stable_bootstrap', {
      company_name: 'Stable Bootstrap BV',
    })

    const updateFormDataSpy = vi.fn(useManualFormStore.getState().updateFormData)
    useManualFormStore.setState({ updateFormData: updateFormDataSpy })

    const { rerender } = renderHook(() => useSessionDataPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.company_name).toBe('Stable Bootstrap BV')
    })

    const callCountAfterInitialPrefill = updateFormDataSpy.mock.calls.length

    // Three idle re-renders with the same bootstrap reference — the hook
    // must NOT call updateFormData again. Mock returns the same object so
    // the bootstrap dep is reference-stable.
    rerender()
    rerender()
    rerender()

    // Allow microtasks/effects to flush.
    await act(async () => {
      await Promise.resolve()
    })

    expect(updateFormDataSpy).toHaveBeenCalledTimes(callCountAfterInitialPrefill)
  })

  it('does fire prefill when sessionData reference legitimately changes (late hydration)', async () => {
    bootstrapWithoutMeaningfulPrefill('val_late_hydration')
    // Seed initial session WITHOUT identity — prefill shouldn't fire yet.
    seedExistingReportSession('val_late_hydration', {})

    const updateFormDataSpy = vi.fn(useManualFormStore.getState().updateFormData)
    useManualFormStore.setState({ updateFormData: updateFormDataSpy })

    renderHook(() => useSessionDataPrefill())

    // Form should still be empty.
    expect(useManualFormStore.getState().formData.company_name).toBe('')

    const callCountBeforeHydration = updateFormDataSpy.mock.calls.length

    // Now session reference changes with a real payload — prefill must fire.
    await act(async () => {
      useSessionStore.setState({
        session: {
          reportId: 'val_late_hydration',
          currentView: 'manual' as const,
          dataSource: 'manual' as const,
          createdAt: new Date(),
          updatedAt: new Date(),
          sessionData: { company_name: 'Late Hydrated BV' },
          partialData: {},
        },
      })
    })

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.company_name).toBe('Late Hydrated BV')
    })

    expect(updateFormDataSpy.mock.calls.length).toBeGreaterThan(callCountBeforeHydration)
  })

  it('canonicalizes legacy business type ids from restored session data', async () => {
    bootstrapWithoutMeaningfulPrefill('val_business_type_alias')
    seedExistingReportSession('val_business_type_alias', {
      company_name: 'Alias Restore BV',
      business_type_id: 'fintech_lending_credit',
    })

    renderHook(() => useSessionDataPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.business_type_id).toBe('fintech-lending')
    })
  })

  it('strips stale FCFF from fallback session forecast rows in default EBITDA mode', async () => {
    bootstrapWithoutMeaningfulPrefill('val_dcf_default_forecast')
    seedExistingReportSession('val_dcf_default_forecast', {
      company_name: 'Default DCF BV',
      forecast_years_data: [{ year: 2026, revenue: 1_050_000, ebitda: 105_000, free_cash_flow: 1 }],
    })

    renderHook(() => useSessionDataPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.forecast_years_data).toEqual([
        { year: 2026, revenue: 1_050_000, ebitda: 105_000 },
      ])
    })
  })

  it('restores explicit FCFF-only session forecasts even when the empty form starts in default EBITDA mode', async () => {
    bootstrapWithoutMeaningfulPrefill('val_dcf_fcff_forecast')
    seedExistingReportSession('val_dcf_fcff_forecast', {
      company_name: 'FCFF DCF BV',
      dcf_input_mode: 'fcff_only',
      forecast_years_data: [{ year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 }],
    })

    renderHook(() => useSessionDataPrefill())

    await waitFor(() => {
      expect(useManualFormStore.getState().formData.dcf_input_mode).toBe('fcff_only')
      expect(useManualFormStore.getState().formData.forecast_years_data).toEqual([
        { year: 2026, revenue: 0, ebitda: 0, free_cash_flow: 75_000 },
      ])
    })
  })
})
