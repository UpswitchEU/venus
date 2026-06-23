import { useMediaQuery } from './useMediaQuery'

export const MOBILE_VIEWPORT_WIDTH = 768
export const MOBILE_VIEWPORT_QUERY = `(max-width: ${MOBILE_VIEWPORT_WIDTH - 1}px)`

export function readMobileViewportFallback(): boolean {
  return typeof window !== 'undefined' && window.innerWidth < MOBILE_VIEWPORT_WIDTH
}

export function useMobileViewport() {
  return useMediaQuery(MOBILE_VIEWPORT_QUERY, {
    getFallbackMatches: readMobileViewportFallback,
  })
}
