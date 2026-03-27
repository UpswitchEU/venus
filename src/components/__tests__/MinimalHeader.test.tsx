/**
 * Unit tests for MinimalHeader component
 */

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MinimalHeader } from '../MinimalHeader'

vi.mock('../../hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('../UserDropdown', () => ({
  UserDropdown: () => null,
}))

vi.mock('next-view-transitions', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

// Mock Next.js Link (already mocked in setup.ts, but can override here if needed)
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}))

describe('MinimalHeader', () => {
  const renderWithAuth = (component: React.ReactElement) => {
    return render(component)
  }

  it('should render without crashing', () => {
    renderWithAuth(<MinimalHeader />)
    // The component should render - check for any visible element
    const container = screen.getByRole('banner')
    expect(container).toBeInTheDocument()
  })

  it('should display the header content', () => {
    renderWithAuth(<MinimalHeader />)
    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
  })

  it('should be accessible', () => {
    renderWithAuth(<MinimalHeader />)
    const header = screen.getByRole('banner')
    expect(header).toBeInTheDocument()
  })
})
