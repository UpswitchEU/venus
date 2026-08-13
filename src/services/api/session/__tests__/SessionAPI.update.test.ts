import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionAPI, ValuationSession } from './SessionAPI.testHarness'
import { executeRequestSpy, resetSessionApiHarness } from './SessionAPI.testHarness'

let api: SessionAPI

beforeEach(() => {
  api = resetSessionApiHarness()
})

describe('SessionAPI', () => {
  describe('updateValuationSession', () => {
    it('updates existing session', async () => {
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_update_123',
        session_data: {
          company_name: 'Updated Corp',
          name: 'Updated Corp business valuation',
        },
        currentView: 'manual',
      })

      const result = await api.updateValuationSession('val_update_123', {
        reportId: 'val_update_123',
        updates: { sessionData: { company_name: 'Updated Corp' } },
      })

      expect(executeRequestSpy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          method: 'PATCH',
          url: '/api/v2/valuations/sessions/val_update_123',
          data: { session_data: { company_name: 'Updated Corp' } },
        })
      )
      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)
      const backendSession = result.session as ValuationSession & {
        session_data?: Record<string, unknown>
      }
      expect(backendSession.session_data?.company_name).toBe('Updated Corp')
      expect(result.session?.name).toBe('Updated Corp business valuation')
    })

    it('also accepts legacy envelope-shaped PATCH responses', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        data: {
          session_key: 'val_update_123',
          session_data: {
            company_name: 'Updated Corp',
            name: 'Updated Corp business valuation',
          },
          currentView: 'manual',
        },
      })

      const result = await api.updateValuationSession('val_update_123', {
        reportId: 'val_update_123',
        updates: { sessionData: { company_name: 'Updated Corp' } },
      })

      expect(result.success).toBe(true)
      expect(result.updated).toBe(true)
      expect(result.session?.name).toBe('Updated Corp business valuation')
    })

    it('preserves a valid graph context and rejects public context before patch dispatch', async () => {
      const companyGraphContext = {
        company_node_id: '11111111-1111-4111-8111-111111111111',
        graph_revision: `sha256:${'a'.repeat(64)}`,
        maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
        ruleset_version: 'company-graph-maturity/v3',
        audience: 'advisor' as const,
      }
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_graph_update',
        session_data: { company_graph_context: companyGraphContext },
      })

      await api.updateValuationSession('val_graph_update', {
        reportId: 'val_graph_update',
        updates: { sessionData: { company_graph_context: companyGraphContext } },
      })

      const request = executeRequestSpy.mock.calls[0]?.[0] as {
        data?: { session_data?: Record<string, unknown> }
      }
      expect(request.data?.session_data?.company_graph_context).toBe(companyGraphContext)

      executeRequestSpy.mockClear()
      await expect(
        api.updateValuationSession('val_graph_update', {
          reportId: 'val_graph_update',
          updates: {
            sessionData: {
              company_graph_context: { ...companyGraphContext, audience: 'public' },
            },
          } as never,
        })
      ).rejects.toMatchObject({ field: 'company_graph_context' })
      expect(executeRequestSpy).not.toHaveBeenCalled()
    })

    it('retries transient Premature close failures once before failing the save', async () => {
      vi.useFakeTimers()
      try {
        executeRequestSpy
          .mockRejectedValueOnce({
            response: { status: 500, data: { message: 'Premature close' } },
          })
          .mockResolvedValueOnce({
            session_key: 'val_update_123',
            session_data: { company_name: 'Updated Corp' },
          })

        const resultPromise = api.updateValuationSession('val_update_123', {
          reportId: 'val_update_123',
          updates: { sessionData: { company_name: 'Updated Corp' } },
        })

        await vi.advanceTimersByTimeAsync(500)
        const result = await resultPromise

        expect(result.success).toBe(true)
        expect(executeRequestSpy).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('treats HTTP 499 session PATCH responses as transient client-abort failures', async () => {
      vi.useFakeTimers()
      try {
        executeRequestSpy
          .mockRejectedValueOnce({
            response: { status: 499, data: { message: 'Client closed request' } },
          })
          .mockResolvedValueOnce({
            session_key: 'val_update_499',
            session_data: { company_name: 'Updated Corp' },
          })

        const resultPromise = api.updateValuationSession('val_update_499', {
          reportId: 'val_update_499',
          updates: { sessionData: { company_name: 'Updated Corp' } },
        })

        await vi.advanceTimersByTimeAsync(500)
        const result = await resultPromise

        expect(result.success).toBe(true)
        expect(executeRequestSpy).toHaveBeenCalledTimes(2)
      } finally {
        vi.useRealTimers()
      }
    })

    it('uses the session PATCH retry policy instead of nested generic HttpClient retries', async () => {
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_update_retry_policy',
        session_data: { company_name: 'Updated Corp' },
      })

      await api.updateValuationSession('val_update_retry_policy', {
        reportId: 'val_update_retry_policy',
        updates: { sessionData: { company_name: 'Updated Corp' } },
      })

      expect(executeRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'PATCH',
          url: '/api/v2/valuations/sessions/val_update_retry_policy',
        }),
        expect.objectContaining({
          retry: expect.objectContaining({ maxRetries: 0 }),
          timeout: 20000,
        })
      )
    })

    it('reuses the session PATCH policy for rate-limit retries', async () => {
      vi.useFakeTimers()
      try {
        executeRequestSpy
          .mockRejectedValueOnce({
            response: { status: 429, headers: { 'retry-after': '1' } },
          })
          .mockResolvedValueOnce({
            session_key: 'val_update_rate_limited',
            session_data: { company_name: 'Updated Corp' },
          })

        const resultPromise = api.updateValuationSession('val_update_rate_limited', {
          reportId: 'val_update_rate_limited',
          updates: { sessionData: { company_name: 'Updated Corp' } },
        })

        await vi.advanceTimersByTimeAsync(1000)
        const result = await resultPromise

        expect(result.success).toBe(true)
        expect(executeRequestSpy).toHaveBeenCalledTimes(2)
        expect(executeRequestSpy.mock.calls[1][0]).toEqual(
          expect.objectContaining({
            method: 'PATCH',
            url: '/api/v2/valuations/sessions/val_update_rate_limited',
            data: { session_data: { company_name: 'Updated Corp' } },
          })
        )
        expect(executeRequestSpy.mock.calls[1][1]).toEqual(
          expect.objectContaining({
            retry: expect.objectContaining({ maxRetries: 0 }),
            timeout: 20000,
          })
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('returns optimistic success when non-critical rate-limit retries are exhausted', async () => {
      vi.useFakeTimers()
      try {
        executeRequestSpy.mockRejectedValue({
          response: { status: 429, headers: { 'retry-after': '1' } },
        })

        const resultPromise = api.updateValuationSession('val_noncritical_rate_limited', {
          reportId: 'val_noncritical_rate_limited',
          updates: { status: 'active' },
        })

        await vi.advanceTimersByTimeAsync(3000)
        const result = await resultPromise

        expect(result.success).toBe(true)
        expect(result.updated).toBe(false)
        expect(executeRequestSpy).toHaveBeenCalledTimes(3)
        for (const [, options] of executeRequestSpy.mock.calls) {
          expect(options).toEqual(
            expect.objectContaining({
              retry: expect.objectContaining({ maxRetries: 0 }),
              timeout: 20000,
            })
          )
        }
      } finally {
        vi.useRealTimers()
      }
    })

    it('maps PATCH updates to Titan session_data and strips report HTML blobs', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        data: { session_data: {} },
      })

      const heavy = '<html>' + 'x'.repeat(5000)
      await api.updateValuationSession('val_update_123', {
        reportId: 'val_update_123',
        updates: {
          sessionData: {
            company_name: 'Co',
            html_report: heavy,
            valuation_result: { equity_value_mid: 1, html_report: 'nested' },
          },
          partialData: { pdf_html_report: heavy },
          htmlReport: heavy,
        },
      })

      const req = executeRequestSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(req.data.htmlReport).toBeUndefined()
      expect(req.data.sessionData).toBeUndefined()
      expect(req.data.partialData).toBeUndefined()
      const sd = req.data.session_data as Record<string, unknown>
      expect(sd.company_name).toBe('Co')
      expect(sd.html_report).toBeUndefined()
      const vr = sd.valuation_result as Record<string, unknown>
      expect(vr.equity_value_mid).toBe(1)
      expect(vr.html_report).toBeUndefined()
      expect(sd.pdf_html_report).toBeUndefined()
    })

    it('maps conversational view to Titan view_type in PATCH data', async () => {
      executeRequestSpy.mockResolvedValue({ success: true, data: {} })

      await api.updateValuationSession('rid', {
        reportId: 'rid',
        updates: { currentView: 'conversational' },
      })

      const req = executeRequestSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(req.data.view_type).toBe('advanced')
      expect((req.data.session_data as Record<string, unknown>).currentView).toBe('ai-guided')
      expect(req.data.currentView).toBeUndefined()
    })

    it('stores valuation name inside session_data instead of sending an unknown top-level field', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        data: {
          session_key: 'rid',
          session_data: { name: 'Acme BV business valuation' },
          view_type: 'simple',
        },
      })

      const result = await api.updateValuationSession('rid', {
        reportId: 'rid',
        updates: { name: 'Acme BV business valuation' },
      })

      const req = executeRequestSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(req.data.name).toBeUndefined()
      expect((req.data.session_data as Record<string, unknown>).name).toBe(
        'Acme BV business valuation'
      )
      expect(result.session?.name).toBe('Acme BV business valuation')
    })

    it('maps the autosave envelope from Venus to a strict Titan PATCH body', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        data: {
          session_key: 'rid',
          session_data: {
            company_name: 'Three Towers Capital',
            currentView: 'manual',
            name: 'Three Towers Capital business valuation',
          },
          view_type: 'simple',
        },
      })

      await api.updateValuationSession('rid', {
        reportId: 'rid',
        updates: {
          sessionData: { company_name: 'Three Towers Capital' },
          currentView: 'manual',
          name: 'Three Towers Capital business valuation',
        },
      })

      const req = executeRequestSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(req.data).toEqual({
        session_data: {
          company_name: 'Three Towers Capital',
          currentView: 'manual',
          name: 'Three Towers Capital business valuation',
        },
        view_type: 'simple',
      })
    })

    it('maps the flat autosave payload from AuthenticatedSessionEngine to session_data', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        data: {
          session_key: 'rid',
          session_data: {
            company_name: 'Three Towers Capital',
            revenue: 1_250_000,
            currentView: 'manual',
            name: 'Three Towers Capital business valuation',
          },
          view_type: 'simple',
        },
      })

      await api.updateValuationSession('rid', {
        reportId: 'rid',
        updates: {
          company_name: 'Three Towers Capital',
          revenue: 1_250_000,
          currentView: 'manual',
          name: 'Three Towers Capital business valuation',
        } as Partial<ValuationSession>,
      })

      const req = executeRequestSpy.mock.calls[0][0] as { data: Record<string, unknown> }
      expect(req.data).toEqual({
        session_data: {
          company_name: 'Three Towers Capital',
          revenue: 1_250_000,
          currentView: 'manual',
          name: 'Three Towers Capital business valuation',
        },
        view_type: 'simple',
      })
    })

    it('returns optimistic success on 404 for non-critical empty updates', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 404 } })
      const result = await api.updateValuationSession('val_nonexistent', {
        reportId: 'val_nonexistent',
        updates: {},
      })
      expect(result.success).toBe(true)
      expect(result.updated).toBe(false)
      expect(result.session).toBeNull()
    })
  })
})
