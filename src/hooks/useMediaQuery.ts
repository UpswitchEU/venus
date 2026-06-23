import { useEffect, useState } from 'react'

export interface MediaQueryState {
  hasMeasured: boolean
  matches: boolean
}

export interface UseMediaQueryOptions {
  defaultMatches?: boolean
  getFallbackMatches?: () => boolean
}

export function useMediaQuery(
  query: string,
  { defaultMatches = false, getFallbackMatches }: UseMediaQueryOptions = {}
): MediaQueryState {
  const [state, setState] = useState<MediaQueryState>({
    hasMeasured: false,
    matches: defaultMatches,
  })

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = typeof window.matchMedia === 'function' ? window.matchMedia(query) : null
    const readMatches = () => mediaQuery?.matches ?? getFallbackMatches?.() ?? defaultMatches
    const syncState = () =>
      setState((current) => {
        const matches = readMatches()
        if (current.hasMeasured && current.matches === matches) return current
        return { hasMeasured: true, matches }
      })

    syncState()

    if (mediaQuery) {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', syncState)
        return () => mediaQuery.removeEventListener('change', syncState)
      }

      mediaQuery.addListener(syncState)
      return () => mediaQuery.removeListener(syncState)
    }

    if (!getFallbackMatches) return

    window.addEventListener('resize', syncState)
    window.addEventListener('orientationchange', syncState)
    return () => {
      window.removeEventListener('resize', syncState)
      window.removeEventListener('orientationchange', syncState)
    }
  }, [defaultMatches, getFallbackMatches, query])

  return state
}
