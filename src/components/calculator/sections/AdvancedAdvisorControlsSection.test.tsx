import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdvancedAdvisorControlsSection } from './AdvancedAdvisorControlsSection'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

vi.mock('../../../utils/getMercuryAppOrigin', () => ({
  resolveMercuryAppOrigin: () => 'https://upswitch.test',
}))

const baseProps = {
  step: 6,
  sectorAverageMultiple: 5.5,
  previewEbitda: 100_000,
  previewCurrencyFormatter: new Intl.NumberFormat('en-BE', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }),
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

  it('keeps fallback consent off by default and requires a reason when enabled', () => {
    const { rerender } = render(<AdvancedAdvisorControlsSection {...baseProps} />)

    const toggle = screen.getByRole('switch', { name: /fallbackToggle/ })
    expect(toggle).not.toBeChecked()
    expect(screen.queryByLabelText(/fallbackReason/)).not.toBeInTheDocument()

    rerender(<AdvancedAdvisorControlsSection {...baseProps} allowUntrustedMultiplesFallback />)
    const reason = screen.getByLabelText(/fallbackReason/)
    expect(reason).toBeRequired()
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('fallbackWarning')).toBeInTheDocument()
  })

  it('clears the fallback rationale when advisor consent is disabled', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        allowUntrustedMultiplesFallback
        untrustedMultiplesFallbackReason="Dossier-specific consent"
      />
    )

    fireEvent.click(screen.getByRole('switch', { name: /fallbackToggle/ }))
    expect(baseProps.onFieldChange).toHaveBeenCalledWith(
      'allow_untrusted_multiples_fallback',
      false
    )
    expect(baseProps.onFieldChange).toHaveBeenCalledWith(
      'untrusted_multiples_fallback_reason',
      undefined
    )
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

  it('requires an audit note when a final effective multiple override is set', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} effectiveMultipleOverride={6} />)

    const noteInput = screen.getByLabelText(/effectiveMultipleOverrideNote/)

    expect(noteInput).toBeRequired()
    expect(noteInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('effectiveMultipleOverrideNoteRequired')).toBeInTheDocument()
  })

  it('emits final effective multiple override changes', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} />)

    fireEvent.change(screen.getByLabelText(/effectiveMultipleOverride/), {
      target: { value: '6.25' },
    })

    expect(baseProps.onFieldChange).toHaveBeenCalledWith('effective_multiple_override', 6.25)
  })

  it('initializes custom historical EBITDA controls on the recency default (50/33/17)', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} />)

    fireEvent.click(screen.getByRole('radio', { name: 'weightedAverage' }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith(
      'historical_ebitda_weighting_mode',
      'weighted'
    )
    expect(baseProps.onFieldChange).toHaveBeenCalledWith('historical_ebitda_weights', {
      2023: 17,
      2024: 33,
      2025: 50,
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
    render(<AdvancedAdvisorControlsSection {...baseProps} advisorDefaultsAppliedFields={[]} />)

    expect(screen.queryByText('prefilledFromSettings')).not.toBeInTheDocument()
  })

  it('updates advisor multiple-type blend weights and keeps the blend at 100%', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} />)

    fireEvent.keyDown(screen.getByRole('slider', { name: 'evRevenueBlend multipleTypeWeight' }), {
      key: 'ArrowRight',
    })

    const call = baseProps.onFieldChange.mock.calls.find(
      ([field]) => field === 'multiple_type_weights'
    )
    const weights = call?.[1] as Record<string, number>
    expect(weights.ev_revenue).toBe(31)
    expect(Object.values(weights).reduce((sum, weight) => sum + weight, 0)).toBe(100)
  })

  it('resets advisor multiple-type blend weights to the model default', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleTypeWeights={{ ev_revenue: 80, ev_ebitda: 20 }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /resetMultipleBlend/ }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith('multiple_type_weights', undefined)
  })

  it('emits the risk-analysis master toggle and discloses pre-adjustment reference mode', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} riskAnalysisEnabled={false} />)

    fireEvent.click(screen.getByRole('switch', { name: /riskAnalysisToggle/ }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith('risk_analysis_enabled', true)
    expect(screen.getByText('preAdjustmentReference')).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'sizeDiscount advisorWeight' })).toHaveAttribute(
      'aria-disabled',
      'true'
    )
  })

  it('updates advisor discount influence multipliers within the engine band', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        advisorDiscountWeights={{ size_discount: 0.5, liquidity_discount: 1.25 }}
      />
    )

    fireEvent.keyDown(screen.getByRole('slider', { name: 'sizeDiscount advisorWeight' }), {
      key: 'ArrowRight',
    })

    expect(baseProps.onFieldChange).toHaveBeenCalledWith('advisor_discount_weights', {
      size_discount: 0.55,
      liquidity_discount: 1.25,
      country_adjustment: 1,
      growth_premium: 1,
      owner_concentration: 1,
    })
  })

  it('updates and resets the defended discount floor alongside discount weights', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        advisorDiscountWeights={{ size_discount: 0.5 }}
        discountFloorFactor={0.4}
      />
    )

    fireEvent.keyDown(screen.getByRole('slider', { name: 'discountFloorAriaLabel' }), {
      key: 'ArrowRight',
    })
    fireEvent.click(screen.getByRole('button', { name: /resetRiskWeights/ }))

    expect(baseProps.onFieldChange).toHaveBeenCalledWith('discount_floor_factor', 0.45)
    expect(baseProps.onFieldChange).toHaveBeenCalledWith('advisor_discount_weights', undefined)
    expect(baseProps.onFieldChange).toHaveBeenCalledWith('discount_floor_factor', undefined)
  })

  it('renders the prefilled-from-settings link with the locale-scoped Mercury settings tab URL', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={0.5}
        multipleCalibrationNote="seeded"
        advisorDefaultsAppliedFields={['multiple_calibration_adjustment']}
      />
    )

    const link = screen.getByRole('link', { name: 'prefilledFromSettingsLink' })
    expect(link).toHaveAttribute('href', 'https://upswitch.test/en/advisor/settings?tab=valuation')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer noopener')
  })

  it('renders the derivation tape with em-dashes when no premium is entered', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} />)

    const tape = screen.getByTestId('advisor-calibration-derivation')

    // Sector value carries through. Premium row shows "—" because nothing
    // has been typed. The calibrated result awaits the engine.
    expect(tape.textContent).toContain('5.50x')
    expect(tape.textContent).toContain('—')
  })

  it('keeps calibration premiums as inputs until the engine recalculates', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={1.25}
        multipleCalibrationNote="strong recurring revenue"
      />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('advisor-calibration-derivation').textContent).toContain('—')
  })

  it('keeps effective overrides as inputs until the engine recalculates', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={0.5}
        multipleCalibrationNote="quality premium"
        effectiveMultipleOverride={7.5}
        effectiveMultipleOverrideNote="final defended multiple"
      />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('advisor-calibration-derivation').textContent).toContain('—')
  })

  it('does not fabricate a live value from risk, blend, floor, or weighting controls', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleTypeWeights={{ ev_ebitda: 30, ev_revenue: 50, pe: 20 }}
        riskAnalysisEnabled={false}
        advisorDiscountWeights={{ size_discount: 0.5, liquidity_discount: 1.25 }}
        discountFloorFactor={0.4}
        historicalEbitdaWeightingMode="weighted"
      />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('advisor-calibration-derivation').textContent).toContain('—')
  })

  it('does not render the live preview without a sector multiple or EBITDA basis', () => {
    const { rerender } = render(
      <AdvancedAdvisorControlsSection {...baseProps} sectorAverageMultiple={null} />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()

    rerender(<AdvancedAdvisorControlsSection {...baseProps} previewEbitda={null} />)

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
  })

  it('formats a positive input premium while leaving the recalculated result pending', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={1.25}
        multipleCalibrationNote="strong recurring revenue"
      />
    )

    const tape = screen.getByTestId('advisor-calibration-derivation')
    expect(tape.textContent).toContain('+1.25')
    // Monetary output comes from the engine after recalculation.
    expect(tape.textContent).not.toContain('6.75x')
    expect(tape.textContent).toContain('—')
  })

  it('formats a negative premium without doubling the sign', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        multipleCalibrationAdjustment={-0.5}
        multipleCalibrationNote="customer concentration risk"
      />
    )

    const tape = screen.getByTestId('advisor-calibration-derivation')
    // toFixed(2) on -0.5 is "-0.50"; we must not prepend another "+".
    expect(tape.textContent).toContain('-0.50')
    expect(tape.textContent).not.toContain('+-0.50')
    expect(tape.textContent).not.toContain('5.00x')
    expect(tape.textContent).toContain('—')
  })

  it('shows an em-dash for sector + calibrated when no sector multiple is available', () => {
    render(<AdvancedAdvisorControlsSection {...baseProps} sectorAverageMultiple={null} />)

    const tape = screen.getByTestId('advisor-calibration-derivation')
    // Three em-dashes: sector row, premium row, calibrated row.
    expect(tape.textContent?.match(/—/g)?.length).toBe(3)
  })

  it('renders the section chrome (step header + section element) in default chrome mode', () => {
    const { container } = render(<AdvancedAdvisorControlsSection {...baseProps} />)
    expect(container.querySelector('section')).not.toBeNull()
    // The valuation section header is rendered for the inline case so that
    // anywhere this is *embedded* (legacy code paths, future preview
    // surfaces) keeps its visual chrome.
    expect(screen.getByText('title')).toBeInTheDocument()
  })

  it('omits the section chrome when chrome="bare" — the modal supplies its own header', () => {
    const { container } = render(<AdvancedAdvisorControlsSection {...baseProps} chrome="bare" />)
    expect(container.querySelector('section')).toBeNull()
    // The body (the rounded inner card with the toggle + calibration block)
    // is still mounted — we only drop the section/header wrapper.
    expect(screen.getByTestId('advisor-calibration-derivation')).toBeInTheDocument()
    // And we do not paint the title twice (modal header owns it).
    expect(screen.queryByText('title')).not.toBeInTheDocument()
  })

  it('does not calculate a SOTP segment valuation in the browser', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        businessTypeSegments={[
          { business_type_id: 'a', applied_multiple: 8, weight: 70 },
          { business_type_id: 'b', applied_multiple: 4, weight: 30 },
        ]}
      />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('advisor-calibration-derivation').textContent).toContain('—')
  })

  it('does not surface a segment-weights change for a single-segment mix', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        businessTypeSegments={[{ business_type_id: 'a', applied_multiple: 8, weight: 100 }]}
      />
    )

    expect(screen.queryByTestId('advisor-controls-active-changes')).not.toBeInTheDocument()
  })

  it('sends overrides and SOTP inputs to the engine without a competing local headline', () => {
    render(
      <AdvancedAdvisorControlsSection
        {...baseProps}
        businessTypeSegments={[
          { business_type_id: 'a', applied_multiple: 8, weight: 70 },
          { business_type_id: 'b', applied_multiple: 4, weight: 30 },
        ]}
        effectiveMultipleOverride={7}
        effectiveMultipleOverrideNote="final defended multiple"
      />
    )

    expect(screen.queryByTestId('advisor-controls-live-preview')).not.toBeInTheDocument()
    expect(screen.getByTestId('advisor-calibration-derivation').textContent).toContain('—')
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
