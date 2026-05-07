/**
 * OWNER-PROFILING-1 OP-6 — skipped-state watermark.
 *
 * Pins the rendered shape of the Owner Profiling cover-band watermark when
 * the wizard hasn't been completed. The watermark is the front-end half of
 * the Python-side "skipped" branch in `pages/owner_profiling.html` — the
 * two must surface the same CTA copy and ARIA semantics.
 */

import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OwnerProfilingSkippedWatermark } from './OwnerProfilingSkippedWatermark'

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string) => `${namespace}.${key}`,
}))

describe('OwnerProfilingSkippedWatermark', () => {
  afterEach(() => cleanup())

  it('renders the skipped title and body copy', () => {
    render(<OwnerProfilingSkippedWatermark />)
    expect(
      screen.getByText('reportPreview.ownerProfiling.skipped.title')
    ).toBeInTheDocument()
    expect(
      screen.getByText('reportPreview.ownerProfiling.skipped.body')
    ).toBeInTheDocument()
  })

  it('exposes the title via role="note" and aria-label for assistive tech', () => {
    render(<OwnerProfilingSkippedWatermark />)
    const note = screen.getByRole('note')
    expect(note).toHaveAttribute(
      'aria-label',
      'reportPreview.ownerProfiling.skipped.title'
    )
  })

  it('does NOT render a CTA when ctaHref is omitted', () => {
    render(<OwnerProfilingSkippedWatermark />)
    expect(
      screen.queryByText(/cta/)
    ).not.toBeInTheDocument()
  })

  it('renders an anchor CTA when ctaHref is provided', () => {
    render(
      <OwnerProfilingSkippedWatermark ctaHref="/nl/business/onboarding/owner-profiling" />
    )
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute(
      'href',
      '/nl/business/onboarding/owner-profiling'
    )
    expect(link.textContent).toContain(
      'reportPreview.ownerProfiling.skipped.cta'
    )
  })
})
