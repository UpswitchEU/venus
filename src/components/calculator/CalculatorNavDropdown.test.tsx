import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Dropdown } from './CalculatorNavDropdown'

const originalInnerWidth = window.innerWidth
const originalInnerHeight = window.innerHeight
const originalMatchMedia = window.matchMedia
const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')

describe('CalculatorNavDropdown', () => {
  it('opens by keyboard, skips disabled items, wraps, and restores focus on Escape', () => {
    render(
      <Dropdown trigger={<button type="button">Actions</button>}>
        <button type="button" disabled>
          Unavailable
        </button>
        <button type="button">First</button>
        <button type="button">Last</button>
      </Dropdown>
    )
    const trigger = screen.getByRole('button', { name: 'Actions' })
    trigger.focus()
    fireEvent.keyDown(trigger, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Last' }), { key: 'Home' })
    expect(screen.getByRole('button', { name: 'First' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'First' }), { key: 'End' })
    expect(screen.getByRole('button', { name: 'Last' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Last' }), { key: 'Escape' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('preserves text editing keys inside searchable menus', () => {
    render(
      <Dropdown keepOpen trigger={<button type="button">Search menu</button>}>
        <input aria-label="Search" />
        <button type="button">Result</button>
      </Dropdown>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Search menu' }))
    const input = screen.getByRole('textbox', { name: 'Search' })
    input.focus()
    fireEvent.keyDown(input, { key: 'Home' })
    expect(input).toHaveFocus()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.getByRole('button', { name: 'Search menu' })).toHaveFocus()
  })
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 320 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 360 })
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(max-width: 767px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }))

    HTMLElement.prototype.getBoundingClientRect = function getBoundingClientRect() {
      if (this.tagName === 'NAV') {
        return DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 103 })
      }

      if (this.querySelector('[data-testid="dropdown-trigger"]')) {
        return DOMRect.fromRect({ x: 56, y: 0, width: 200, height: 44 })
      }

      if (this.id) {
        return DOMRect.fromRect({ x: 0, y: 0, width: 296, height: 240 })
      }

      return originalGetBoundingClientRect.call(this)
    }

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get() {
        return this.id ? 296 : 0
      },
    })
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    })
  })

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight })
    window.matchMedia = originalMatchMedia
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect
    if (originalOffsetWidth) {
      Object.defineProperty(HTMLElement.prototype, 'offsetWidth', originalOffsetWidth)
    }
    if (originalVisualViewport) {
      Object.defineProperty(window, 'visualViewport', originalVisualViewport)
    } else {
      Object.defineProperty(window, 'visualViewport', {
        configurable: true,
        value: undefined,
      })
    }
    vi.restoreAllMocks()
  })

  it('clamps mobile menus below the full calculator nav and inside the viewport', async () => {
    render(
      <nav>
        <Dropdown
          avoidViewportOverflow="mobile"
          trigger={
            <button type="button" data-testid="dropdown-trigger">
              Company
            </button>
          }
        >
          <div role="menu">Recent valuations</div>
        </Dropdown>
      </nav>
    )

    fireEvent.click(screen.getByTestId('dropdown-trigger'))

    const menu = await screen.findByRole('menu')
    const dropdownSurface = menu.parentElement

    expect(dropdownSurface).not.toBeNull()
    await waitFor(() => {
      expect(dropdownSurface).toHaveStyle({
        left: '12px',
        top: '111px',
        maxHeight: '237px',
        maxWidth: '296px',
        overflowY: 'auto',
      })
    })
  })

  it('repositions an open mobile menu after viewport changes', async () => {
    render(
      <nav>
        <Dropdown
          avoidViewportOverflow="mobile"
          trigger={
            <button type="button" data-testid="dropdown-trigger">
              Company
            </button>
          }
        >
          <div role="menu">Recent valuations</div>
        </Dropdown>
      </nav>
    )

    fireEvent.click(screen.getByTestId('dropdown-trigger'))

    const menu = await screen.findByRole('menu')
    const dropdownSurface = menu.parentElement

    expect(dropdownSurface).not.toBeNull()
    await waitFor(() => expect(dropdownSurface).toHaveStyle({ left: '12px' }))

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 })
    window.dispatchEvent(new Event('resize'))

    await waitFor(() => {
      expect(dropdownSurface).toHaveStyle({
        left: '56px',
        top: '111px',
      })
    })
  })

  it('uses visual viewport bounds when mobile browser chrome changes the visible area', async () => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: {
        offsetLeft: 10,
        offsetTop: 40,
        width: 300,
        height: 260,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    })

    render(
      <nav>
        <Dropdown
          avoidViewportOverflow="mobile"
          trigger={
            <button type="button" data-testid="dropdown-trigger">
              Company
            </button>
          }
        >
          <div role="menu">Recent valuations</div>
        </Dropdown>
      </nav>
    )

    fireEvent.click(screen.getByTestId('dropdown-trigger'))

    const menu = await screen.findByRole('menu')
    const dropdownSurface = menu.parentElement

    expect(dropdownSurface).not.toBeNull()
    await waitFor(() => {
      expect(dropdownSurface).toHaveStyle({
        left: '22px',
        top: '151px',
        maxHeight: '137px',
        maxWidth: '276px',
      })
    })
  })

  it('falls back to window width when matchMedia is unavailable', async () => {
    window.matchMedia = undefined as never

    render(
      <nav>
        <Dropdown
          avoidViewportOverflow="mobile"
          trigger={
            <button type="button" data-testid="dropdown-trigger">
              Company
            </button>
          }
        >
          <div role="menu">Recent valuations</div>
        </Dropdown>
      </nav>
    )

    fireEvent.click(screen.getByTestId('dropdown-trigger'))

    const menu = await screen.findByRole('menu')
    const dropdownSurface = menu.parentElement

    expect(dropdownSurface).not.toBeNull()
    await waitFor(() => {
      expect(dropdownSurface).toHaveStyle({
        left: '12px',
        top: '111px',
        maxWidth: '296px',
      })
    })
  })
})
