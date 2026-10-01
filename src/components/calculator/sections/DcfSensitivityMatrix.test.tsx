import { render, screen, within } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DcfSensitivityMatrix } from './DcfSensitivityMatrix'

const translations: Record<string, string> = {
  sensitivityTitle: 'DCF sensitivity matrix',
  sensitivityDescription: 'Enterprise value under +/-1 point changes in WACC and terminal growth.',
  sensitivityDescriptionExitMultiple:
    'Enterprise value under +/-1 point changes in WACC and exit multiple.',
  sensitivityWaccHeader: 'WACC / g',
  sensitivityWaccExitHeader: 'WACC / exit',
  sensitivityUnavailableNote: '—: scenario unavailable under the stated assumptions.',
  sensitivityApvDescription: 'Each scenario includes the admitted financing tax shield once.',
  sensitivityApvGrowthHeader: 'Base return / g',
  sensitivityApvExitHeader: 'Base return / exit',
  sensitivityApvFixedRateNote:
    'The explicit tax-shield rate stays fixed across base-return scenarios.',
  sensitivityApvBaseRateNote: 'The tax-shield rate follows the base return as an assumption.',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
  useLocale: () => 'en',
}))

describe('DcfSensitivityMatrix', () => {
  it.each([
    [
      'terminal_growth',
      'base_rate_assumption',
      'Base return / g',
      'The tax-shield rate follows the base return as an assumption.',
    ],
    [
      'exit_multiple',
      'explicit_tax_shield_rate',
      'Base return / exit',
      'The explicit tax-shield rate stays fixed across base-return scenarios.',
    ],
  ])('renders APV basis and rate policy for %s', (axis, policy, header, note) => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: [0.12],
          secondary_values: [axis === 'exit_multiple' ? 5 : 0.02],
          secondary_axis_key: axis,
          ev_matrix: [[120000]],
          value_basis: 'apv_enterprise_value',
          apv_discount_rate_source: policy,
        }}
      />
    )
    expect(screen.getByText(header)).toBeInTheDocument()
    expect(screen.getByText(note)).toBeInTheDocument()
    expect(
      screen.getByText('Each scenario includes the admitted financing tax shield once.')
    ).toBeInTheDocument()
    expect(screen.queryByText('WACC / g')).not.toBeInTheDocument()
    expect(screen.getByText('€120,000')).toBeInTheDocument()
  })

  it('renders nothing when no data is available', () => {
    const { container } = render(<DcfSensitivityMatrix sensitivityData={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders a 3x3 DCF sensitivity matrix', () => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: [0.09, 0.1, 0.11],
          growth_values: [0.01, 0.02, 0.03],
          ev_matrix: [
            [2_900_000, 3_000_000, 3_100_000],
            [2_400_000, 2_500_000, 2_600_000],
            [2_000_000, 2_100_000, 2_200_000],
          ],
        }}
      />
    )

    expect(screen.getAllByText('DCF sensitivity matrix')).toHaveLength(2)
    expect(screen.getByText('WACC / g')).toBeInTheDocument()
    // WACC row 10% (ratio formatter + locale may use 10% vs 10,0%)
    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getAllByText('€3M').length).toBeGreaterThan(0)
  })

  it('renders exit multiple sensitivity semantics when provided', () => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: [0.09, 0.1, 0.11],
          secondary_values: [5, 6, 7],
          secondary_axis_key: 'exit_multiple',
          secondary_axis_format: 'multiple',
          ev_matrix: [
            [2_700_000, 2_900_000, 3_100_000],
            [2_300_000, 2_500_000, 2_700_000],
            [2_000_000, 2_200_000, 2_400_000],
          ],
        }}
      />
    )

    expect(screen.getByText('WACC / exit')).toBeInTheDocument()
    // Component uses Unicode multiplication sign (×, U+00D7) — better typography than ASCII x.
    expect(screen.getByText('6×')).toBeInTheDocument()
    expect(
      screen.getByText('Enterprise value under +/-1 point changes in WACC and exit multiple.')
    ).toBeInTheDocument()
  })

  it('normalizes localized persisted matrix values and suppresses NaN cells', () => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: ['0,09', '0,10', '0,11'],
          growth_values: ['0,01', '0,02', '0,03'],
          ev_matrix: [
            ['2.900.000', '3.000.000', 'bad'],
            ['2.400.000', '2.500.000', '2.600.000'],
            ['bad'],
          ],
        }}
      />
    )

    expect(screen.getByText('10%')).toBeInTheDocument()
    expect(screen.getAllByText('€3M').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('NaN')
    expect(screen.queryByText('€0')).not.toBeInTheDocument()
    expect(screen.getAllByText('—')).toHaveLength(4)
  })

  it('keeps missing cells and rows at their original positions and retains real zero', () => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: [0.02, 0.03, 0.04],
          growth_values: [0.01, 0.02, 0.03],
          ev_matrix: [
            [0, null, 250_000],
            [undefined, 500_000],
          ],
        }}
      />
    )
    const rows = screen.getAllByRole('row').slice(1)
    expect(
      within(rows[0])
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['2%', '€0', '—', '€250,000'])
    expect(
      within(rows[1])
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['3%', '—', '€500,000', '—'])
    expect(
      within(rows[2])
        .getAllByRole('cell')
        .map((cell) => cell.textContent)
    ).toEqual(['4%', '—', '—', '—'])
    expect(screen.getByText(translations.sensitivityUnavailableNote)).toBeInTheDocument()
  })

  it.each([
    'wacc_values',
    'growth_values',
  ])('rejects a malformed %s without shifting values', (axis) => {
    const data = {
      wacc_values: [0.02, 0.03],
      growth_values: [0.01, 0.02],
      ev_matrix: [
        [1, 2],
        [3, 4],
      ],
      [axis]: [null, 0.02],
    }
    const { container } = render(<DcfSensitivityMatrix sensitivityData={data} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('highlights the persisted base coordinates when they are not the middle cell', () => {
    render(
      <DcfSensitivityMatrix
        sensitivityData={{
          wacc_values: [0.02, 0.03],
          growth_values: [0.01, 0.02],
          base_wacc: '0.02',
          base_secondary_value: '0.01',
          ev_matrix: [
            [123_000, null],
            [234_000, 345_000],
          ],
        }}
      />
    )
    expect(screen.getByText('€123,000')).toHaveClass('bg-primary/10')
    expect(screen.getByText('€345,000')).not.toHaveClass('bg-primary/10')
  })
})
