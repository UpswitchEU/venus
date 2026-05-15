// @vitest-environment node

import { describe, expect, it, vi } from 'vitest'
import { createManualSubmitRun } from './useManualSubmitRunGuard'

function setup() {
  let mounted = true
  let currentLookupId: string | undefined = 'report-1'
  let latestRunId = 1
  const endLoading = vi.fn()
  const run = createManualSubmitRun({
    id: 1,
    startLookupId: currentLookupId,
    getCurrentLookupId: () => currentLookupId,
    isMounted: () => mounted,
    isLatestRun: (id) => id === latestRunId,
    endLoading,
  })
  return {
    run,
    endLoading,
    setMounted: (value: boolean) => {
      mounted = value
    },
    setCurrentLookupId: (value: string | undefined) => {
      currentLookupId = value
    },
    setLatestRunId: (value: number) => {
      latestRunId = value
    },
  }
}

describe('createManualSubmitRun', () => {
  it('starts a run that is current and scoped to the active lookup id', () => {
    const { run } = setup()

    expect(run.id).toBe(1)
    expect(run.startLookupId).toBe('report-1')
    expect(run.isCurrent()).toBe(true)
    expect(run.isStillTarget()).toBe(true)
    expect(run.staleContext()).toEqual({
      startLookupId: 'report-1',
      currentLookupId: 'report-1',
    })
  })

  it('marks a run stale when the active lookup id changes', () => {
    const { run, endLoading, setCurrentLookupId } = setup()

    setCurrentLookupId('report-2')

    expect(run.isCurrent()).toBe(true)
    expect(run.isStillTarget()).toBe(false)
    expect(run.staleContext()).toEqual({
      startLookupId: 'report-1',
      currentLookupId: 'report-2',
    })

    run.endLoading()
    expect(endLoading).toHaveBeenCalledTimes(1)
  })

  it('makes older runs non-current when a newer run starts', () => {
    const { run, endLoading, setLatestRunId } = setup()

    setLatestRunId(2)

    expect(run.isCurrent()).toBe(false)
    expect(run.isStillTarget()).toBe(false)

    run.endLoading()
    expect(endLoading).not.toHaveBeenCalled()
  })

  it('blocks post-unmount writes', () => {
    const { run, endLoading, setMounted } = setup()

    setMounted(false)

    expect(run.isCurrent()).toBe(false)
    expect(run.isStillTarget()).toBe(false)
    run.endLoading()
    expect(endLoading).not.toHaveBeenCalled()
  })
})
