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

  it('fires onSubmit on manual click once a milestone is picked', () => {
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
    // The submit gate refuses to fire against the all-zero default
    // Studio store; pick a milestone so the gate releases.
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
