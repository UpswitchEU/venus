import { beforeEach, describe, expect, it, vi } from 'vitest'

const mock = vi.hoisted(() => ({
  init: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  reset: vi.fn(),
  has_opted_out_capturing: vi.fn(),
  capture: vi.fn(),
  identify: vi.fn(),
}))
vi.mock('posthog-js', () => ({ default: mock }))
vi.mock('./posthog-env', () => ({
  getPostHogProjectToken: () => 'test-project',
  getPostHogApiHost: () => 'https://analytics.test',
}))
beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
})
describe('consented analytics persistence', () => {
  it('starts with both capture and persistence disabled', async () => {
    const client = await import('./posthog-init')
    client.initVenusPostHog()
    expect(mock.init).toHaveBeenCalledWith(
      'test-project',
      expect.objectContaining({
        opt_out_capturing_by_default: true,
        opt_out_persistence_by_default: true,
        autocapture: false,
        disable_session_recording: true,
      })
    )
    client.syncPostHogConsent(false)
    expect(mock.opt_out_capturing).toHaveBeenCalledOnce()
    expect(mock.reset).toHaveBeenCalledOnce()
    client.syncPostHogConsent(true)
    expect(mock.opt_in_capturing).toHaveBeenCalledOnce()
  })
  it('fails closed when the SDK cannot establish consent', async () => {
    const client = await import('./posthog-init')
    client.initVenusPostHog()
    mock.has_opted_out_capturing.mockImplementation(() => {
      throw new Error('SDK unavailable')
    })
    expect(client.isPostHogCaptureAllowed()).toBe(false)
    client.capturePostHogOrQueue('test')
    expect(mock.capture).not.toHaveBeenCalled()
  })
})
