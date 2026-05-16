/**
 * Vitest Test Setup File for Next.js App Router
 *
 * Global test configuration and mocks for Next.js 13+ App Router
 */

import diagnosticsChannel from 'node:diagnostics_channel'
import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import React from 'react'
import { afterEach, vi } from 'vitest'

const diagnosticsChannelCompat = diagnosticsChannel as typeof diagnosticsChannel & {
  tracingChannel?: (name: string) => {
    hasSubscribers: boolean
    traceSync: <T>(
      fn: (...args: unknown[]) => T,
      store: unknown,
      thisArg: unknown,
      ...args: unknown[]
    ) => T
  }
}

if (typeof diagnosticsChannelCompat.tracingChannel !== 'function') {
  diagnosticsChannelCompat.tracingChannel = () => ({
    hasSubscribers: false,
    traceSync: (fn, _store, thisArg, ...args) => fn.apply(thisArg, args),
  })
}

// Cleanup after each test
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// Mock Next.js router
const mockRouter = {
  push: vi.fn(),
  replace: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
}
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}))

// Mock next-view-transitions (useTransitionRouter returns same API as useRouter)
vi.mock('next-view-transitions', () => ({
  useTransitionRouter: () => mockRouter,
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => React.createElement('a', { href, ...props }, children),
}))

// Default global mock for next-intl. The framework reads its
// translation context from a React provider that isn't mounted in
// vitest's jsdom environment, so any component calling
// `useTranslations`/`useLocale` outside a per-file mock crashed
// once parallel worker shards started rendering them. The mock
// returns the i18n key verbatim — tests asserting on copy compare
// against keys (e.g. `startupStudio.panelHeader.title`), and tests
// that don't read copy ignore the strings entirely. Per-file
// `vi.mock('next-intl', …)` calls (e.g. StartupValuationPanel.test)
// still override this with their own translation map; vitest's
// hoisted-mock semantics make the per-file mock win.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

// Mock Next.js Image component
vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // Return a simple img element using React.createElement
    return React.createElement('img', props)
  },
}))

// Mock Next.js Link component
vi.mock('next/link', () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode
    href: string
    [key: string]: unknown
  }) => {
    return React.createElement('a', { href, ...props }, children)
  },
}))

// Mock window.matchMedia when the current test environment provides a DOM.
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

// Mock fetch
global.fetch = vi.fn()

// Use jsdom's built-in localStorage/sessionStorage so setItem/getItem persist.
// (A prior vi.fn() mock broke any code that wrote then read storage in tests.)

// Suppress console errors in tests (optional - comment out if you want to see them)
// Note: This is commented out by default to help with debugging
// Uncomment if you want to suppress console output during tests
/*
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})
*/
