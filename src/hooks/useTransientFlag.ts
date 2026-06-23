import { useCallback, useState } from 'react'
import { useManagedTimeout } from './useManagedTimeout'

export function useTransientFlag(defaultDurationMs: number) {
  const [isActive, setIsActive] = useState(false)
  const { clear: clearTimer, schedule } = useManagedTimeout()

  const clear = useCallback(() => {
    clearTimer()
    setIsActive(false)
  }, [clearTimer])

  const activate = useCallback(
    (durationMs = defaultDurationMs) => {
      clearTimer()
      setIsActive(true)
      schedule(() => {
        setIsActive(false)
      }, durationMs)
    },
    [clearTimer, defaultDurationMs, schedule]
  )

  return [isActive, activate, clear] as const
}
