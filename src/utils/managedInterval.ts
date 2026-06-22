type ManagedIntervalTimer = ReturnType<typeof setInterval>

export interface ManagedIntervalStartOptions {
  intervalMs?: number
  setIntervalFn?: typeof setInterval
}

export interface ManagedIntervalStopOptions {
  clearIntervalFn?: typeof clearInterval
}

export interface ManagedIntervalController {
  isRunning: () => boolean
  start: (options?: ManagedIntervalStartOptions) => boolean
  stop: (options?: ManagedIntervalStopOptions) => boolean
}

export function createManagedInterval(
  callback: () => void,
  defaultIntervalMs: number
): ManagedIntervalController {
  let timer: ManagedIntervalTimer | null = null

  return {
    isRunning: () => timer !== null,
    start: ({
      intervalMs = defaultIntervalMs,
      setIntervalFn = globalThis.setInterval,
    }: ManagedIntervalStartOptions = {}) => {
      if (timer !== null) return false

      timer = setIntervalFn(callback, intervalMs)
      return true
    },
    stop: ({ clearIntervalFn = globalThis.clearInterval }: ManagedIntervalStopOptions = {}) => {
      if (timer === null) return false

      clearIntervalFn(timer)
      timer = null
      return true
    },
  }
}
