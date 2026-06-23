type FrameRequestFn = (callback: FrameRequestCallback) => number
type FrameCancelFn = (handle: number) => void
type TimeoutHandle = ReturnType<typeof setTimeout>
type SetTimeoutFn = (callback: () => void, delayMs: number) => TimeoutHandle
type ClearTimeoutFn = (handle: TimeoutHandle) => void

export interface ManualFormPrefillSchedulerOptions {
  cancelFrame?: FrameCancelFn
  clearTimeoutFn?: ClearTimeoutFn
  releaseDelayMs?: number
  requestFrame?: FrameRequestFn
  setTimeoutFn?: SetTimeoutFn
}

const DEFAULT_PREFILL_GUARD_RELEASE_MS = 100

function getNow(): DOMHighResTimeStamp {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function requestNextFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback)
  }

  return setTimeout(() => callback(getNow()), 0) as unknown as number
}

function cancelNextFrame(handle: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(handle)
    return
  }

  clearTimeout(handle as unknown as TimeoutHandle)
}

export function createManualFormPrefillScheduler({
  cancelFrame = cancelNextFrame,
  clearTimeoutFn = clearTimeout,
  releaseDelayMs = DEFAULT_PREFILL_GUARD_RELEASE_MS,
  requestFrame = requestNextFrame,
  setTimeoutFn = setTimeout,
}: ManualFormPrefillSchedulerOptions = {}) {
  let inProgress = false
  let epoch = 0
  let frameHandle: number | null = null
  let releaseTimer: TimeoutHandle | null = null

  const clearReleaseTimer = () => {
    if (!releaseTimer) return
    clearTimeoutFn(releaseTimer)
    releaseTimer = null
  }

  const releaseAfterDelay = (runEpoch: number) => {
    clearReleaseTimer()
    releaseTimer = setTimeoutFn(() => {
      releaseTimer = null
      if (runEpoch === epoch) {
        inProgress = false
      }
    }, releaseDelayMs)
  }

  return {
    reset() {
      epoch += 1
      inProgress = false

      if (frameHandle !== null) {
        cancelFrame(frameHandle)
        frameHandle = null
      }
      clearReleaseTimer()
    },

    trySchedule(run: () => void): boolean {
      if (inProgress) return false

      inProgress = true
      const runEpoch = ++epoch

      frameHandle = requestFrame(() => {
        frameHandle = null
        if (runEpoch !== epoch) return

        try {
          run()
        } finally {
          releaseAfterDelay(runEpoch)
        }
      })

      return true
    },
  }
}
