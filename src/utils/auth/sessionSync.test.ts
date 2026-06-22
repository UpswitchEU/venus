import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { authLogger } from '../logger'
import { SessionSyncManager } from './sessionSync'

vi.mock('../logger', () => ({
  authLogger: {
    warn: vi.fn(),
  },
}))

const STORAGE_KEY = 'upswitch_session_sync'

class MockBroadcastChannel {
  static instances: MockBroadcastChannel[] = []

  onmessage: ((event: MessageEvent) => void) | null = null
  postMessage = vi.fn()
  close = vi.fn()

  constructor(public readonly name: string) {
    MockBroadcastChannel.instances.push(this)
  }
}

function latestChannel(): MockBroadcastChannel {
  const channel = MockBroadcastChannel.instances.at(-1)
  if (!channel) throw new Error('Expected a BroadcastChannel instance')
  return channel
}

describe('SessionSyncManager', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
    MockBroadcastChannel.instances = []
    localStorage.clear()
    vi.clearAllMocks()
  })

  afterEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('broadcasts session updates through one channel and ephemeral localStorage signal', () => {
    const manager = new SessionSyncManager()

    manager.broadcastSessionUpdate('mercury.upswitch.test', 'user-123')

    const message = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    expect(message).toMatchObject({
      type: 'SESSION_UPDATED',
      domain: 'mercury.upswitch.test',
      userId: 'user-123',
    })
    expect(latestChannel().postMessage).toHaveBeenCalledWith(expect.objectContaining(message))

    vi.advanceTimersByTime(99)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()

    manager.destroy()
  })

  it('clears pending storage cleanup timers when destroyed', () => {
    const manager = new SessionSyncManager()

    manager.broadcastSessionRefresh('venus.upswitch.test', 'user-456')
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    manager.destroy()

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
    vi.advanceTimersByTime(200)
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('ignores same-domain messages and notifies listeners for other domains', () => {
    const manager = new SessionSyncManager()
    const listener = vi.fn()
    manager.onSessionSync(listener)

    latestChannel().onmessage?.({
      data: {
        type: 'SESSION_REFRESHED',
        domain: window.location.hostname,
        timestamp: Date.now(),
      },
    } as MessageEvent)
    expect(listener).not.toHaveBeenCalled()

    latestChannel().onmessage?.({
      data: {
        type: 'SESSION_INVALIDATED',
        domain: 'mercury.upswitch.test',
        timestamp: Date.now(),
      },
    } as MessageEvent)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'SESSION_INVALIDATED',
        domain: 'mercury.upswitch.test',
      })
    )

    manager.destroy()
  })

  it('isolates malformed payloads and listener failures behind structured logging', () => {
    const manager = new SessionSyncManager()
    manager.onSessionSync(() => {
      throw new Error('listener failed')
    })

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: STORAGE_KEY,
        newValue: '{not-json',
      })
    )
    latestChannel().onmessage?.({
      data: {
        type: 'SESSION_REFRESHED',
        domain: 'mercury.upswitch.test',
        timestamp: Date.now(),
      },
    } as MessageEvent)

    expect(authLogger.warn).toHaveBeenCalledWith(
      'Failed to parse session sync message',
      expect.objectContaining({ error: expect.any(SyntaxError) })
    )
    expect(authLogger.warn).toHaveBeenCalledWith(
      'Session sync listener failed',
      expect.objectContaining({ error: expect.any(Error) })
    )

    manager.destroy()
  })
})
