/**
 * StartupSubmitFooter — manual-submit contract.
 *
 * The unified `StartupValuationPanel` has no submit affordance of its
 * own; this footer is the canonical path founders + advisors use to
 * trigger ValuationIQ.  Three guarantees:
 *
 *   1. **Manual click** fires `onSubmit` with a payload that satisfies
 *      the SME-style validators (companyName / businessType /
 *      yearlyFinancials present), even though the validators bypass
 *      them for the venture path.
 *   2. **Disabled** when the company name is missing — protects the
 *      report page from landing on `/reports/{id}` with an empty
 *      identity envelope.
 *   3. **Submit gated on milestone pick**: clicking before any Berkus
 *      milestone is selected is a no-op.  This protects the per-account
 *      result store from a meaningless €0 pre-money against the
 *      all-zero defaults a fresh wizard state produces.
 *
 * The prior auto-fire-on-`?source=studio_v2` contract is gone — the
 * separate Studio v2 wizard is gone too, so there's no round-trip URL
 * signal left to honour.  Submit is always explicit.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Per-file next-intl mock — see StartupAwareInputPanel.test.tsx for
// rationale. Pinning per-file prevents the StartupValuationPanel
// per-file mock from leaking into this file when both run in the
// same vitest process.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  MATURITY_TO_SCORE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { getCurrentFilingYear } from '@/utils/fiscalYear'
import { buildStartupSubmitPayload, StartupSubmitFooter } from './StartupAwareInputPanel'

vi.mock('next/navigation', () => ({
  useParams: () => ({ locale: 'en' }),
  useRouter: () => ({ push: vi.fn() }),
}))

// Submit footer reads its copy from ``startupStudio.submit.*``; the
// review-defaults modal reads from ``startupStudio.reviewGate.*``,
// ``startupStudio.companyCard.stageLabels.*``, and
// ``startupStudio.narrative.sectorLabels.*``.  Stub the next-intl
// provider so component tests don't need to wrap in a
// ``NextIntlClientProvider`` — same shape as MilestoneCard /
// CompanyCard tests, just covers the extra namespaces the gate uses.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, fmt?: Record<string, unknown>) => {
    // Simple `{name}`-style template substitution so the modal's row
    // labels render cleanly without next-intl's full ICU pipeline.
    const map: Record<string, string> = {
      calculating: 'Calculating…',
      generate: 'Generate startup valuation',
      hintMissingCompany:
        'Add the company name above to unlock report generation.',
      hintMissingMilestone:
        'Pick at least one milestone in “Risk reduction” for a defensible valuation.',
      // reviewGate
      title: 'Review your assumptions',
      subtitleWithDefaults: '{count} values are using engine defaults',
      subtitleAllReviewed: 'All reviewed',
      defaultChip: 'default',
      defaultChipTooltip: 'Engine default',
      editBtn: 'Edit',
      cancelBtn: 'Back to wizard',
      confirmBtn: 'Generate report',
      closeAria: 'Close',
      'row.stage': 'Funding stage',
      'row.sector': 'Engine sector',
      'row.y5': 'Year-5 revenue',
      'row.exitMultiple': 'Exit multiple',
      'row.targetRoi': 'Target ROI',
      'row.investment': 'Round size',
      'row.dilution': 'Dilution',
      // stageLabels / sectorLabels passthrough
      pre_seed: 'Pre-seed',
      seed: 'Seed',
      series_a: 'Series A',
      saas: 'SaaS',
      marketplace: 'Marketplace',
      fintech: 'Fintech',
      biotech_healthtech: 'Biotech / Healthtech',
      deeptech_ai: 'Deeptech / AI',
      consumer: 'Consumer',
      hardware: 'Hardware',
      other: 'Cross-sector',
    }
    let out = map[key] ?? key
    if (fmt) {
      for (const [k, v] of Object.entries(fmt)) {
        out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v))
      }
    }
    return out
  },
  useLocale: () => 'en',
}))

// The review-defaults modal subscribes to the live benchmark hook on
// every render — and ``StartupSubmitFooter`` itself now also calls
// ``useStartupBenchmark`` + ``useStudioIssues`` for the studio-issues
// blocker gate.  Stub both with deterministic shapes so the footer
// renders without an Athena fetch + studio-issues feed.
vi.mock('@/lib/benchmarks/useStartupBenchmark', () => ({
  useStartupBenchmark: () => ({
    benchmark: {
      region_code: 'BE',
      stage: 'seed',
      sector: 'saas',
      average_pre_money_eur: 4_000_000,
      berkus_max_per_milestone_eur: 500_000,
      exit_multiple_low: 5,
      exit_multiple_high: 7,
      comparable_exit_revenue_multiple: 6,
    },
    isFallback: false,
  }),
}))
vi.mock('@/features/startup-studio/hooks/useStudioIssues', () => ({
  useStudioIssues: () => ({ issues: [], blockers: [], warnings: [] }),
}))

const initialFormSnapshot = useManualFormStore.getState()
const initialStudioSnapshot = useStartupValuationStore.getState()

function setLocation(search: string) {
  // jsdom exposes a writable `location.search` via history.replaceState.
  window.history.replaceState({}, '', `/en/reports/abc${search}`)
}

describe('StartupSubmitFooter', () => {
  beforeEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
    useStartupValuationStore.setState(initialStudioSnapshot, true)
    setLocation('')
  })

  afterEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
    useStartupValuationStore.setState(initialStudioSnapshot, true)
    setLocation('')
  })

  it('disables the manual submit button when company name is missing', () => {
    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    const btn = screen.getByRole('button', { name: /generate startup valuation/i })
    expect(btn).toBeDisabled()
    fireEvent.click(btn)
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('fires onSubmit only after the review-defaults gate is confirmed', () => {
    // Two-step submit contract (audit issue #7):
    //   1. First click on Generate opens the review-defaults modal.
    //   2. Confirm in the modal fires the real ``onSubmit``.
    // Cancel inside the modal must NEVER reach onSubmit.
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme Robotics',
          country_code: 'NL',
        },
      },
      true
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true
    )

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    // First click: opens the review modal — onSubmit must NOT fire yet.
    fireEvent.click(screen.getByRole('button', { name: /generate startup valuation/i }))
    expect(onSubmit).not.toHaveBeenCalled()

    // The review modal renders a Confirm button (its label is set by
    // the canonical translation key ``confirmBtn`` — "Generate report"
    // in the test stub). Click it to fire the real submit.
    fireEvent.click(screen.getByRole('button', { name: /generate report/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]?.[0]
    expect(payload).toBeDefined()
    expect(payload.companyName).toBe('Acme Robotics')
    expect(payload.country).toBe('NL')
    // The synthetic shape MUST include keys the report UI consumes
    // (setCollectedData reads businessType / industry / yearFounded).
    expect(payload).toHaveProperty('businessType')
    expect(payload).toHaveProperty('industry')
    expect(payload).toHaveProperty('yearFounded')
    expect(Array.isArray(payload.yearlyFinancials)).toBe(true)
  })

  it('opens the review-defaults modal but does NOT submit when the founder cancels', () => {
    // Cancel-path companion to the confirm test above: the modal must
    // open, give the founder a way out, and never silently fire the
    // calculation.
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme Robotics',
        },
      },
      true
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true
    )

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    fireEvent.click(screen.getByRole('button', { name: /generate startup valuation/i }))
    // Cancel button label comes from `cancelBtn` — "Back to wizard" in
    // the test stub.
    fireEvent.click(screen.getByRole('button', { name: /back to wizard/i }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does NOT fire on manual click when no milestone has been picked yet', () => {
    // Founder filled in identity but never touched a Berkus milestone —
    // computing now would produce a meaningless €0 pre-money against
    // the all-zero defaults and pollute the per-account result store.
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true
    )

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)
    fireEvent.click(screen.getByRole('button', { name: /generate startup valuation/i }))

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does NOT fire when a calculation is already in flight', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true
    )

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={true} />)
    // AuroraButton's `loading` prop swaps the label for a spinner, so
    // we can't query the button by text — grab the only button on screen.
    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(0)
    const firstButton = buttons[0]
    if (firstButton) fireEvent.click(firstButton)

    expect(onSubmit).not.toHaveBeenCalled()
  })
})

describe('buildStartupSubmitPayload', () => {
  beforeEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
    useStartupValuationStore.setState(initialStudioSnapshot, true)
  })

  afterEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
    useStartupValuationStore.setState(initialStudioSnapshot, true)
  })

  it('falls back to "Unknown Startup" when the form store has no company_name', () => {
    const payload = buildStartupSubmitPayload()
    expect(payload.companyName).toBe('Unknown Startup')
  })

  it('passes form founding_year through to yearFounded', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme',
          founding_year: 2018,
        },
      },
      true
    )
    expect(buildStartupSubmitPayload().yearFounded).toBe(2018)
  })

  it('uses getCurrentFilingYear for yearFounded when founding_year is unset', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme',
          founding_year: undefined as unknown as number,
        },
      },
      true
    )
    expect(buildStartupSubmitPayload().yearFounded).toBe(
      getCurrentFilingYear(new Date('2026-06-15T12:00:00Z'))
    )
    vi.useRealTimers()
  })

  it('falls back to getCurrentFilingYear when founding_year is out of range', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme',
          founding_year: 0,
        },
      },
      true
    )
    expect(buildStartupSubmitPayload().yearFounded).toBe(
      getCurrentFilingYear(new Date('2026-06-15T12:00:00Z'))
    )
    vi.useRealTimers()
  })

  it('uses the Studio store country when the form store country is empty', () => {
    useStartupValuationStore.setState({ ...initialStudioSnapshot, country_code: 'LU' }, true)
    const payload = buildStartupSubmitPayload()
    expect(payload.country).toBe('LU')
  })

  it('prefers the form-store country when both stores have one', () => {
    useStartupValuationStore.setState({ ...initialStudioSnapshot, country_code: 'LU' }, true)
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, country_code: 'NL' },
      },
      true
    )
    const payload = buildStartupSubmitPayload()
    expect(payload.country).toBe('NL')
  })
})
