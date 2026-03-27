import React from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DcfSensitivityMatrix } from './DcfSensitivityMatrix'

const translations: Record<string, string> = {
  sensitivityTitle: 'DCF sensitivity matrix',
  sensitivityDescription: 'Enterprise value under +/-1 point changes in WACC and terminal growth.',
  sensitivityDescriptionExitMultiple: 'Enterprise value under +/-1 point changes in WACC and exit multiple.',
  sensitivityWaccHeader: 'WACC / g',
  sensitivityWaccExitHeader: 'WACC / exit',
}

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => translations[key] ?? key,
  useLocale: () => 'en',
}))

describe('DcfSensitivityMatrix', () => {
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
    expect(screen.getByText('10,0%')).toBeInTheDocument()
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
    expect(screen.getByText(/6[,.]0x/)).toBeInTheDocument()
    expect(
      screen.getByText('Enterprise value under +/-1 point changes in WACC and exit multiple.')
    ).toBeInTheDocument()
  })
})
