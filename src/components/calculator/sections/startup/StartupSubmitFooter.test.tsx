/**
 * StartupSubmitFooter — auto-fire + manual submit contract.
 *
 * The legacy `StartupValuationPanel` has no submit affordance of its
 * own; this footer is the only path founders have for triggering the
 * engine.  Three guarantees we MUST keep:
 *
 *   1. **Manual click** always fires `onSubmit` with a payload that
 *      satisfies the SME-style validators (companyName / businessType /
 *      yearlyFinancials present), even though the validators bypass
 *      them for the venture path.
 *   2. **Auto-fire** runs exactly once on mount when the URL carries
 *      `?source=studio_v2` AND the founder has actually picked at
 *      least one milestone.  Re-renders or repeated mounts must NOT
 *      re-fire.
 *   3. **Auto-fire bails** when the Studio store is at default state
 *      (no maturity picked) — protects shared deep-links from
 *      computing meaningless €0 valuations against zeros.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StartupSubmitFooter,
  buildStartupSubmitPayload,
} from './StartupAwareInputPanel'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import {
  MATURITY_TO_SCORE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { getCurrentFilingYear } from '@/utils/fiscalYear'

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

  it('fires onSubmit on manual click with the synthetic payload shape', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          company_name: 'Acme Robotics',
          country_code: 'NL',
        },
      },
      true,
    )

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    fireEvent.click(screen.getByRole('button', { name: /generate startup valuation/i }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const payload = onSubmit.mock.calls[0]![0]
    expect(payload.companyName).toBe('Acme Robotics')
    expect(payload.country).toBe('NL')
    // The synthetic shape MUST include keys the report UI consumes
    // (setCollectedData reads businessType / industry / yearFounded).
    expect(payload).toHaveProperty('businessType')
    expect(payload).toHaveProperty('industry')
    expect(payload).toHaveProperty('yearFounded')
    expect(Array.isArray(payload.yearlyFinancials)).toBe(true)
  })

  it('auto-fires once when arriving from Studio v2 with a milestone picked', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true,
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true,
    )
    setLocation('?source=studio_v2')

    const onSubmit = vi.fn()
    const { rerender } = render(
      <StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />,
    )

    expect(onSubmit).toHaveBeenCalledTimes(1)

    // Re-renders must not re-fire (autoFiredRef latches true).
    rerender(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })

  it('does NOT auto-fire when the URL is missing source=studio_v2', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true,
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true,
    )
    setLocation('?source=mercury')

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does NOT auto-fire when the Studio store has no milestone picked (default state)', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true,
    )
    setLocation('?source=studio_v2')

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={false} />)

    // Founder hit the deep-link without going through the wizard
    // (cleared localStorage / shared link).  Auto-fire must bail so we
    // don't compute a €0 pre-money against the all-zero defaults.
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('does NOT auto-fire while a calculation is already in flight', () => {
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, company_name: 'Acme' },
      },
      true,
    )
    useStartupValuationStore.setState(
      {
        ...initialStudioSnapshot,
        maturity: { ...initialStudioSnapshot.maturity, sound_idea: 'strong' },
        sound_idea: MATURITY_TO_SCORE.strong,
      },
      true,
    )
    setLocation('?source=studio_v2')

    const onSubmit = vi.fn()
    render(<StartupSubmitFooter onSubmit={onSubmit} isCalculating={true} />)

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
      true,
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
      true,
    )
    expect(buildStartupSubmitPayload().yearFounded).toBe(
      getCurrentFilingYear(new Date('2026-06-15T12:00:00Z')),
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
      true,
    )
    expect(buildStartupSubmitPayload().yearFounded).toBe(
      getCurrentFilingYear(new Date('2026-06-15T12:00:00Z')),
    )
    vi.useRealTimers()
  })

  it('uses the Studio store country when the form store country is empty', () => {
    useStartupValuationStore.setState(
      { ...initialStudioSnapshot, country_code: 'LU' },
      true,
    )
    const payload = buildStartupSubmitPayload()
    expect(payload.country).toBe('LU')
  })

  it('prefers the form-store country when both stores have one', () => {
    useStartupValuationStore.setState(
      { ...initialStudioSnapshot, country_code: 'LU' },
      true,
    )
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: { ...initialFormSnapshot.formData, country_code: 'NL' },
      },
      true,
    )
    const payload = buildStartupSubmitPayload()
    expect(payload.country).toBe('NL')
  })
})
