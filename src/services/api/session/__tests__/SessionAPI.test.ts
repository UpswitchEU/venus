/**
 * SessionAPI unit tests
 *
 * Spies on HttpClient.executeRequest so SessionAPI can extend the real HttpClient
 * without axios or a broken non-class mock.
 */

import type { AxiosRequestConfig } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ValuationResponse, ValuationSession } from '../../../../types/valuation'
import { type APIRequestConfig, HttpClient } from '../../HttpClient'
import { type CreateValuationSessionInput, SessionAPI } from '../SessionAPI'

vi.mock('../../../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../utils/logger')>()
  return {
    ...actual,
    apiLogger: {
      ...actual.apiLogger,
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

vi.mock('../../../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({
      isActingAsClient: false,
      getContextHeaders: () => ({}),
    }),
  },
}))

type ExecuteRequestTarget = {
  executeRequest: (config: AxiosRequestConfig, options?: APIRequestConfig) => Promise<unknown>
}

const executeRequestSpy = vi.spyOn(
  HttpClient.prototype as unknown as ExecuteRequestTarget,
  'executeRequest'
)

describe('SessionAPI', () => {
  let api: SessionAPI

  beforeEach(() => {
    vi.clearAllMocks()
    executeRequestSpy.mockReset()
    api = new SessionAPI()
  })

  describe('getValuationSession', () => {
    it('returns normalized session payload', async () => {
      executeRequestSpy.mockResolvedValue({
        reportId: 'val_test_123',
        session_key: 'val_test_123',
        session_data: { company_name: 'Test Corp' },
        currentView: 'manual',
      })

      const result = await api.getValuationSession('val_test_123')

      expect(executeRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'GET',
          url: '/api/v2/valuations/sessions/val_test_123',
        }),
        expect.objectContaining({ timeout: 10000 })
      )
      expect(result?.success).toBe(true)
      expect(result?.session?.reportId).toBe('val_test_123')
    })

    it('returns null on 404', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 404 } })
      const result = await api.getValuationSession('val_nonexistent')
      expect(result).toBeNull()
    })

    it('throws on non-retryable server errors', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 500, data: 'Server error' } })
      await expect(api.getValuationSession('val_error')).rejects.toThrow()
    })
  })

  describe('createValuationSession', () => {
    it('creates session and maps reportId from session_key', async () => {
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_new_123',
        session_data: { company_name: 'New Corp', name: 'New Corp business valuation' },
      })

      const result = await api.createValuationSession({
        sessionData: { company_name: 'New Corp' },
        name: 'New Corp business valuation',
      } satisfies CreateValuationSessionInput)

      expect(executeRequestSpy.mock.calls[0][0]).toEqual(
        expect.objectContaining({
          method: 'POST',
          url: '/api/v2/valuations/sessions',
        })
      )
      const requestBody = executeRequestSpy.mock.calls[0][0] as {
        data: { session_data: Record<string, unknown> }
      }
      expect(requestBody.data.session_data.name).toBe('New Corp business valuation')
      expect(result.reportId).toBe('val_new_123')
      expect(result.success).toBe(true)
      expect(result.session?.reportId).toBe('val_new_123')
      expect(result.session?.name).toBe('New Corp business valuation')
    })

    it('strips HTML blobs from POST session_data merge', async () => {
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_new_123',
        session_data: { company_name: 'New Corp' },
      })

      const heavy = '<html>' + 'z'.repeat(3000)
      await api.createValuationSession({
        sessionData: { company_name: 'New Corp', html_report: heavy },
        partialData: { pdf_html_report: heavy },
      } satisfies CreateValuationSessionInput)

      const body = executeRequestSpy.mock.calls[0][0] as {
        data: { session_data: Record<string, unknown> }
      }
      expect(body.data.session_data.company_name).toBe('New Corp')
      expect(body.data.session_data.html_report).toBeUndefined()
      expect(body.data.session_data.pdf_html_report).toBeUndefined()
    })

    it('throws on creation failure', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 400, data: 'Invalid data' } })
      await expect(
        api.createValuationSession({ sessionData: {} } satisfies CreateValuationSessionInput)
      ).rejects.toThrow()
    })
  })

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

  describe('deleteValuationSession', () => {
    it('deletes session', async () => {
      executeRequestSpy.mockResolvedValue({ success: true })

      const result = await api.deleteValuationSession('val_delete_123')

      expect(executeRequestSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'DELETE',
          url: '/api/v2/valuations/sessions/val_delete_123',
        }),
        expect.objectContaining({
          retry: expect.objectContaining({ maxRetries: 0 }),
        })
      )
      expect(result.success).toBe(true)
    })
  })

  describe('saveValuationResult', () => {
    it('returns normalized authoritative session data from PUT /result', async () => {
      executeRequestSpy.mockResolvedValue({
        success: true,
        message: 'saved',
        reportId: 'report-123',
        reportReady: true,
        session: {
          reportId: 'val_ready',
          session_key: 'val_ready',
          status: 'completed',
          session_data: {
            company_name: 'Ready Corp',
            valuation_result: {
              equity_value_mid: 900000,
            },
            html_report: '<html>ready</html>',
          },
        },
      })

      const result = await api.saveValuationResult('val_ready', {
        valuationResult: {
          equity_value_mid: 900000,
        } satisfies Partial<ValuationResponse>,
        htmlReport: '<html>ready</html>',
      })

      expect(result.success).toBe(true)
      expect(result.reportReady).toBe(true)
      expect(result.session?.reportReady).toBe(true)
      expect(result.session?.valuationResult).toMatchObject({ equity_value_mid: 900000 })
      expect(result.session?.htmlReport).toBe('<html>ready</html>')
      expect(result.session?.sessionData).toMatchObject({
        company_name: 'Ready Corp',
      })
    })
  })

  describe('parallel getValuationSession', () => {
    it('issues one executeRequest per concurrent call (no client-side dedup)', async () => {
      executeRequestSpy.mockResolvedValue({
        reportId: 'val_dedup_123',
        session_key: 'val_dedup_123',
        session_data: {},
        currentView: 'manual',
      })

      await Promise.all([
        api.getValuationSession('val_dedup_123'),
        api.getValuationSession('val_dedup_123'),
        api.getValuationSession('val_dedup_123'),
      ])

      expect(executeRequestSpy).toHaveBeenCalledTimes(3)
    })

    it('calls executeRequest once per distinct report id', async () => {
      executeRequestSpy.mockImplementation(async (config: { url?: string }) => {
        const id = String(config.url).split('/').pop() || ''
        return {
          reportId: id,
          session_key: id,
          session_data: {},
          currentView: 'manual',
        }
      })

      await Promise.all([api.getValuationSession('val_a'), api.getValuationSession('val_b')])

      expect(executeRequestSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('Error paths', () => {
    it('surfaces network-style errors from getValuationSession', async () => {
      executeRequestSpy.mockRejectedValue({ code: 'ECONNREFUSED' })
      await expect(api.getValuationSession('val_network')).rejects.toThrow()
    })

    it('surfaces 401 from getValuationSession', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 401 } })
      await expect(api.getValuationSession('val_auth')).rejects.toThrow()
    })

    it('surfaces 429 from getValuationSession', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 429 } })
      await expect(api.getValuationSession('val_rl')).rejects.toThrow()
    })
  })
})
