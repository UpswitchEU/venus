import type { AxiosRequestConfig } from 'axios'
import { vi } from 'vitest'
import { resetSessionPoolPressureCircuitForTests } from '../../../../hooks/sessionPoolPressureCircuit'
import { type APIRequestConfig, HttpClient } from '../../HttpClient'
import { SessionAPI } from '../SessionAPI'

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

vi.mock('../../../../services/backendApi', () => ({
  backendAPI: {},
}))

vi.mock('../../../../services/session/SessionService', () => ({
  SessionService: class SessionService {},
  sessionService: {},
}))

vi.mock('../../../../services/report/ReportAssetService', () => ({
  pendingReportAssetSaves: new Map<string, Promise<void>>(),
  ReportAssetService: class ReportAssetService {
    static getInstance() {
      return new ReportAssetService()
    }
  },
  reportAssetService: {},
}))

type ExecuteRequestTarget = {
  executeRequest: (config: AxiosRequestConfig, options?: APIRequestConfig) => Promise<unknown>
}

export const executeRequestSpy = vi.spyOn(
  HttpClient.prototype as unknown as ExecuteRequestTarget,
  'executeRequest'
)

export function resetSessionApiHarness(): SessionAPI {
  resetSessionPoolPressureCircuitForTests()
  vi.clearAllMocks()
  executeRequestSpy.mockReset()
  return new SessionAPI()
}

export type { ValuationResponse, ValuationSession } from '../../../../types/valuation'
export type { CreateValuationSessionInput, SessionAPI } from '../SessionAPI'
