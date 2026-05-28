import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { VenusAiDockPortal } from './VenusAiDockPortal'

describe('VenusAiDockPortal', () => {
  it('renders children on document.body after mount', () => {
    render(
      <VenusAiDockPortal>
        <div data-testid="dock-portal-child">dock</div>
      </VenusAiDockPortal>
    )

    const child = screen.getByTestId('dock-portal-child')
    expect(child).toBeInTheDocument()
    expect(child.parentElement).toBe(document.body)
  })
})
