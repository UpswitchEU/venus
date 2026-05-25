/**
 * ReportAPI unit tests
 *
 * Spies on HttpClient.executeRequest so ReportAPI can extend the real HttpClient
 * without making network requests.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { APIError } from '../../../../types/errors'
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
