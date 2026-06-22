import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CompanySearchResponse, CompanySearchResult } from '../../services/registry/types'
import CompanyNameInput from './CompanyNameInput'

interface DeferredSearch {
  promise: Promise<CompanySearchResponse>
  reject: (reason?: unknown) => void
  resolve: (value: CompanySearchResponse) => void
}

interface RegistrySearchRequest {
  country: string
  deferred: DeferredSearch
  limit: number
  query: string
  signal?: AbortSignal
}

const mocks = vi.hoisted(() => {
  const requests: RegistrySearchRequest[] = []

  function createDeferred(): DeferredSearch {
    let resolve: DeferredSearch['resolve'] | undefined
    let reject: DeferredSearch['reject'] | undefined
    const promise = new Promise<CompanySearchResponse>((promiseResolve, promiseReject) => {
      resolve = promiseResolve
      reject = promiseReject
    })

    if (!resolve || !reject) {
      throw new Error('Deferred registry search promise was not initialized')
    }

    return { promise, reject, resolve }
  }

  return {
    requests,
    searchCompanies: vi.fn(
      (query: string, country: string, limit: number, signal?: AbortSignal) => {
        const deferred = createDeferred()
        requests.push({ country, deferred, limit, query, signal })
        return deferred.promise
      }
    ),
  }
})

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock('../../services/registry/registryService', () => ({
  registryService: {
    searchCompanies: mocks.searchCompanies,
  },
}))

vi.mock('../../utils/logger', () => ({
  generalLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}))

function makeCompany(id: string, companyName: string): CompanySearchResult {
  return {
    address: 'Example street 1',
    company_id: id,
    company_name: companyName,
    confidence_score: 0.95,
    country_code: 'BE',
    legal_form: 'BV',
    registration_number: id,
    registry_name: 'KBO',
    registry_url: '',
    result_type: 'company',
    status: 'Active',
  }
}

function makeSearchResponse(query: string, results: CompanySearchResult[]): CompanySearchResponse {
  return {
    requestId: `req-${query}`,
    results,
    success: true,
    total_results: results.length,
  }
}

function renderCompanyNameInput(value: string) {
  return (
    <CompanyNameInput
      countryCode="BE"
      label="Company name"
      name="company_name"
      onChange={vi.fn()}
      placeholder="Company name"
      value={value}
    />
  )
}

describe('CompanyNameInput', () => {
  beforeEach(() => {
    mocks.searchCompanies.mockClear()
    mocks.requests.length = 0
  })

  it('ignores stale registry results while a newer query is pending', async () => {
    const { rerender } = render(renderCompanyNameInput('Acme'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.requests).toHaveLength(1)

    rerender(renderCompanyNameInput('Beta'))
    await act(async () => {
      await Promise.resolve()
    })

    await act(async () => {
      mocks.requests[0].deferred.resolve(
        makeSearchResponse('Acme', [makeCompany('be-1', 'Acme BV')])
      )
    })

    expect(screen.queryByText('Acme BV')).not.toBeInTheDocument()

    await waitFor(() => expect(mocks.requests).toHaveLength(2))

    await act(async () => {
      mocks.requests[1].deferred.resolve(
        makeSearchResponse('Beta', [makeCompany('be-2', 'Beta BV')])
      )
    })

    expect(await screen.findByText('Beta BV')).toBeInTheDocument()
    expect(screen.queryByText('Acme BV')).not.toBeInTheDocument()
  })

  it('retries the current registry query after a search error', async () => {
    render(renderCompanyNameInput('Acme'))

    await act(async () => {
      await Promise.resolve()
    })
    expect(mocks.requests).toHaveLength(1)

    await act(async () => {
      mocks.requests[0].deferred.reject(new Error('Registry unavailable'))
    })

    fireEvent.click(screen.getByRole('button', { name: 'forms.kboLookup.retry' }))

    await waitFor(() => expect(mocks.requests).toHaveLength(2))
    expect(mocks.requests[1]).toMatchObject({
      country: 'BE',
      limit: 200,
      query: 'Acme',
    })
  })
})
