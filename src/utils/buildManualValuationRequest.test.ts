/**
 * Tests for the manual valuation request dispatcher.
 *
 * The dispatcher routes between two builders:
 *   - SME path: `buildValuationRequest` (historical-financials based)
 *   - Venture path: `buildStartupValuationRequest` (qualitative + traction)
 *
 * It picks based on `useManualResultsStore`'s effective method (preSelectedMethod ?? selectedMethod).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualResultsStore } from '@/store/manual/useManualResultsStore'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { buildManualValuationRequest } from './buildManualValuationRequest'

const baseFormData = {
  company_name: 'Acme BV',
  country_code: 'BE',
  industry: 'technology',
  business_model: 'b2b_saas',
  founding_year: 2024,
  current_year_data: {
    year: 2025,
    revenue: 0,
    ebitda: 0,
  },
} as Parameters<typeof buildManualValuationRequest>[0]

describe('buildManualValuationRequest', () => {
  beforeEach(() => {
    useManualResultsStore.setState({
      preSelectedMethod: null,
      selectedMethod: 'upswitch_adaptive',
    })
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('routes to the SME builder by default (upswitch_adaptive)', () => {
    const req = buildManualValuationRequest(baseFormData)
    expect(req.startup_inputs).toBeUndefined()
    expect(req.selected_method ?? '').not.toBe('startup_valuation')
  })

  it('routes to the venture builder when preSelectedMethod is startup_valuation', () => {
    useManualResultsStore.setState({
      preSelectedMethod: 'startup_valuation',
      selectedMethod: 'startup_valuation',
    })
    useStartupValuationStore.getState().setField('stage', 'seed')
    useStartupValuationStore.getState().setField('sector', 'fintech')

    const req = buildManualValuationRequest(baseFormData)

    expect(req.selected_method).toBe('startup_valuation')
    expect(req.user_weights).toEqual({ startup_valuation: 1.0 })
    expect(req.startup_inputs).toBeDefined()
    const startup = req.startup_inputs as Record<string, unknown>
    expect(startup.stage).toBe('seed')
    expect(startup.sector).toBe('fintech')
  })

  it('falls back to selectedMethod when preSelectedMethod is null', () => {
    useManualResultsStore.setState({
      preSelectedMethod: null,
      selectedMethod: 'startup_valuation',
    })
    useStartupValuationStore.getState().setField('stage', 'pre_seed')

    const req = buildManualValuationRequest(baseFormData)
    expect(req.selected_method).toBe('startup_valuation')
    expect((req.startup_inputs as Record<string, unknown>).stage).toBe('pre_seed')
  })

  it('threads locale through to the venture builder', () => {
    useManualResultsStore.setState({
      preSelectedMethod: 'startup_valuation',
      selectedMethod: 'startup_valuation',
    })

    const req = buildManualValuationRequest(baseFormData, undefined, 'nl')
    expect((req as { locale?: string }).locale).toBe('nl')
  })

  it('uses sane defaults for required fields when form data is sparse', () => {
    useManualResultsStore.setState({
      preSelectedMethod: 'startup_valuation',
      selectedMethod: 'startup_valuation',
    })

    const req = buildManualValuationRequest({
      ...baseFormData,
      company_name: undefined,
      country_code: undefined,
    } as typeof baseFormData)

    expect(req.company_name).toBeTruthy()
    expect(req.country_code).toBe('BE')
  })
})
