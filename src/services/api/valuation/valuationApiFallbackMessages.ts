/**
 * English fallbacks the valuation API layer puts on errors when the server sent no message of
 * its own. They reach the UI as `error.message`, so toasts must show localized copy instead.
 */
export const VALUATION_INVALID_DATA_FALLBACK_MESSAGE = 'Invalid valuation data provided.'
export const VALUATION_SERVICE_UNAVAILABLE_FALLBACK_MESSAGE =
  'Service temporarily unavailable. Please try again in a moment.'

export function isValuationApiFallbackMessage(message: string): boolean {
  return (
    message === VALUATION_INVALID_DATA_FALLBACK_MESSAGE ||
    message === VALUATION_SERVICE_UNAVAILABLE_FALLBACK_MESSAGE
  )
}
