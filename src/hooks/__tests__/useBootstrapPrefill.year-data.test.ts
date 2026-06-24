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

  it('uses the closed filing year as current when Silverfin also returns an open YTD row', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-24T12:00:00Z'))

    mockUseBootstrapSafe.mockReturnValue({
      isBootstrapping: false,
      bootstrapError: null,
      hasPrefilledData: true,
      updatePrefillData: vi.fn(),
      report: { mode: 'new', reportId: 'val_silverfin_ytd_demo_case', hasExistingData: false },
      prefillData: {
        sources: ['session', 'silverfin'],
        companyInfo: {
          companyName: 'INZICHT',
          countryCode: 'BE',
        },
        financials: {
          yearData: {
            2026: { revenue: 125_000, ebitda: 125_000 },
            2025: { revenue: 496_538.66, ebitda: 223_349.47 },
            2024: { revenue: 412_996.85, ebitda: 197_979.35 },
            2023: { revenue: 359_715.8, ebitda: 245_355.6 },
            2022: { revenue: 173_636.97, ebitda: 146_373.42 },
            2021: { revenue: 69_485.9, ebitda: 60_029.71 },
          },
        },
        confidence: 0.8,
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
      year: 2025,
      revenue: 496_538.66,
      ebitda: 223_349.47,
    })
    expect(formData.historical_years_data).toEqual([
      { year: 2024, revenue: 412_996.85, ebitda: 197_979.35 },
      { year: 2023, revenue: 359_715.8, ebitda: 245_355.6 },
      { year: 2022, revenue: 173_636.97, ebitda: 146_373.42 },
      { year: 2021, revenue: 69_485.9, ebitda: 60_029.71 },
    ])
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
