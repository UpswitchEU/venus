import { render, screen } from '@testing-library/react'
import type React from 'react'
import { describe, expect, it, vi } from 'vitest'
import type {
  DcfForecastWorkspaceSectionStackProps,
  DcfGlobalAssumptionsSectionStackProps,
} from '@/lib/methods/dcf'
import type { ManualValuationFormData, YearlyFinancials } from '@/types/valuation'
import type { ManualInputFieldValidation } from '../utils/manualInputFieldValidation'
import { EmbeddedDcfControls } from './EmbeddedDcfControls'

const mocks = vi.hoisted(() => ({
  stackProps: [] as DcfGlobalAssumptionsSectionStackProps[],
  forecastStackProps: [] as DcfForecastWorkspaceSectionStackProps[],
}))

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/lib/methods/dcf/DcfGlobalAssumptionsSectionStack', () => ({
  DcfGlobalAssumptionsSectionStack: (props: DcfGlobalAssumptionsSectionStackProps) => {
    mocks.stackProps.push(props)
    return (
      <div>
        dcf-stack:{props.variant ?? 'full'}:{props.step}
      </div>
    )
  },
}))

vi.mock('@/lib/methods/dcf/DcfForecastWorkspaceSectionStack', () => ({
  DcfForecastWorkspaceSectionStack: (props: DcfForecastWorkspaceSectionStackProps) => {
    mocks.forecastStackProps.push(props)
    return <div>dcf-forecast-stack:{props.step}</div>
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

describe('EmbeddedDcfControls', () => {
  it('reuses the DCF method stack for both embedded assumption surfaces', async () => {
    const setFormData = vi.fn()
    const handleDcfInputModeChange = vi.fn()
    const handleTerminalValueMethodChange = vi.fn()
    const setShowForecastRemovalConfirm = vi.fn()
    const updateYearlyFinancials = vi.fn()
    const inputModeOptions = [
      { value: 'ebitda' as const, label: 'Via EBITDA' },
      { value: 'fcff_only' as const, label: 'FCFF only' },
    ]
    const currentFormData = formData({
      yearlyFinancials: forecastRows,
      dcf_input_mode: 'fcff_only',
      dcf_capex_pct: 4,
      dcf_da_pct: 3,
      dcf_nwc_pct: 1,
      dcf_tax_rate_pct: 25,
    })

    render(
      <EmbeddedDcfControls
        adaptiveDcfGlobalStep={5}
        dcfDefaultsProvenance="both"
        dcfForecastDefaultsStep={6}
        dcfForecastRows={forecastRows}
        dcfForecastWorkspaceStep={7}
        dcfModeSegmentOptions={inputModeOptions}
        dcfProjectionAutofillRows={[]}
        dcfSmartDefaultsFromHistory={null}
        dcfWaccTerminalStep={8}
        fieldValidation={
          { errors: {}, warnings: {}, hasErrors: false } satisfies ManualInputFieldValidation
        }
        formData={currentFormData}
        handleDcfInputModeChange={handleDcfInputModeChange}
        handleTerminalValueMethodChange={handleTerminalValueMethodChange}
        hasDcfSelected
        integrationDerivedCapexPct={5.2}
        integrationDerivedDaPct={2.4}
        isCalculating
        setFormData={setFormData as React.Dispatch<React.SetStateAction<ManualValuationFormData>>}
        setShowForecastRemovalConfirm={setShowForecastRemovalConfirm}
        terminalValueMethod="perpetual_growth"
        updateYearlyFinancials={updateYearlyFinancials}
        waccSectorBand={null}
      />
    )

    expect(await screen.findByText('dcf-stack:forecastDefaultsOnly:6')).toBeInTheDocument()
    expect(await screen.findByText('dcf-stack:discountTerminalOnly:8')).toBeInTheDocument()
    expect(await screen.findByText('dcf-forecast-stack:7')).toBeInTheDocument()
    expect(mocks.stackProps).toHaveLength(2)
    expect(mocks.stackProps[0]).toMatchObject({
      variant: 'forecastDefaultsOnly',
      formData: currentFormData,
      terminalValueMethod: 'perpetual_growth',
      onTerminalValueMethodChange: handleTerminalValueMethodChange,
      showDcfInputModeToggle: true,
      dcfModeSegmentOptions: inputModeOptions,
      onDcfInputModeChange: handleDcfInputModeChange,
      disabled: true,
      dcfDefaultsProvenance: 'both',
      integrationCapexPct: 5.2,
      integrationDaPct: 2.4,
    })
    expect(mocks.stackProps[1]).toMatchObject({
      variant: 'discountTerminalOnly',
      formData: currentFormData,
      terminalValueMethod: 'perpetual_growth',
      onTerminalValueMethodChange: handleTerminalValueMethodChange,
      disabled: true,
      integrationCapexPct: 5.2,
      integrationDaPct: 2.4,
    })
    expect(mocks.forecastStackProps.at(-1)).toMatchObject({
      step: 7,
      formData: currentFormData,
      forecastRows,
      projectionAutofillRows: [],
      disabled: true,
      onDcfInputModeChange: handleDcfInputModeChange,
      setFormData,
      setShowForecastRemovalConfirm,
      updateYearlyFinancials,
    })

    mocks.stackProps[0].onFieldChange('dcf_wacc_pct', 9)
    expect(setFormData).toHaveBeenCalledTimes(1)
    const update = setFormData.mock.calls[0][0] as (
      previous: ManualValuationFormData
    ) => ManualValuationFormData
    expect(update(currentFormData)).toMatchObject({ dcf_wacc_pct: 9 })
  })
})
