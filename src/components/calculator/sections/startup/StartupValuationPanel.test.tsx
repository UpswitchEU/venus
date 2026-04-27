/**
 * StartupValuationPanel — unified-shell render contract.
 *
 * Locks in the **canonical 8-section stacked layout** the panel renders
 * inside `ManualLayout`'s left rail when `selected_method=startup_valuation`.
 * The panel hosts the same 7 Studio sections (CompanyCard, Berkus,
 * Scorecard, Pedigree, Traction, Exit, Round) plus the investor-ready
 * preview Report section, all visible at once with Aurora-Teal numbered
 * step headers — the same rhythm DCF / SaaS / NAV / Adaptive use.
 *
 * The submit button is intentionally NOT here; it lives in the canonical
 * `StartupSubmitFooter` rendered by `StartupAwareInputPanel` directly
 * below this panel inside `ManualLayout`.  Surfacing a duplicate submit
 * here would race the auto-fire and confuse the user.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Each Studio section component is replaced with a thin probe so the
// test asserts the orchestration contract (which sections are rendered
// in which order, with what locale) without pulling in the heavy
// design-system deps each section relies on.
vi.mock('@/features/startup-studio/components/CompanyCardStep', () => ({
  CompanyCardStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-company-card" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/BerkusStep', () => ({
  BerkusStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-berkus" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/ScorecardStep', () => ({
  ScorecardStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-scorecard" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/FounderPedigreeStep', () => ({
  FounderPedigreeStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-pedigree" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/TractionStep', () => ({
  TractionStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-traction" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/ExitStoryStep', () => ({
  ExitStoryStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-exit" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/RoundSimulatorStep', () => ({
  RoundSimulatorStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-round" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/ReportStep', () => ({
  ReportStep: ({ locale }: { locale?: string }) => (
    <div data-testid="section-report" data-locale={locale} />
  ),
}))
vi.mock('@/features/startup-studio/components/StudioCoPilot', () => ({
  StudioCoPilot: () => <div data-testid="studio-copilot" />,
}))

// `useStudioIssues` makes a network call we don't want to exercise.
vi.mock('@/features/startup-studio/hooks/useStudioIssues', async () => {
  const actual = await vi.importActual<{
    StudioStepId: unknown
  }>('@/features/startup-studio/hooks/useStudioIssues')
  return {
    ...actual,
    useStudioIssues: () => ({ issues: [], blockers: [], warnings: [] }),
  }
})

// `useStartupBenchmark` hits an SSR-deferred fetch; stub a static row.
vi.mock('@/lib/benchmarks/useStartupBenchmark', () => ({
  useStartupBenchmark: () => ({
    benchmark: {
      country_code: 'BE',
      stage: 'seed',
      sector: 'saas',
      average_pre_money_eur: 1_500_000,
      berkus_max_per_milestone_eur: 500_000,
      exit_multiple_low: 4,
      exit_multiple_high: 8,
      source: 'static',
    },
    isFallback: true,
    publishedAt: '2026-01-01',
  }),
}))

import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { StartupValuationPanel } from './StartupValuationPanel'

describe('StartupValuationPanel — unified shell', () => {
  beforeEach(() => {
    localStorage.removeItem('venus.startup_valuation.v1')
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('renders all 8 canonical sections in order on first paint', () => {
    render(<StartupValuationPanel />)

    // Order matters — the section numerals + Aurora-Teal step circles
    // must match `1. Profile → 2. Risk reduction → 3. Defensibility →
    // 4. Team pedigree → 5. Traction → 6. Exit story → 7. Round → 8. Report`.
    const order = [
      'section-company-card',
      'section-berkus',
      'section-scorecard',
      'section-pedigree',
      'section-traction',
      'section-exit',
      'section-round',
      'section-report',
    ] as const

    for (const id of order) {
      expect(screen.getByTestId(id)).toBeInTheDocument()
    }

    const positions = order.map((id) => screen.getByTestId(id).getBoundingClientRect().top)
    // jsdom returns 0 for every getBoundingClientRect; the order
    // assertion below uses DOM document order instead, which jsdom
    // renders correctly.
    void positions
    const root = screen.getByTestId('section-company-card').parentElement?.parentElement
    expect(root).toBeTruthy()
    const rendered = Array.from(root?.querySelectorAll('[data-testid^="section-"]') ?? []).map(
      (el) => el.getAttribute('data-testid')
    )
    expect(rendered).toEqual([...order])
  })

  it('mounts the StudioCoPilot so the founder can resolve issues from any section', () => {
    render(<StartupValuationPanel />)
    expect(screen.getByTestId('studio-copilot')).toBeInTheDocument()
  })

  it('passes the resolved locale through to every Studio section (default = en)', () => {
    render(<StartupValuationPanel />)
    expect(screen.getByTestId('section-company-card').getAttribute('data-locale')).toBe('en')
    expect(screen.getByTestId('section-report').getAttribute('data-locale')).toBe('en')
  })

  it('uses nl locale when the persisted country is NL', () => {
    useStartupValuationStore.setState({
      ...useStartupValuationStore.getState(),
      country_code: 'NL',
    })
    render(<StartupValuationPanel />)
    expect(screen.getByTestId('section-company-card').getAttribute('data-locale')).toBe('nl')
  })

  it('does not render any submit button — submit lives in StartupSubmitFooter', () => {
    // Guard: a regression that re-introduces a Generate button inside
    // the panel would race the canonical footer's submit and produce
    // duplicate calculate calls.
    render(<StartupValuationPanel />)
    const buttons = screen.queryAllByRole('button')
    for (const btn of buttons) {
      const text = (btn.textContent ?? '').toLowerCase()
      expect(text).not.toMatch(/generate|genereer|calculate|bereken/)
    }
  })
})
