/**
 * Smoothly reveals streamed AI text so bursty network delivery reads like
 * even, fluid typing — the Claude / ChatGPT / Cursor streaming feel.
 *
 * The transport (SSE) appends to the message in uneven bursts: a word, then a
 * 300-char block, then a stall. Painting those bursts verbatim is what makes
 * streaming look "chunky". This hook decouples *display* from *arrival*: it
 * keeps a "revealed" cursor that advances toward `fullText.length` on every
 * animation frame at an adaptive, eased rate — fast when far behind, gentle as
 * it catches up, and quick-but-smooth once the stream ends so no text is ever
 * left hidden.
 *
 * Pass the full accumulated message text (what the store already holds) plus
 * whether the message is actively streaming. Completed messages (history) and
 * reduced-motion users get the full text immediately, with no animation.
 */

import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from '@/hooks/useReducedMotion'

export interface SmoothStreamedText {
  /** The text to render right now — always a prefix of `fullText`. */
  text: string
  /** True while the reveal is still catching up to `fullText`. */
  isAnimating: boolean
}

// Tuning. `tau` is the time-constant of the exponential catch-up: roughly the
// time to reveal ~63% of the current backlog. A small `tau` once the stream
// ends drains the tail fast but still smoothly. Rates are chars/second.
const TAU_STREAMING = 0.16
const TAU_DRAINING = 0.06
const MIN_RATE_STREAMING = 40
const MIN_RATE_DRAINING = 160
const MAX_RATE = 2200 // ceiling so a huge pasted block never animates for seconds
const MAX_FRAME_SECONDS = 1 / 30 // clamp dt so a backgrounded tab doesn't dump the buffer

export function useSmoothStreamedText(fullText: string, isStreaming: boolean): SmoothStreamedText {
  const prefersReducedMotion = useReducedMotion()

  // rAF is absent during SSR and some test environments — fall back to showing
  // everything immediately so content is never withheld.
  const canAnimate =
    typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function'
  const shouldAnimate = canAnimate && !prefersReducedMotion

  const [revealed, setRevealed] = useState(() =>
    shouldAnimate && isStreaming ? 0 : fullText.length
  )

  const fullTextRef = useRef(fullText)
  const isStreamingRef = useRef(isStreaming)
  const revealedRef = useRef(revealed)
  const rafRef = useRef<number | null>(null)
  const lastTsRef = useRef<number | null>(null)

  fullTextRef.current = fullText
  isStreamingRef.current = isStreaming
  revealedRef.current = revealed

  // biome-ignore lint/correctness/useExhaustiveDependencies: shouldAnimate gates this effect and must re-run it if reduced-motion toggles mid-stream.
  useEffect(() => {
    // Reduced motion / no rAF: reveal everything, stop any running loop.
    if (!shouldAnimate) {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (revealedRef.current !== fullText.length) setRevealed(fullText.length)
      return
    }

    // Message was replaced by a shorter string (reset / error swap): never let
    // the cursor sit past the end.
    if (revealedRef.current > fullText.length) {
      revealedRef.current = fullText.length
      setRevealed(fullText.length)
      return
    }

    // Already caught up, or a loop is already running and self-perpetuating.
    if (revealedRef.current >= fullText.length) return
    if (rafRef.current != null) return

    const tick = (ts: number) => {
      const last = lastTsRef.current
      lastTsRef.current = ts
      const dt = last == null ? 1 / 60 : Math.min((ts - last) / 1000, MAX_FRAME_SECONDS)

      const target = fullTextRef.current.length
      const current = Math.min(revealedRef.current, target)
      const remaining = target - current

      if (remaining <= 0) {
        // Caught up. Stop; the effect re-arms the loop when more text arrives.
        rafRef.current = null
        lastTsRef.current = null
        if (revealedRef.current !== target) {
          revealedRef.current = target
          setRevealed(target)
        }
        return
      }

      const streaming = isStreamingRef.current
      const tau = streaming ? TAU_STREAMING : TAU_DRAINING
      const minRate = streaming ? MIN_RATE_STREAMING : MIN_RATE_DRAINING
      const rate = Math.min(Math.max(remaining / tau, minRate), MAX_RATE)
      const step = Math.max(1, Math.round(rate * dt))
      const next = Math.min(current + step, target)

      revealedRef.current = next
      setRevealed(next)
      rafRef.current = requestAnimationFrame(tick)
    }

    lastTsRef.current = null
    rafRef.current = requestAnimationFrame(tick)
    // Intentionally no cleanup here: the loop self-perpetuates and reads the
    // latest text from refs, so re-renders must NOT cancel + restart it. The
    // dedicated unmount effect below releases it.
  }, [fullText, isStreaming, shouldAnimate])

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  const text = shouldAnimate ? fullText.slice(0, revealed) : fullText
  const isAnimating = shouldAnimate && revealed < fullText.length
  return { text, isAnimating }
}
