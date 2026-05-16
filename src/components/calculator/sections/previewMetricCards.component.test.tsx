import { render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it } from 'vitest'

import { PreviewMetricCard } from './previewMetricCards'

describe('PreviewMetricCard', () => {
  it('renders the label and value as plain text', () => {
    render(<PreviewMetricCard label="Revenue" value="€1,200,000" />)
    expect(screen.getByText('Revenue')).toBeInTheDocument()
    expect(screen.getByText('€1,200,000')).toBeInTheDocument()
  })

  it('mirrors the label into a title attribute so truncated copy stays discoverable on hover', () => {
    render(<PreviewMetricCard label="Boekhoudkundig eigen vermogen (laatste jaar)" value="—" />)
    const label = screen.getByText('Boekhoudkundig eigen vermogen (laatste jaar)')
    expect(label).toHaveAttribute('title', 'Boekhoudkundig eigen vermogen (laatste jaar)')
  })

  it('applies the overflow-safe Tailwind primitives required to wrap long localized labels', () => {
    // These three classes are load-bearing for our NL/DE label widths.
    // If a refactor drops them the card will overflow its grid cell again,
    // so we assert them explicitly to lock the regression in place.
    const { container } = render(<PreviewMetricCard label="Lorem ipsum dolor" value="€42" />)

    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('min-w-0')

    const labelEl = screen.getByText('Lorem ipsum dolor')
    expect(labelEl.className).toContain('break-words')
    expect(labelEl.className).toContain('leading-tight')

    const valueEl = screen.getByText('€42')
    expect(valueEl.className).toContain('tabular-nums')
    expect(valueEl.className).toContain('break-words')
  })

  it('uses the default emphasis styling when no emphasis is provided', () => {
    const { container } = render(<PreviewMetricCard label="L" value="V" />)
    const root = container.firstElementChild as HTMLElement
    // Default emphasis → softer border + subtler bg + smaller value font.
    expect(root.className).toContain('border-foreground/[0.08]')
    expect(root.className).toContain('bg-foreground/[0.02]')
    const valueEl = screen.getByText('V')
    expect(valueEl.className).toContain('text-sm')
    expect(valueEl.className).not.toContain('text-base')
  })

  it('promotes the card visually when emphasis="primary" (calculation result)', () => {
    const { container } = render(
      <PreviewMetricCard label="Implied EV" value="€500,000" emphasis="primary" />
    )
    const root = container.firstElementChild as HTMLElement
    // Primary emphasis → stronger border + slightly stronger bg + larger value font.
    // This is what marks the implied EV card as "the answer" in the fiscal preview.
    expect(root.className).toContain('border-foreground/15')
    expect(root.className).toContain('bg-foreground/[0.04]')
    const valueEl = screen.getByText('€500,000')
    expect(valueEl.className).toContain('text-base')
  })

  it('omits the hint paragraph when no hint is provided', () => {
    const { container } = render(<PreviewMetricCard label="L" value="V" />)
    // Three direct children would mean: label, value-row, hint. We expect two.
    expect(container.firstElementChild?.children.length).toBe(2)
  })

  it('renders the hint with overflow-safe wrapping when provided', () => {
    render(<PreviewMetricCard label="L" value="V" hint="A multi-word explanatory hint" />)
    const hintEl = screen.getByText('A multi-word explanatory hint')
    expect(hintEl.className).toContain('break-words')
  })

  it('renders the status dot and label when status is provided', () => {
    render(
      <PreviewMetricCard
        label="Recurring revenue"
        value="60%"
        status="excellent"
        statusLabel="Healthy"
      />
    )
    expect(screen.getByText('Healthy')).toBeInTheDocument()
    // Excellent status should colour the value text emerald.
    const valueEl = screen.getByText('60%')
    expect(valueEl.className).toContain('text-emerald-600')
  })

  it('omits the status indicator when status is null/undefined even if a label is provided', () => {
    render(<PreviewMetricCard label="L" value="V" status={null} statusLabel="ignored" />)
    expect(screen.queryByText('ignored')).toBeNull()
    // Value falls back to neutral foreground colour, not a status colour.
    const valueEl = screen.getByText('V')
    expect(valueEl.className).toContain('text-foreground')
    expect(valueEl.className).not.toContain('text-emerald-600')
  })

  it('appends the consumer className without dropping built-in classes', () => {
    const { container } = render(
      <PreviewMetricCard label="L" value="V" className="ring-2 ring-blue-500" />
    )
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('ring-2')
    expect(root.className).toContain('ring-blue-500')
    expect(root.className).toContain('rounded-xl')
  })
})
