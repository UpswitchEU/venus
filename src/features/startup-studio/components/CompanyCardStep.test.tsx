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

const businessTypeFixtures = vi.hoisted(() => ({
  accountingType: {
    id: 'accounting',
    title: 'Accounting practice',
    description: '',
    icon: 'chart',
    category: 'Professional Services',
    category_id: 'professional-services',
    industryMapping: 'professional-services',
    keywords: [],
    popular: false,
    primaryMultiple: {
      label: 'EV/EBITDA',
      basis: 'EBITDA',
      median: 5.4,
    },
    status: 'active',
    createdAt: '',
    updatedAt: '',
  },
  taxType: {
    id: 'tax-advisory',
    title: 'Tax advisory',
    description: '',
    icon: 'briefcase',
    category: 'Professional Services',
    category_id: 'professional-services',
    industryMapping: 'professional-services',
    keywords: [],
    popular: false,
    primaryMultiple: {
      label: 'EV/EBITDA',
      basis: 'EBITDA',
      median: 6.1,
    },
    status: 'active',
    createdAt: '',
    updatedAt: '',
  },
}))

// `next-intl` and the design-system Select pull in heavy modules that
// aren't relevant here; the store-level assertions are framework-free.
vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) => {
    if (namespace === 'startupStudio.companyCard') {
      const map: Record<string, string> = {
        operatingCountry: 'Operating country',
        searchCompanyNl: 'Company name or KVK number',
        searchCompanyBe: 'Company name or KBO number',
        registryNl: 'Search the KvK trade registry.',
        registryBe: 'Search the KBO registry.',
        registryPdf: 'Shows up on your investor-ready PDF report.',
        companyNameFallback: 'Or: type your company name',
        companyNamePlaceholder: 'e.g. Henchman',
        businessType: 'Business type (sector)',
        legalForm: 'Legal form',
        fundingStage: 'Funding stage',
        seriesANudge: 'Series A nudge',
        seedRevenueNudge: 'Seed nudge {mrr}',
        roundRaised: 'Round size to raise (€)',
        pitchLabel: 'One-line pitch (optional)',
        pitchPlaceholder: 'Pitch placeholder',
      }
      if (key === 'seedRevenueNudge') return 'Seed nudge'
      return map[key] ?? key
    }
    return key
  },
  useLocale: () => 'en',
}))

// `useBusinessTypes` hits a network endpoint we don't want to exercise
// from a unit test.  The fixtures keep the selector/KBO bridge deterministic.
vi.mock('@/hooks/useBusinessTypes', () => ({
  useBusinessTypes: () => ({
    businessTypes: [businessTypeFixtures.accountingType, businessTypeFixtures.taxType],
    loading: false,
    error: null,
    refetch: () => {
      /* no-op for tests */
    },
  }),
}))

vi.mock('@/components/BusinessTypeSelector', () => ({
  BusinessTypeSelector: ({
    label,
    onSelectionChange,
    value,
  }: {
    label: string
    onSelectionChange?: (ids: string[], businessTypes: unknown[]) => void
    value: string[]
  }) => (
    <button
      type="button"
      data-testid="business-type-selector"
      onClick={() =>
        onSelectionChange?.(
          ['accounting', 'tax-advisory'],
          [businessTypeFixtures.accountingType, businessTypeFixtures.taxType]
        )
      }
    >
      {label}:{value.join(',')}
    </button>
  ),
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

  it('stores multi business-type selections as canonical segments with multiples', () => {
    render(<CompanyCardStep locale="en" />)

    fireEvent.click(screen.getByTestId('business-type-selector'))

    expect(useManualFormStore.getState().formData).toMatchObject({
      business_type_id: 'accounting',
      business_type_title: 'Accounting practice',
      business_type_segments: [
        {
          business_type_id: 'accounting',
          business_type_title: 'Accounting practice',
          basis: 'EBITDA',
          multiple: 5.4,
        },
        {
          business_type_id: 'tax-advisory',
          business_type_title: 'Tax advisory',
          basis: 'EBITDA',
          multiple: 6.1,
        },
      ],
    })
  })
})
