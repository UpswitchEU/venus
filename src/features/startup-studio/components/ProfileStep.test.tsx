/**
 * ProfileStep — identity-bridge contract.
 *
 * The Studio v2 wizard never re-asks identity fields on the report
 * page; it persists them up-front into `useManualFormStore` so the
 * downstream `buildStartupValuationRequest` has everything it needs.
 *
 * This test pins down the two-way bridge:
 *   1. Typing into the company-name input must write through to the
 *      shared `useManualFormStore.formData.company_name`.
 *   2. Switching country in the Studio must mirror the new ISO code
 *      into `useManualFormStore.formData.country_code` (the field the
 *      Python engine reads via the regional baseline lookup), but ONLY
 *      when the founder explicitly changes it — never as a side-effect
 *      of mounting the component on top of an existing form state.
 *
 * Break either contract and the founder lands on `/reports/[id]` with
 * an empty company name, or with their previously-set country silently
 * overwritten by the Studio default.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileStep } from './ProfileStep'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'

// `next-intl` and the design-system Select pull in heavy modules that
// aren't relevant here; the store-level assertions are framework-free.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

const initialFormSnapshot = useManualFormStore.getState()
const initialStudioSnapshot = useStartupValuationStore.getState()

function setLocation(search: string) {
  window.history.replaceState({}, '', `/en/startup-valuation${search}`)
}

describe('ProfileStep — identity bridge', () => {
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

  it('writes the company name into useManualFormStore as the founder types', () => {
    render(<ProfileStep locale="en" />)

    const input = screen.getByPlaceholderText(/Henchman/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Acme Robotics' } })

    expect(useManualFormStore.getState().formData.company_name).toBe('Acme Robotics')
  })

  it('clamps very long company names to 120 characters to protect downstream stores', () => {
    render(<ProfileStep locale="en" />)
    const input = screen.getByPlaceholderText(/Henchman/i) as HTMLInputElement

    const huge = 'A'.repeat(500)
    fireEvent.change(input, { target: { value: huge } })

    const stored = useManualFormStore.getState().formData.company_name ?? ''
    expect(stored.length).toBeLessThanOrEqual(120)
  })

  it('does NOT overwrite a pre-existing form-store country on mount', () => {
    // Founder previously picked NL elsewhere (e.g. SME flow / KBO prefill).
    useManualFormStore.setState(
      {
        ...useManualFormStore.getState(),
        formData: {
          ...useManualFormStore.getState().formData,
          country_code: 'NL',
        },
      },
      true,
    )
    // Studio store still defaults to 'BE' (the wizard's initial value).
    expect(useStartupValuationStore.getState().country_code).toBe('BE')

    render(<ProfileStep locale="en" />)

    // The mount should not silently mirror the Studio default into the
    // form store — the previously-set NL must survive.
    expect(useManualFormStore.getState().formData.country_code).toBe('NL')
  })

  it('prefills the company name from ?prefilledQuery= on first mount', () => {
    setLocation('?prefilledQuery=Acme%20Robotics')

    render(<ProfileStep locale="en" />)

    expect(useManualFormStore.getState().formData.company_name).toBe('Acme Robotics')
  })

  it('does NOT clobber a typed company name with ?prefilledQuery=', () => {
    useManualFormStore.setState(
      {
        ...useManualFormStore.getState(),
        formData: {
          ...useManualFormStore.getState().formData,
          company_name: 'Existing BV',
        },
      },
      true,
    )
    setLocation('?prefilledQuery=Other%20Co')

    render(<ProfileStep locale="en" />)

    // Founder previously typed something — Mercury's prefill must not
    // silently overwrite it on revisit.
    expect(useManualFormStore.getState().formData.company_name).toBe('Existing BV')
  })

  it('clamps an oversized ?prefilledQuery= value to 120 characters', () => {
    setLocation(`?prefilledQuery=${'A'.repeat(500)}`)

    render(<ProfileStep locale="en" />)

    const stored = useManualFormStore.getState().formData.company_name ?? ''
    expect(stored.length).toBeLessThanOrEqual(120)
    expect(stored.length).toBeGreaterThan(0)
  })
})
