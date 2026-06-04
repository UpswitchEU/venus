import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePdfGeneration } from './usePdfGeneration'

const mocks = vi.hoisted(() => ({
  getSessionData: vi.fn(() => ({})),
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}))

vi.mock('../store/useSessionStore', () => ({
  useSessionStore: (selector: (state: { getSessionData: () => unknown }) => unknown) =>
    selector({ getSessionData: mocks.getSessionData }),
}))

vi.mock('../utils/logger', () => ({
  generalLogger: mocks.logger,
}))

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('usePdfGeneration', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    mocks.getSessionData.mockReturnValue({})
  })

  it('ignores stale generation responses after the report id changes', async () => {
    let resolveFetch: ((response: Response) => void) | null = null
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve
        })
    )
    vi.stubGlobal('fetch', fetchMock)

    const { result, rerender } = renderHook(({ reportId }) => usePdfGeneration(reportId), {
      initialProps: { reportId: 'report-a' as string | null },
    })

    let generationPromise: Promise<string | null> = Promise.resolve(null)
    act(() => {
      generationPromise = result.current.generatePdf()
    })

    expect(result.current.state.status).toBe('generating')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/valuations/report-a/pdf',
      expect.objectContaining({ method: 'POST' })
    )

    act(() => {
      rerender({ reportId: 'report-b' })
    })

    expect(result.current.state).toEqual({
      status: 'none',
      url: null,
      error: null,
      progress: 0,
    })

    await act(async () => {
      resolveFetch?.(jsonResponse({ success: true, pdfUrl: 'https://cdn.example/report-a.pdf' }))
      await generationPromise
    })

    expect(result.current.state).toEqual({
      status: 'none',
      url: null,
      error: null,
      progress: 0,
    })
  })
})
