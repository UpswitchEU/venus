import React from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HistoricalDataInputs } from '../HistoricalDataInputs'

vi.mock('../../../store/useEbitdaNormalizationStore', () => ({
  useEbitdaNormalizationStore: () => ({
    openNormalizationModal: vi.fn(),
    hasNormalization: vi.fn(() => false),
    getNormalizedEbitda: vi.fn(() => null),
    getTotalAdjustments: vi.fn(() => 0),
    getAdjustmentCount: vi.fn(() => 0),
    getLastUpdated: vi.fn(() => null),
    removeNormalization: vi.fn(),
  }),
}))

vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: { session?: { reportId?: string } }) => unknown) =>
    selector({ session: { reportId: 'report-1' } }),
}))

describe('HistoricalDataInputs', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows the prior two historical filing years in Q1', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    render(
      <HistoricalDataInputs
        historicalInputs={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('2023')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('2024')).not.toBeInTheDocument()
  })

  it('moves the window forward after the April cutoff', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-01T12:00:00Z'))

    render(
      <HistoricalDataInputs
        historicalInputs={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
      />
    )

    expect(screen.getByDisplayValue('2024')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2023')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('2022')).not.toBeInTheDocument()
  })

  it('does not hide historical rows when founding year is recent (pre-founding years stay visible)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-26T12:00:00Z'))

    render(
      <HistoricalDataInputs
        historicalInputs={{}}
        onChange={vi.fn()}
        onBlur={vi.fn()}
        foundingYear={2025}
      />
    )

    expect(screen.getByDisplayValue('2023')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2022')).toBeInTheDocument()
  })
})
