import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdvancedAdvisorControlsSection } from './AdvancedAdvisorControlsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const baseProps = {
  step: 6,
  sectorAverageMultiple: 5.5,
  historicalYears: [2023, 2024, 2025],
  onFieldChange: vi.fn(),
}

describe('AdvancedAdvisorControlsSection', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows a required audit-note error when a multiple calibration is applied without a note', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} multipleCalibrationAdjustment={-1} />)

    const noteInput = screen.getByLabelText(/calibrationNote/)

    expect(noteInput).toBeRequired()
    expect(noteInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('calibrationNoteRequired')).toBeInTheDocument()
  })

  it('keeps the calibration note valid when an audit note is supplied', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={0.5}
        multipleCalibrationNote="Opslag wegens sterke klantretentie"
      />
    )

    const noteInput = screen.getByLabelText(/calibrationNote/)

    expect(noteInput).toBeRequired()
    expect(noteInput).toHaveAttribute('aria-invalid', 'false')
    expect(screen.queryByText('calibrationNoteRequired')).not.toBeInTheDocument()
  })

  it('does not render the calibration note field until a calibration is applied', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} multipleCalibrationAdjustment={0} />)

    expect(screen.queryByLabelText(/calibrationNote/)).not.toBeInTheDocument()
  })

  it('initializes weighted historical EBITDA controls with an exact equal split', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} />)

    fireEvent.click(screen.getByRole('radio', { name: 'weightedAverage' }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith(
      'historical_ebitda_weighting_mode',
      'weighted'
    )
    expect(baseProps.onFieldChange).toHaveBeenCalledWith('historical_ebitda_weights', {
      2023: 34,
      2024: 33,
      2025: 33,
    })
  })

  it('renders the prefilled-from-settings hint when advisor defaults were seeded', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={0.5}
        multipleCalibrationNote="seeded from advisor defaults"
        advisorDefaultsAppliedFields={['multiple_calibration_adjustment']}
      />
    )

    expect(screen.getByText('prefilledFromSettings')).toBeInTheDocument()
  })

  it('hides the prefilled-from-settings hint when no advisor defaults were applied', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        advisorDefaultsAppliedFields={[]}
      />
    )

    expect(screen.queryByText('prefilledFromSettings')).not.toBeInTheDocument()
  })

  it('rebalances edited year weights so the total stays at 100%', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        historicalEbitdaWeightingMode="weighted"
        historicalEbitdaWeights={{ 2023: 20, 2024: 30, 2025: 50 }}
      />
    )

    fireEvent.keyDown(screen.getByRole('slider', { name: '2025 historicalWeighting' }), {
      key: 'ArrowRight',
    })

    const [, weights] = baseProps.onFieldChange.mock.calls.at(-1) ?? []

    expect(weights).toEqual({ 2023: 20, 2024: 29, 2025: 51 })
    expect(
      Object.values(weights as Record<number, number>).reduce((sum, value) => sum + value, 0)
    ).toBe(100)
  })
})
