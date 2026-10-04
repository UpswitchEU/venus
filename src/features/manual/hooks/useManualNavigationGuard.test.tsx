import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualNavigationGuard } from './useManualNavigationGuard'

const env = vi.hoisted(() => ({
  state: {} as any,
  access: true,
  save: vi.fn(),
  loading: vi.fn(),
  error: vi.fn(),
  dismiss: vi.fn(),
  dispose: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { loading: env.loading, error: env.error, dismiss: env.dismiss },
}))
vi.mock('../../../store/useSessionStore', () => ({
  useSessionStore: { getState: () => env.state },
}))
vi.mock('../../../utils/reportIdentityPromotion', () => ({
  isSameReportIdentity: (a: unknown, b: unknown) => a === b,
}))
vi.mock('../../../utils/reportAccessScope', () => ({
  watchReportAccessScope: () => ({ isCurrent: () => env.access, dispose: env.dispose }),
}))
vi.mock('../utils/saveManualWorkspaceBeforeNavigation', () => ({
  saveManualWorkspaceBeforeNavigation: env.save,
  WorkspaceSaveNotReadyError: class extends Error {},
}))

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
const renderGuard = () =>
  renderHook(() => useManualNavigationGuard({ flushForm: vi.fn(), isBusy: () => false }))
beforeEach(() => {
  vi.resetAllMocks()
  env.access = true
  env.state = { session: { reportId: 'a' }, engine: {}, engineRevision: 1 }
  env.save.mockResolvedValue(undefined)
})
afterEach(() => vi.useRealTimers())

describe('navigation save guard', () => {
  it('awaits saving and coalesces repeated clicks to one destination', async () => {
    const gate = deferred(),
      first = vi.fn(),
      second = vi.fn()
    env.save.mockReturnValueOnce(gate.promise)
    const { result } = renderGuard()
    let work!: Promise<void>
    act(() => {
      work = result.current(first)
      void result.current(second)
    })
    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()
    expect(env.save).toHaveBeenCalledOnce()
    await act(async () => {
      gate.resolve()
      await work
    })
    expect(first).toHaveBeenCalledOnce()
    expect(second).not.toHaveBeenCalled()
    expect(env.dispose).toHaveBeenCalledOnce()
  })
  it('keeps edits in place on failure and retries the same destination explicitly', async () => {
    env.save.mockRejectedValueOnce(new Error('offline'))
    const destination = vi.fn(),
      { result } = renderGuard()
    await act(async () => {
      await result.current(destination)
    })
    expect(destination).not.toHaveBeenCalled()
    expect(env.error).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ duration: Infinity })
    )
    await act(async () => {
      env.error.mock.lastCall![1].action.onClick()
    })
    expect(destination).toHaveBeenCalledOnce()
  })
  it('expires an unresponsive save and never navigates when it eventually resolves', async () => {
    vi.useFakeTimers()
    const gate = deferred(),
      destination = vi.fn()
    env.save.mockReturnValueOnce(gate.promise)
    const { result } = renderGuard()
    let work!: Promise<void>
    act(() => {
      work = result.current(destination)
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000)
      await work
    })
    expect(env.error).toHaveBeenCalledWith('failed', expect.anything())
    const options = env.save.mock.calls[0][0]
    expect(options.isCurrent()).toBe(false)
    await act(async () => {
      gate.resolve()
    })
    expect(destination).not.toHaveBeenCalled()
  })
  it.each([
    'unmount',
    'engine',
    'role',
  ])('cancels late navigation after %s changes', async (change) => {
    const gate = deferred(),
      destination = vi.fn()
    env.save.mockReturnValueOnce(gate.promise)
    const { result, unmount } = renderGuard()
    let work!: Promise<void>
    act(() => {
      work = result.current(destination)
    })
    if (change === 'unmount') unmount()
    if (change === 'engine') env.state = { ...env.state, engineRevision: 2 }
    if (change === 'role') env.access = false
    await act(async () => {
      gate.resolve()
      await work
    })
    expect(destination).not.toHaveBeenCalled()
    expect(env.error).not.toHaveBeenCalled()
    expect(env.dismiss).toHaveBeenCalled()
  })
  it('does not apply an old retry action to another company', async () => {
    env.save.mockRejectedValueOnce(new Error('offline'))
    const destination = vi.fn(),
      { result } = renderGuard()
    await act(async () => {
      await result.current(destination)
    })
    env.state = { ...env.state, engineRevision: 2 }
    await act(async () => {
      env.error.mock.lastCall![1].action.onClick()
    })
    expect(env.save).toHaveBeenCalledOnce()
    expect(destination).not.toHaveBeenCalled()
  })
  it('distinguishes a navigation failure from a failed save', async () => {
    const { result } = renderGuard()
    await act(async () => {
      await result.current(() => {
        throw new Error('routing failed')
      })
    })
    expect(env.error).toHaveBeenCalledWith('navigationFailed', expect.anything())
  })
})
