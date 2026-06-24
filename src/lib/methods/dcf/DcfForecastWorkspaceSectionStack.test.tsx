import { render } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { DcfInputMode } from '@/components/calculator/sections/DcfForecastWorkspace'
import type { DcfProjectionPreviewRow } from '@/components/calculator/sections/dcfProjectionPreview'
import type { ManualInputFieldValidation } from '@/components/calculator/utils/manualInputFieldValidation'
import type { ManualYearlyFinancialField } from '@/components/calculator/utils/manualYearlyFinancialUpdates'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import { DcfForecastWorkspaceSectionStack } from './DcfForecastWorkspaceSectionStack'

type MockDcfForecastWorkspaceProps = {
  step: number
  showModeToggle?: boolean
  forecastRows: YearlyFinancials[]
  derivedProjectionPreview?: DcfProjectionPreviewRow[]
  latestHistoricalRevenue?: number
  latestHistoricalEbitda?: number
  fieldValidation?: ManualInputFieldValidation
  globalCapexPct?: number
  globalDaPct?: number
  globalNwcPct?: number
  globalTaxRatePct?: number
  disabled?: boolean
  canAddYear: boolean
  nextForecastYear: number
  dcfInputMode: DcfInputMode
  dcfTaxShieldProjections?: number[]
  onDcfInputModeChange: (mode: DcfInputMode) => void
  onDcfTaxShieldProjectionChange?: (index: number, value: number | undefined) => void
  onChange: (year: string, field: ManualYearlyFinancialField, value: number | undefined) => void
  onAddYear: () => void
  onRequestRemoveForecastYears?: () => void
}

const mocks = vi.hoisted(() => ({
  workspaceProps: [] as MockDcfForecastWorkspaceProps[],
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/calculator/sections/DcfForecastWorkspace', () => ({
  DcfForecastWorkspace: (props: MockDcfForecastWorkspaceProps) => {
    mocks.workspaceProps.push(props)
    return <div>dcf-workspace:{props.step}</div>
  },
}))

function formData(partial: Partial<ManualValuationFormData> = {}): ManualValuationFormData {
  return {
    companyName: 'DemoCo',
    businessType: 'services',
    industry: 'consulting',
    country: 'BE',
    yearFounded: '2015',
    businessStructure: 'BV',
    ownerManagers: 1,
    fteEmployees: undefined,
    yearlyFinancials: [],
    ...partial,
  }
}

const forecastRows: YearlyFinancials[] = [
  { year: '2025', revenue: 1_100_000, ebitda: 180_000, isForecast: true },
]

describe('DcfForecastWorkspaceSectionStack', () => {
  it('maps forecast workspace props and owns forecast actions', () => {
    const setFormData = vi.fn()
    const setShowForecastRemovalConfirm = vi.fn()
    const updateYearlyFinancials = vi.fn()
    const onDcfInputModeChange = vi.fn()
    const fieldValidation = {
      errors: {},
      warnings: {},
      hasErrors: false,
    } satisfies ManualInputFieldValidation
    const currentFormData = formData({
      yearlyFinancials: forecastRows,
      dcf_input_mode: 'fcff_only',
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 1,
      dcf_tax_rate_pct: 25,
      dcf_tax_shield_projections: [1500],
    })

    render(
      <DcfForecastWorkspaceSectionStack
        step={7}
        formData={currentFormData}
        forecastRows={forecastRows}
        projectionAutofillRows={[]}
        fieldValidation={fieldValidation}
        onDcfInputModeChange={onDcfInputModeChange}
        setFormData={setFormData as React.Dispatch<React.SetStateAction<ManualValuationFormData>>}
        setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
        updateYearlyFinancials={updateYearlyFinancials}
        disabled
        latestHistoricalRevenue={1_000_000}
        latestHistoricalEbitda={150_000}
      />
    )

    const props = mocks.workspaceProps.at(-1)
    expect(props).toMatchObject({
      step: 7,
      showModeToggle: false,
      forecastRows,
      derivedProjectionPreview: [],
      latestHistoricalRevenue: 1_000_000,
      latestHistoricalEbitda: 150_000,
      fieldValidation,
      globalCapexPct: 4,
      globalDaPct: 3,
      globalNwcPct: 1,
      globalTaxRatePct: 25,
      disabled: true,
      canAddYear: true,
      nextForecastYear: 2026,
      dcfInputMode: 'fcff_only',
      dcfTaxShieldProjections: [1500],
      onDcfInputModeChange,
    })

    props?.onDcfTaxShieldProjectionChange?.(0, 1125)
    const taxShieldUpdate = setFormData.mock.calls[0][0] as (
      previous: ManualValuationFormData
    ) => ManualValuationFormData
    expect(taxShieldUpdate(currentFormData).dcf_tax_shield_projections).toEqual([1125])

    props?.onChange('2025', 'free_cash_flow', 120_000)
    expect(updateYearlyFinancials).toHaveBeenCalledWith('2025', true, 'free_cash_flow', 120_000)

    props?.onRequestRemoveForecastYears?.()
    expect(setShowForecastRemovalConfirm).toHaveBeenCalledWith(true)

    props?.onAddYear()
    const update = setFormData.mock.calls[1][0] as (
      previous: ManualValuationFormData
    ) => ManualValuationFormData
    expect(update(currentFormData).yearlyFinancials).toEqual([
      ...forecastRows,
      { year: '2026', revenue: 0, ebitda: 0, isForecast: true },
    ])
  })

  it('normalizes invalid DCF input mode and restored tax shield projection storage', () => {
    const setFormData = vi.fn()
    const fieldValidation = {
      errors: {},
      warnings: {},
      hasErrors: false,
    } satisfies ManualInputFieldValidation
    const currentFormData = formData({
      yearlyFinancials: forecastRows,
      dcf_input_mode: 'unexpected' as unknown as DcfInputMode,
      dcf_tax_shield_projections: ['1.125' as unknown as number],
    })

    render(
      <DcfForecastWorkspaceSectionStack
        step={7}
        formData={currentFormData}
        forecastRows={forecastRows}
        projectionAutofillRows={[]}
        fieldValidation={fieldValidation}
        onDcfInputModeChange={vi.fn()}
        setFormData={setFormData as React.Dispatch<React.SetStateAction<ManualValuationFormData>>}
        setShowForecastRemovalConfirm={vi.fn()}
        updateYearlyFinancials={vi.fn()}
      />
    )

    const props = mocks.workspaceProps.at(-1)
    expect(props?.dcfInputMode).toBe('ebitda')

    props?.onDcfTaxShieldProjectionChange?.(0, 1125)
    const normalizeUpdate = setFormData.mock.calls[0][0] as (
      previous: ManualValuationFormData
    ) => ManualValuationFormData
    const normalized = normalizeUpdate(currentFormData)
    expect(normalized).not.toBe(currentFormData)
    expect(normalized.dcf_tax_shield_projections).toEqual([1125])
    expect(normalizeUpdate(normalized)).toBe(normalized)

    props?.onDcfTaxShieldProjectionChange?.(2, 900)
    const invalidIndexUpdate = setFormData.mock.calls[1][0] as (
      previous: ManualValuationFormData
    ) => ManualValuationFormData
    expect(invalidIndexUpdate(normalized)).toBe(normalized)
  })
})
