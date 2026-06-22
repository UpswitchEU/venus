import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import {
  act,
  getBootstrapPrefillMocks,
  renderHook,
  resetBootstrapPrefillHarness,
  restoreBootstrapPrefillHarness,
  useBootstrapPrefill,
  waitFor,
} from './useBootstrapPrefill.testHarness'

const { mockUseBootstrapSafe } = getBootstrapPrefillMocks()

describe('useBootstrapPrefill year-data filtering', () => {
  beforeEach(() => {
    resetBootstrapPrefillHarness()
  })

  afterEach(() => {
    restoreBootstrapPrefillHarness()
  })

  it('filters unconfirmed future yearData rows during H1 bootstrap prefill', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_h1_year_data', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'History Co',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            2025: { revenue: 1_050_000, ebitda: 105_000 },
            2024: { revenue: 950_000, ebitda: 95_000 },
            2023: { revenue: 850_000, ebitda: 85_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 950000,
      ebitda: 95000,
    })
    expect(formData.historical_years_data).toEqual([{ year: 2023, revenue: 850000, ebitda: 85000 }])
  })

  it('drops prefill current-year data entirely when only future yearData rows exist in H1', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_h1_future_only', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        companyInfo: {
          companyName: 'Future Only Co',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            2025: { revenue: 1_050_000, ebitda: 105_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 0,
      ebitda: 0,
    })
    expect(formData.historical_years_data).toBeUndefined()
  })

  it('preserves yearData rows where revenue or EBITDA is legitimate zero', async () => {
    // Regression: previously `(data?.revenue || data?.ebitda)` dropped any
    // row where both metrics were 0/undefined. After the fix we keep a row
    // whenever at least one metric is a finite number — including zero —
    // so break-even years and CBSO-filled placeholder rows survive into
    // the wizard.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-27T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_zero_year', hasExistingData: false },
      prefillData: {
        sources: ['session', 'nbb_cbso_multi_year'],
        companyInfo: {
          companyName: 'Break Even BV',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            // 2024: real data
            2024: { revenue: 500_000, ebitda: 60_000 },
            // 2023: legitimate break-even year (zero ebitda but real revenue)
            2023: { revenue: 480_000, ebitda: 0 },
            // 2022: revenue=0 but ebitda is real (e.g., partial year)
            2022: { revenue: 0, ebitda: 5_000 },
          },
        },
        confidence: 0.7,
        fieldsPopulated: ['company_name', 'current_year_data'],
        fieldsRemaining: [],
        readOnlyKbo: false,
        autoAdvancePastPrefilledSteps: false,
      },
    })

    renderHook(() => useBootstrapPrefill())
    await act(async () => {
      await vi.runAllTimersAsync()
    })

    const formData = useManualFormStore.getState().formData
    expect(formData.current_year_data).toMatchObject({
      year: 2024,
      revenue: 500_000,
      ebitda: 60_000,
    })
    // Both prior years must round-trip — including 2022 with revenue=0.
    expect(formData.historical_years_data).toEqual([
      { year: 2023, revenue: 480_000, ebitda: 0 },
      { year: 2022, revenue: 0, ebitda: 5_000 },
    ])
  })

  it('applies low-confidence financial prefill when yearData is present', async () => {
    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: false,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_low_conf_financials', hasExistingData: false },
      prefillData: {
        sources: ['session'],
        confidence: 0.01,
        fieldsPopulated: [],
        fieldsRemaining: ['company_name'],
        financials: {
          yearData: {
            2024: { revenue: 700_000, ebitda: 70_000 },
            2023: { revenue: 650_000, ebitda: 65_000 },
          },
        },
      },
    })

    renderHook(() => useBootstrapPrefill())

    await waitFor(() => {
      const formData = useManualFormStore.getState().formData
      expect(formData.current_year_data).toMatchObject({
        year: 2024,
        revenue: 700_000,
        ebitda: 70_000,
      })
      expect(formData.historical_years_data).toEqual([
        { year: 2023, revenue: 650_000, ebitda: 65_000 },
      ])
    })
  })
})
