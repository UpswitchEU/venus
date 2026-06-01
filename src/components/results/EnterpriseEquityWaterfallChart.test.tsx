import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { EnterpriseEquityWaterfallChart } from './EnterpriseEquityWaterfallChart'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

describe('EnterpriseEquityWaterfallChart', () => {
  it('renders a running EV-to-equity bridge without invalid SVG geometry', () => {
    const { container } = render(
      <EnterpriseEquityWaterfallChart
        steps={[
          {
            label: 'Enterprise value',
            short_label: 'EV',
            kind: 'base',
            end_value: 1_000_000,
          },
          {
            label: 'Debt',
            short_label: 'Debt',
            kind: 'decrease',
            tone: 'negative',
            start_value: 1_000_000,
            end_value: 650_000,
            delta_value: -350_000,
          },
          {
            label: 'Equity value',
            short_label: 'Equity',
            kind: 'total',
            end_value: 650_000,
          },
        ]}
      />
    )

    const svg = container.querySelector('svg')

    expect(screen.getByLabelText('ariaLabel')).toBeInTheDocument()
    expect(svg).not.toBeNull()
    expect(svg?.outerHTML).not.toContain('NaN')
    expect(svg?.outerHTML).not.toContain('Infinity')
    expect(container.querySelectorAll('line[stroke-dasharray="3 2"]').length).toBeGreaterThan(0)
  })

  it('keeps dense bridge steps inside the SVG viewBox', () => {
    const denseSteps = [
      {
        label: 'Enterprise value',
        short_label: 'EV',
        kind: 'base',
        end_value: 1_000_000,
      },
      ...Array.from({ length: 28 }, (_, index) => {
        const start = 1_000_000 - index * 10_000
        return {
          label: `Adjustment ${index + 1}`,
          short_label: `A${index + 1}`,
          kind: 'decrease',
          tone: 'negative',
          start_value: start,
          end_value: start - 10_000,
          delta_value: -10_000,
        }
      }),
      {
        label: 'Equity value',
        short_label: 'Equity',
        kind: 'total',
        end_value: 720_000,
      },
    ]

    const { container } = render(<EnterpriseEquityWaterfallChart steps={denseSteps} />)
    const svg = container.querySelector('svg')
    const rects = Array.from(container.querySelectorAll('rect')).slice(1)

    expect(svg?.outerHTML).not.toContain('NaN')
    expect(svg?.outerHTML).not.toContain('Infinity')
    expect(rects.length).toBe(denseSteps.length)
    for (const rect of rects) {
      const x = Number(rect.getAttribute('x'))
      const width = Number(rect.getAttribute('width'))
      expect(x).toBeGreaterThanOrEqual(58)
      expect(x + width).toBeLessThanOrEqual(542)
    }
  })
})
