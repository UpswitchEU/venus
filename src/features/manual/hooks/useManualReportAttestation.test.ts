import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { isAttestationMenuVisible, useManualReportAttestation } from './useManualReportAttestation'

const toast = vi.hoisted(() => ({
  error: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
}))

vi.mock('sonner', () => ({ toast }))

describe('isAttestationMenuVisible', () => {
  it('hides the menu while readiness is loading', () => {
    expect(isAttestationMenuVisible(null, true, 'report-1')).toBe(false)
  })

  it('hides the menu when attest is disabled in Titan', () => {
    expect(isAttestationMenuVisible({ attestEnabled: false }, true, 'report-1')).toBe(false)
  })

  it('shows the menu only when attestEnabled is true', () => {
    expect(isAttestationMenuVisible({ attestEnabled: true }, true, 'report-1')).toBe(true)
  })

  it('hides the menu after a failed readiness probe', () => {
    expect(isAttestationMenuVisible({ enabled: false }, true, 'report-1')).toBe(false)
  })
})

describe('useManualReportAttestation', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    Object.values(toast).forEach((fn) => fn.mockReset())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const baseParams = {
    reportId: 'report-1',
    enabled: true,
    startedTitle: 'Starting…',
    successTitle: 'Sent',
    successDescription: 'Check email',
    failedTitle: 'Failed',
    notFinalizedDescription: 'Finalize first',
  }

  it('maps not-finalized Titan errors to localized copy', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ attestEnabled: true }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            success: false,
            message:
              'Report VAL-1 is not finalized (status=draft); only completed reports can be attested',
          }),
          { status: 400 }
        )
      )

    const { result } = renderHook(() => useManualReportAttestation(baseParams))

    await waitFor(() => {
      expect(result.current.canSignAttest).toBe(true)
    })

    await act(async () => {
      await result.current.handleSignAttest()
    })

    expect(toast.error).toHaveBeenCalledWith('Failed', {
      description: 'Finalize first',
    })
  })

  it('ignores duplicate attest clicks while one request is in flight', async () => {
    let resolvePost: (() => void) | null = null
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ attestEnabled: true }), { status: 200 }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolvePost = () =>
              resolve(
                new Response(JSON.stringify({ success: true, data: { id: 'attest-1' } }), {
                  status: 200,
                })
              )
          })
      )

    const { result } = renderHook(() => useManualReportAttestation(baseParams))

    await waitFor(() => {
      expect(result.current.canSignAttest).toBe(true)
    })

    let firstClick: Promise<void> = Promise.resolve()
    await act(async () => {
      firstClick = result.current.handleSignAttest()
      void result.current.handleSignAttest()
    })

    const postCalls = fetchMock.mock.calls.filter(
      ([url, init]) =>
        typeof url === 'string' &&
        url.endsWith('/api/attestations') &&
        (init as RequestInit | undefined)?.method === 'POST'
    )
    expect(postCalls).toHaveLength(1)

    await act(async () => {
      resolvePost?.()
      await firstClick
    })

    expect(toast.success).toHaveBeenCalledWith('Sent', { description: 'Check email' })
  })
})
