import { useCallback, useEffect, useRef } from 'react'

/**
 * Tracks whether a real person has edited the form on this page.
 *
 * Deliberately driven by native `input` / `change` / `keydown` events rather
 * than by the panel's `onFormDataChange` callback. That callback is NOT an
 * interaction signal: `useManualInputFormDataSync` invokes it from a mount
 * effect (and again 300ms later) to push prefill into the store, so reading it
 * as "the advisor typed" marks every delegated open as edited before the
 * advisor has touched anything.
 *
 * Programmatic value assignment never dispatches these events, so hydration,
 * restoration and assistant-applied patches do not trip the flag.
 *
 * Known gap: selecting a value in a fully custom mouse-driven widget that
 * dispatches neither `change` nor a key event is not observed. That is
 * deliberate — the flag only ever suppresses an automatic start, and failing
 * to suppress is the mode we care about, so a narrow, false-positive-free
 * signal beats a broad one.
 */
export function useAdvisorFormInteraction(): () => boolean {
  const interactedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const markInteracted = () => {
      interactedRef.current = true
    }
    const options = { capture: true } as const
    window.addEventListener('input', markInteracted, options)
    window.addEventListener('change', markInteracted, options)
    window.addEventListener('keydown', markInteracted, options)
    return () => {
      window.removeEventListener('input', markInteracted, options)
      window.removeEventListener('change', markInteracted, options)
      window.removeEventListener('keydown', markInteracted, options)
    }
  }, [])

  return useCallback(() => interactedRef.current, [])
}
