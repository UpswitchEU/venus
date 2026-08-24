import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ManualInputNormalizedData } from '../utils/manualInputNormalizedData'
import { NormalizedEbitdaSummary } from './NormalizedEbitdaSummary'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(',')}` : key,
}))

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div>,
  },
}))

const normalizedData = {
  annualFictiveRentDeduction: 0,
  averageNormalizedEbitda: 283_074,
  totalYearsWithData: 5,
  years: [
    {
      year: 2025,
      ebitda: 190_109,
      isForecast: false,
      fictiveRentDeduction: 0,
      normalizationCount: 2,
      normalizedEbitda: 283_074,
      totalAdjustment: 92_965,
    },
  ],
} as ManualInputNormalizedData

function renderSummary(onViewAllNormalizations = vi.fn()) {
  render(
    <NormalizedEbitdaSummary
      acceptedNormCount={2}
      formatCurrency={(amount) => `€ ${amount.toLocaleString('nl-BE')}`}
      hasEbitdaValue
      hasFinancials
      normalizedData={normalizedData}
      onViewAllNormalizations={onViewAllNormalizations}
      taxLatencyCount={1}
      totalYearsWithEbitda={5}
    />
  )

  return onViewAllNormalizations
}

describe('NormalizedEbitdaSummary', () => {
  it('keeps all populated content and both existing actions wired to the review callback', () => {
    const onViewAllNormalizations = renderSummary()

    expect(screen.getByText('fields.normalizedEbitda')).toBeInTheDocument()
    expect(screen.getByText('€ 283.074')).toBeInTheDocument()
    expect(screen.getByText('(5 years)')).toBeInTheDocument()
    expect(screen.getByText('+€ 92.965')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '2 normalizations:2 / summary:1' }))
    fireEvent.click(screen.getByRole('button', { name: 'reviewAdjustments' }))

    expect(onViewAllNormalizations).toHaveBeenCalledTimes(2)
  })

  it('uses container-sized breakpoints and motion-safe, overflow-safe primitives', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/components/calculator/sections/NormalizedEbitdaSummary.tsx'),
      'utf8'
    )

    expect(source).toContain('@container')
    expect(source).toContain('@[36rem]:flex-row')
    expect(source).toContain('@[22rem]:basis-auto')
    expect(source).not.toContain('sm:flex-row')
    expect(source).toContain('overflow-hidden')
    expect(source).not.toContain('transition-all')
    expect(source).toContain('motion-reduce:!animate-none')
  })
})
