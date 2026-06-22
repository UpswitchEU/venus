import { vi } from 'vitest'

const sessionServiceMocks = vi.hoisted(() => ({
  clearSessionCache: vi.fn(),
  loadSession: vi.fn(),
  saveSession: vi.fn(),
}))

vi.mock('../../index', () => ({
  sessionService: {
    clearSessionCache: sessionServiceMocks.clearSessionCache,
    loadSession: sessionServiceMocks.loadSession,
    saveSession: sessionServiceMocks.saveSession,
  },
}))

vi.mock('../../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/logger')>()
  return {
    ...actual,
    generalLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

export const { recordSessionPoolPressure503, resetSessionPoolPressureCircuitForTests } =
  await import('../../../hooks/sessionPoolPressureCircuit')
export const { AuthenticatedSessionEngine } = await import('./AuthenticatedSessionEngine')

export function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

export function getSessionServiceMocks() {
  return sessionServiceMocks
}

export function resetAuthenticatedSessionEngineHarness() {
  vi.clearAllMocks()
  resetSessionPoolPressureCircuitForTests()
}
