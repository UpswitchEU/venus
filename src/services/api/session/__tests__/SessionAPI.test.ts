import { beforeEach, describe, expect, it } from 'vitest'
import type { CreateValuationSessionInput, SessionAPI } from './SessionAPI.testHarness'
import { executeRequestSpy, resetSessionApiHarness } from './SessionAPI.testHarness'

let api: SessionAPI

beforeEach(() => {
  api = resetSessionApiHarness()
})

describe('SessionAPI', () => {
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
        expect.objectContaining({ timeout: 30000 })
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

    it('preserves a valid graph context and rejects buyer context before create dispatch', async () => {
      const companyGraphContext = {
        company_node_id: '11111111-1111-4111-8111-111111111111',
        graph_revision: 'a'.repeat(64),
        maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
        ruleset_version: 'company-graph-maturity/v3',
        audience: 'owner' as const,
      }
      executeRequestSpy.mockResolvedValue({
        session_key: 'val_graph_create',
        session_data: { company_graph_context: companyGraphContext },
      })

      await api.createValuationSession({
        sessionData: { company_graph_context: companyGraphContext },
      } satisfies CreateValuationSessionInput)

      const body = executeRequestSpy.mock.calls[0]?.[0] as {
        data?: { session_data?: Record<string, unknown> }
      }
      expect(body.data?.session_data?.company_graph_context).toBe(companyGraphContext)

      executeRequestSpy.mockClear()
      await expect(
        api.createValuationSession({
          sessionData: {
            company_graph_context: { ...companyGraphContext, audience: 'buyer' },
          },
        } as never)
      ).rejects.toMatchObject({ field: 'company_graph_context' })
      expect(executeRequestSpy).not.toHaveBeenCalled()
    })

    it('throws on creation failure', async () => {
      executeRequestSpy.mockRejectedValue({ response: { status: 400, data: 'Invalid data' } })
      await expect(
        api.createValuationSession({ sessionData: {} } satisfies CreateValuationSessionInput)
      ).rejects.toThrow()
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
