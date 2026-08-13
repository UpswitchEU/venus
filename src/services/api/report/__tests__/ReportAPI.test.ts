/**
 * ReportAPI unit tests
 *
 * Spies on HttpClient.executeRequest so ReportAPI can extend the real HttpClient
 * without making network requests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError, ValidationError } from '../../../../types/errors'
import { apiLogger } from '../../../../utils/logger'
import { HttpClient } from '../../HttpClient'
import { ReportAPI } from '../ReportAPI'

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

type ExecuteRequestTarget = {
  executeRequest: () => Promise<unknown>
}

const executeRequestSpy = vi.spyOn(
  HttpClient.prototype as unknown as ExecuteRequestTarget,
  'executeRequest'
)

describe('ReportAPI', () => {
  let api: ReportAPI

  beforeEach(() => {
    vi.clearAllMocks()
    executeRequestSpy.mockReset()
    api = new ReportAPI()
  })

  describe('getReport', () => {
    it('hoists academic_validation_issues from nested details', async () => {
      executeRequestSpy.mockResolvedValue({
        valuation: 568_000,
        details: {
          academic_validation_issues: ['SME WACC outside advisory band'],
        },
      })

      const report = await api.getReport('report-uuid-1')

      expect(report.academic_validation_issues).toEqual(['SME WACC outside advisory band'])
      expect(report.details?.academic_validation_issues).toEqual(['SME WACC outside advisory band'])
    })

    it('hoists academic_validation_issues on updateReport', async () => {
      executeRequestSpy.mockResolvedValue({
        valuation_id: 'val_updated',
        details: {
          academic_validation_issues: ['Terminal growth above GDP guidance'],
        },
      })

      const report = await api.updateReport('report-uuid-1', { company_name: 'Creatief bureau' })

      expect(report.academic_validation_issues).toEqual(['Terminal growth above GDP guidance'])
    })

    it('preserves valid graph context and rejects buyer context before report dispatch', async () => {
      executeRequestSpy.mockResolvedValue({ valuation_id: 'val_updated' })
      const companyGraphContext = {
        company_node_id: '11111111-1111-4111-8111-111111111111',
        graph_revision: `sha256:${'a'.repeat(64)}`,
        maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
        ruleset_version: 'company-graph-maturity/v3',
        audience: 'advisor' as const,
      }

      await api.updateReport('report-uuid-1', {
        company_graph_context: companyGraphContext,
      })

      const request = executeRequestSpy.mock.calls[0]?.[0] as {
        data?: Record<string, unknown>
      }
      expect(request.data?.company_graph_context).toBe(companyGraphContext)

      executeRequestSpy.mockClear()
      await expect(
        api.updateReport('report-uuid-1', {
          company_graph_context: { ...companyGraphContext, audience: 'buyer' } as never,
        })
      ).rejects.toBeInstanceOf(ValidationError)
      expect(executeRequestSpy).not.toHaveBeenCalled()
    })

    it('treats by-session 404s as expected debug noise while preserving the 404 signal', async () => {
      executeRequestSpy.mockRejectedValue({
        config: {
          method: 'get',
          url: '/api/v2/valuations/reports/by-session/val_missing_123',
        },
        response: { status: 404, data: { message: 'Report not found' } },
      })

      let thrown: unknown
      try {
        await api.getReport('val_missing_123', { bySession404Attempts: 1 })
      } catch (error) {
        thrown = error
      }

      expect(thrown).toBeInstanceOf(APIError)
      expect(thrown).toMatchObject({ statusCode: 404 })
      expect(apiLogger.debug).toHaveBeenCalledWith(
        'Report by-session not available',
        expect.objectContaining({
          operation: 'get report',
          status: 404,
        })
      )
      expect(apiLogger.error).not.toHaveBeenCalledWith(
        'Report get report failed',
        expect.anything()
      )
    })
  })
})
