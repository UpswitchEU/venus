import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionJsonbAutosaveCoordinator } from './sessionJsonbAutosaveCoordinator'

interface TestItem {
  id: string
}

interface TestState {
  items: TestItem[]
}

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
}

function createHarness(
  options: {
    getDeferRemainingMs?: (reportId: string) => number
    isVisibilityPersistBlocked?: () => boolean
  } = {}
) {
  let items: TestItem[] = []
  let listener: ((state: TestState) => void) | null = null
  const unsubscribe = vi.fn()
  const persistToSession = vi.fn().mockResolvedValue(undefined)
  const saveRecoveryBuffer = vi.fn()
  const clearRecoveryBuffer = vi.fn()

  const coordinator = new SessionJsonbAutosaveCoordinator<TestState, TestItem>({
    storeName: 'TestStore',
    getItems: () => items,
    selectItems: (state) => state.items,
    subscribe: (nextListener) => {
      listener = nextListener
      return unsubscribe
    },
    persistToSession,
    saveRecoveryBuffer,
    clearRecoveryBuffer,
    getDeferRemainingMs: options.getDeferRemainingMs ?? (() => 0),
    isVisibilityPersistBlocked: options.isVisibilityPersistBlocked,
  })

  return {
    coordinator,
    persistToSession,
    saveRecoveryBuffer,
    clearRecoveryBuffer,
    unsubscribe,
    setItems: (nextItems: TestItem[]) => {
      items = nextItems
      listener?.({ items })
    },
    setItemsWithoutNotify: (nextItems: TestItem[]) => {
      items = nextItems
    },
  }
}

describe('SessionJsonbAutosaveCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setVisibilityState('visible')
  })

  afterEach(() => {
    vi.useRealTimers()
    setVisibilityState('visible')
    vi.restoreAllMocks()
  })

  it('debounces item changes into one session persist', async () => {
    const harness = createHarness()
    const stop = harness.coordinator.enable(() => 'report-1')

    harness.setItems([{ id: 'a' }])
    harness.setItems([{ id: 'a' }, { id: 'b' }])

    await vi.advanceTimersByTimeAsync(299)
    expect(harness.persistToSession).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.persistToSession).toHaveBeenCalledTimes(1)
    expect(harness.persistToSession).toHaveBeenCalledWith('report-1')
    expect(harness.clearRecoveryBuffer).toHaveBeenCalledWith('report-1')

    stop()
  })

  it('writes the latest items to recovery storage on beforeunload', () => {
    const harness = createHarness()
    const stop = harness.coordinator.enable(() => 'report-1')
    const latestItems = [{ id: 'pending' }]

    harness.setItems(latestItems)
    window.dispatchEvent(new Event('beforeunload'))

    expect(harness.saveRecoveryBuffer).toHaveBeenCalledWith('report-1', latestItems)
    stop()
  })

  it('honors session autosave deferral before persisting', async () => {
    let deferCalls = 0
    const harness = createHarness({
      getDeferRemainingMs: () => (deferCalls++ === 0 ? 500 : 0),
    })
    const stop = harness.coordinator.enable(() => 'report-1')

    harness.setItems([{ id: 'deferred' }])
    await vi.advanceTimersByTimeAsync(300)
    expect(harness.persistToSession).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(524)
    expect(harness.persistToSession).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(harness.persistToSession).toHaveBeenCalledTimes(1)
    stop()
  })

  it('defers hidden-tab flushes while an external persist is busy', async () => {
    let blocked = true
    const harness = createHarness({
      isVisibilityPersistBlocked: () => blocked,
    })
    const stop = harness.coordinator.enable(() => 'report-1')

    harness.setItemsWithoutNotify([{ id: 'hidden-tab' }])
    setVisibilityState('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    expect(harness.persistToSession).not.toHaveBeenCalled()

    harness.coordinator.flushPendingVisibilityPersist()
    await Promise.resolve()
    expect(harness.persistToSession).not.toHaveBeenCalled()

    blocked = false
    harness.coordinator.flushPendingVisibilityPersist()
    await Promise.resolve()

    expect(harness.persistToSession).toHaveBeenCalledTimes(1)
    expect(harness.persistToSession).toHaveBeenCalledWith('report-1')
    stop()
  })
})
