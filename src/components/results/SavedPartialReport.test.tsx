import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import producer from '../../utils/__fixtures__/partial-report.v1.json'
import { SavedPartialReport } from './SavedPartialReport'

vi.mock('@/stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({ getContextHeaders: () => ({ 'X-Relationship-Id': 'relationship-1' }) }),
  },
}))
const id = producer.report_manifest.report_id
const report = { valuation_result: { partial_valuation: producer.partial_valuation } }
const loaded = {
  partial_valuation: producer.partial_valuation,
  updated_at: '2026-10-02T06:00:00.000Z',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

describe('saved partial screen', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })
  it('projects exact producer HTML after resolving its current saved identity and delegated context', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(json(loaded))
      .mockResolvedValueOnce(json(producer))
    vi.stubGlobal('fetch', fetcher)
    render(<SavedPartialReport reportId={id} report={report} language="en" />)
    const frame = await screen.findByTitle('Automatic indicative assessment')
    expect(frame.getAttribute('srcdoc')).toBe(producer.html_report)
    expect(frame.getAttribute('sandbox')).toBe('')
    expect(frame.getAttribute('srcdoc')).toContain('0.00 EUR')
    expect(frame.getAttribute('srcdoc')).toContain('Not supplied')
    expect(fetcher.mock.calls[0][0]).toContain('/partial-calculation')
    expect(fetcher.mock.calls[1][0]).toContain('/partial-export')
    expect(fetcher.mock.calls[1][1].headers).toMatchObject({
      'X-Relationship-Id': 'relationship-1',
    })
    expect(JSON.parse(fetcher.mock.calls[1][1].body).include_pdf).toBe(false)
  })
  it('does not render or reprice after a saved identity change', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      json({
        ...loaded,
        partial_valuation: { ...loaded.partial_valuation, content_sha256: 'b'.repeat(64) },
      })
    )
    vi.stubGlobal('fetch', fetcher)
    render(<SavedPartialReport reportId={id} report={report} language="en" />)
    await screen.findByRole('alert')
    expect(screen.queryByTitle('Automatic indicative assessment')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('cancels saved report resolution when leaving the page', async () => {
    const fetcher = vi.fn().mockImplementation(
      () =>
        new Promise(() => {
          // Keep the request pending so unmount cancellation can be observed.
        })
    )
    vi.stubGlobal('fetch', fetcher)
    const view = render(<SavedPartialReport reportId={id} report={report} language="en" />)
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    const signal = fetcher.mock.calls[0][1].signal
    view.unmount()
    expect(signal.aborted).toBe(true)
  })
})
