import { afterEach, describe, expect, it, vi } from 'vitest'
import { generalLogger } from './logger'
import {
  startServiceWorkerUpdateChecks,
  stopServiceWorkerUpdateChecks,
} from './serviceWorkerRegistration'

vi.mock('./logger', () => ({
  generalLogger: {
    error: vi.fn(),
  },
}))

function makeRegistration(
  update = vi.fn().mockResolvedValue(undefined)
): ServiceWorkerRegistration {
  return { update } as unknown as ServiceWorkerRegistration
}

describe('service worker update checks', () => {
  afterEach(() => {
    stopServiceWorkerUpdateChecks()
    vi.restoreAllMocks()
  })

  it('starts one hourly update interval and can stop it explicitly', () => {
    const intervalId = 321 as unknown as ReturnType<typeof setInterval>
    let scheduledCallback: (() => void) | null = null
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledCallback = callback
      return intervalId
    }) as unknown as typeof setInterval
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval
    const registration = makeRegistration()

    startServiceWorkerUpdateChecks(registration, { setIntervalFn })
    startServiceWorkerUpdateChecks(registration, { setIntervalFn })

    expect(setIntervalFn).toHaveBeenCalledTimes(1)
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), 60 * 60 * 1000)

    scheduledCallback?.()
    expect(registration.update).toHaveBeenCalledTimes(1)

    stopServiceWorkerUpdateChecks({ clearIntervalFn })
    expect(clearIntervalFn).toHaveBeenCalledTimes(1)
    expect(clearIntervalFn).toHaveBeenCalledWith(intervalId)
  })

  it('logs update check failures without throwing from the scheduled tick', async () => {
    const failure = new Error('network down')
    let scheduledCallback: (() => void) | null = null
    const setIntervalFn = vi.fn((callback: () => void) => {
      scheduledCallback = callback
      return 1 as unknown as ReturnType<typeof setInterval>
    }) as unknown as typeof setInterval
    const registration = makeRegistration(vi.fn().mockRejectedValue(failure))

    startServiceWorkerUpdateChecks(registration, { setIntervalFn })
    scheduledCallback?.()

    await vi.waitFor(() => {
      expect(generalLogger.error).toHaveBeenCalledWith('[ServiceWorker] Update check failed', {
        error: 'network down',
      })
    })
  })
})
