/** Shown when Venus BFF or Titan bootstrap exceeds the proxy budget (503/504/408). */
export const BOOTSTRAP_TIMEOUT_USER_MESSAGE =
  'Valuation is taking longer than expected. Please try again in a moment.'

/** Shown when loadSession runs before useBootstrapSync has called setEngine(). */
export const SESSION_NOT_READY_USER_MESSAGE =
  'Session is still initializing. Please wait a moment and try again.'
