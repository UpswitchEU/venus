import { act, fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { KBOCompany } from './entity-search/EntitySearchTypes'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, number>) =>
    typeof values?.count === 'number' ? `${key}:${values.count}` : key,
}))

import { KBOSearchInput } from './EntitySearch'

const bakkerAldoFixture: KBOCompany = {
  id: '0631747439',
  name: 'Bakker Aldo',
  kboNumber: '0631747439',
  legalForm: 'Besloten vennootschap met beperkte aansprakelijkhe',
  address: '2018 Antwerpen',
  postalCode: '2018',
  city: 'Antwerpen',
  naceCode: '47241',
  naceDescription: 'Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade',
  countryCode: 'BE',
}

interface Deferred<T> {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] | undefined
  let reject: Deferred<T>['reject'] | undefined
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })

  if (!resolve || !reject) {
    throw new Error('Deferred promise was not initialized')
  }

  return { promise, reject, resolve }
}

function makeCompany(id: string, name: string): KBOCompany {
  return {
    id,
    name,
    kboNumber: id,
    legalForm: 'BV',
    address: 'Example street 1',
    postalCode: '1000',
    city: 'Brussel',
    countryCode: 'BE',
  }
}

function TestHarness({
  searchFn,
  selectedCompany = null,
}: {
  searchFn: (query: string, signal?: AbortSignal) => Promise<unknown[]>
  selectedCompany?: KBOCompany | null
}) {
  const [value, setValue] = React.useState(selectedCompany?.name ?? '')

  return (
    <KBOSearchInput
      label="Bedrijfsnaam of KBO-nummer"
      value={value}
      onChange={setValue}
      onCompanySelect={vi.fn()}
      onClear={vi.fn()}
      searchFn={searchFn}
      selectedCompany={selectedCompany}
      debounceMs={10}
    />
  )
}

describe('Venus KBOSearchInput', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('ignores whitespace-only input for min-length gating', async () => {
    vi.useFakeTimers()
    const searchFn = vi.fn().mockResolvedValue([])

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '   ' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
    })

    expect(searchFn).not.toHaveBeenCalled()
  })

  it('passes a trimmed query to the search function', async () => {
    vi.useFakeTimers()
    const searchFn = vi.fn().mockResolvedValue([])

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.change(input, { target: { value: '  mix-media  ' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
    })

    expect(searchFn).toHaveBeenCalledTimes(1)
    expect(searchFn.mock.calls[0]?.[0]).toBe('mix-media')
    expect(searchFn.mock.calls[0]?.[1]).toBeInstanceOf(AbortSignal)
  })

  it('retries the same trimmed registry query after a search error', async () => {
    vi.useFakeTimers()
    const searchFn = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce([])

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '  retry bv  ' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('tryAgain')).toBeInTheDocument()

    fireEvent.click(screen.getByText('tryAgain'))

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(searchFn).toHaveBeenCalledTimes(2)
    expect(searchFn.mock.calls[1]?.[0]).toBe('retry bv')
  })

  it('ignores stale KBO results when a newer query is pending', async () => {
    vi.useFakeTimers()
    const requests: Array<{
      deferred: Deferred<KBOCompany[]>
      query: string
      signal?: AbortSignal
    }> = []
    const searchFn = vi.fn((query: string, signal?: AbortSignal) => {
      const deferred = createDeferred<KBOCompany[]>()
      requests.push({ deferred, query, signal })
      return deferred.promise
    })

    render(<TestHarness searchFn={searchFn} />)

    const input = screen.getByLabelText('Bedrijfsnaam of KBO-nummer')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'Acme' } })

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
    })
    expect(requests).toHaveLength(1)

    fireEvent.change(input, { target: { value: 'Beta' } })
    expect(requests[0].signal?.aborted).toBe(true)

    await act(async () => {
      requests[0].deferred.resolve([makeCompany('be-1', 'Acme BV')])
      await Promise.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByText('Acme BV')).not.toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(20)
      await Promise.resolve()
    })
    expect(requests).toHaveLength(2)
    expect(requests[1].query).toBe('Beta')

    await act(async () => {
      requests[1].deferred.resolve([makeCompany('be-2', 'Beta BV')])
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(screen.getByText('Beta BV')).toBeInTheDocument()
    expect(screen.queryByText('Acme BV')).not.toBeInTheDocument()
  })

  it('renders selected company card with short legal form and full NACE description', () => {
    const searchFn = vi.fn().mockResolvedValue([])

    render(<TestHarness searchFn={searchFn} selectedCompany={bakkerAldoFixture} />)

    expect(screen.getByDisplayValue('Bakker Aldo')).toBeInTheDocument()
    expect(screen.getByText(/BV/)).toBeInTheDocument()
    expect(screen.getByText('0631.747.439')).toBeInTheDocument()
    expect(screen.getByText('2018 Antwerpen')).toBeInTheDocument()
    expect(screen.queryByText(/2018 Antwerpen 2018/)).not.toBeInTheDocument()
    expect(
      screen.getByText('Detailhandel in brood, banketbakkerswerk, suikerwerk en chocolade')
    ).toBeInTheDocument()
    expect(screen.queryByText(/beperkte aansprakelijkhe/)).not.toBeInTheDocument()
  })
})
