/**
 * CompanyCardStep — identity-bridge contract.
 *
 * The Studio v2 wizard's first section is the canonical "Company
 * Identification" card shared with every other valuation method.  It
 * never re-asks identity fields on the report page; instead it
 * persists them up-front into `useManualFormStore` so the downstream
 * `buildStartupValuationRequest` has everything it needs to fire the
 * canonical ValuationIQ pipeline on /reports/{id}.
 *
 * This test pins down the load-bearing contracts:
 *   1. Typing a free-text company name writes through to
 *      `useManualFormStore.formData.company_name` — even before the
 *      founder picks a registry hit.
 *   2. Mounting on top of an existing form-store country never
 *      silently overwrites it (a founder who picked NL elsewhere must
 *      not be reset to the Studio default of BE).
 *   3. Mercury's `?prefilledQuery=` deep link seeds the company name
 *      once on mount, never clobbers an existing name, and clamps the
 *      result at 120 characters.
 *
 * Break either contract and the founder lands on `/reports/[id]` with
 * an empty company name, or with their previously-set country silently
 * overwritten by the Studio default — and ValuationIQ refuses to run.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { CompanyCardStep } from './CompanyCardStep'

// `next-intl` and the design-system Select pull in heavy modules that
// aren't relevant here; the store-level assertions are framework-free.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}))

// `useBusinessTypes` hits a network endpoint we don't want to exercise
// from a unit test.  Returning an empty list keeps the dropdown
// rendered (no preview) without changing the bridge contract.
vi.mock('@/hooks/useBusinessTypes', () => ({
  useBusinessTypes: () => ({
    businessTypes: [],
    loading: false,
    error: null,
    refetch: () => {
      /* no-op for tests */
    },
  }),
}))

const initialFormSnapshot = useManualFormStore.getState()
const initialStudioSnapshot = useStartupValuationStore.getState()

function setLocation(search: string) {
  window.history.replaceState({}, '', `/en/startup-valuation${search}`)
}

describe('CompanyCardStep — identity bridge', () => {
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
    render(<CompanyCardStep locale="en" />)

    const input = screen.getByPlaceholderText(/Henchman/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Acme Robotics' } })

    expect(useManualFormStore.getState().formData.company_name).toBe('Acme Robotics')
  })

  it('clamps very long company names to 120 characters', () => {
    render(<CompanyCardStep locale="en" />)
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
      true
    )
    // Studio store still defaults to 'BE' (the wizard's initial value).
    expect(useStartupValuationStore.getState().country_code).toBe('BE')

    render(<CompanyCardStep locale="en" />)

    // The mount must not silently mirror the Studio default into the
    // form store — the previously-set NL must survive.
    expect(useManualFormStore.getState().formData.country_code).toBe('NL')
  })

  it('prefills the company name from ?prefilledQuery= on first mount', () => {
    setLocation('?prefilledQuery=Acme%20Robotics')

    render(<CompanyCardStep locale="en" />)

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
      true
    )
    setLocation('?prefilledQuery=Other%20Co')

    render(<CompanyCardStep locale="en" />)

    expect(useManualFormStore.getState().formData.company_name).toBe('Existing BV')
  })

  it('clamps an oversized ?prefilledQuery= value to 120 characters', () => {
    setLocation(`?prefilledQuery=${'A'.repeat(500)}`)

    render(<CompanyCardStep locale="en" />)

    const stored = useManualFormStore.getState().formData.company_name ?? ''
    expect(stored.length).toBeLessThanOrEqual(120)
    expect(stored.length).toBeGreaterThan(0)
  })
})
