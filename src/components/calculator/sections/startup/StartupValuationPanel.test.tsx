/**
 * StartupValuationPanel — unified-shell render contract.
 *
 * Locks in the **canonical 7-section stacked layout** the panel renders
 * inside `ManualLayout`'s left rail when `selected_method=startup_valuation`.
 * The panel hosts the 7 Studio sections (CompanyCard, Berkus, Scorecard,
 * Pedigree, Traction, Exit, Round), all visible at once with Aurora-Teal
 * numbered step headers — the same rhythm DCF / SaaS / NAV / Adaptive use.
 * The retired 8th "Report" preview section duplicated the StudioCoPilot
 * + sticky StartupSubmitFooter and was removed 2026-05-12.
 *
 * The submit button is intentionally NOT here; it lives in the canonical
 * `StartupSubmitFooter` rendered by `StartupAwareInputPanel` directly
 * below this panel inside `ManualLayout`.  Surfacing a duplicate submit
 * here would race the auto-fire and confuse the user.
 */

import { render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const intlLocaleMock = vi.hoisted(() => ({ current: 'en' as string }))

vi.mock('next-intl', () => ({
  useLocale: () => intlLocaleMock.current,
  useTranslations: () => (key: string) => {
    const sectionTitles: Record<string, string> = {
      'sections.profile': 'Profile',
      'sections.berkus': 'Risk reduction',
      'sections.scorecard': 'Defensibility',
      'sections.founder_pedigree': 'Team pedigree',
      'sections.traction': 'Traction',
      'sections.exit_story': 'Exit story',
      'sections.round_simulator': 'Round',
    }
    return sectionTitles[key] ?? key
  },
}))

// Each Studio section component is replaced with a thin probe so the
// test asserts the orchestration contract (which sections are rendered
// in which order, with what locale) without pulling in the heavy
// design-system deps each section relies on.
vi.mock('@/features/startup-studio/components/CompanyCardStep', () => ({
  CompanyCardStep: () => (
    <div data-testid="section-company-card" data-locale={intlLocaleMock.current} />
  ),
}))
vi.mock('@/features/startup-studio/components/BerkusStep', () => ({
  BerkusStep: () => <div data-testid="section-berkus" data-locale={intlLocaleMock.current} />,
}))
vi.mock('@/features/startup-studio/components/ScorecardStep', () => ({
  ScorecardStep: () => <div data-testid="section-scorecard" data-locale={intlLocaleMock.current} />,
}))
vi.mock('@/features/startup-studio/components/FounderPedigreeStep', () => ({
  FounderPedigreeStep: () => (
    <div data-testid="section-pedigree" data-locale={intlLocaleMock.current} />
  ),
}))
vi.mock('@/features/startup-studio/components/TractionStep', () => ({
  TractionStep: () => <div data-testid="section-traction" data-locale={intlLocaleMock.current} />,
}))
vi.mock('@/features/startup-studio/components/ExitStoryStep', () => ({
  ExitStoryStep: () => <div data-testid="section-exit" data-locale={intlLocaleMock.current} />,
}))
vi.mock('@/features/startup-studio/components/RoundSimulatorStep', () => ({
  RoundSimulatorStep: () => (
    <div data-testid="section-round" data-locale={intlLocaleMock.current} />
  ),
}))
vi.mock('@/features/startup-studio/components/StudioCoPilot', () => ({
  StudioCoPilot: () => <div data-testid="studio-copilot" />,
}))

// `useStudioIssues` is mocked so this layout test stays focused on section
// order and does not depend on live-valuation + issue list wiring.
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
    intlLocaleMock.current = 'en'
    localStorage.removeItem('venus.startup_valuation.v1')
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('renders all 7 canonical sections in order on first paint', () => {
    render(<StartupValuationPanel />)

    // Order matters — the panel was reordered 2026-05-10 to lead with the
    // EV/Revenue spine (Exit Story) so M&A readers see the headline math
    // immediately, with Berkus / Scorecard / Pedigree / Traction framed
    // as overlays around it.  Mirrors the SECTIONS array in
    // ``StartupValuationPanel.tsx``.  The 8th "Report" section was
    // retired 2026-05-12 — its banner + jump CTA duplicated the
    // StudioCoPilot FAB / FindingPeek and the sticky StartupSubmitFooter
    // (Aurora "one canonical surface per decision").
    const order = [
      'section-company-card', // 1. Profile
      'section-exit', // 2. Exit story (the EV/Revenue spine)
      'section-berkus', // 3. Risk reduction overlay
      'section-scorecard', // 4. Defensibility overlay
      'section-pedigree', // 5. Team pedigree overlay
      'section-traction', // 6. Traction overlay
      'section-round', // 7. Round simulator
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
    expect(screen.getByTestId('section-round').getAttribute('data-locale')).toBe('en')
  })

  it('uses nl locale when the Next.js route locale is nl (not operating country)', () => {
    intlLocaleMock.current = 'nl'
    useStartupValuationStore.setState({
      ...useStartupValuationStore.getState(),
      country_code: 'BE',
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
