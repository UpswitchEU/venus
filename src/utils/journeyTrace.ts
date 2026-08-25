const JOURNEY_STORAGE_KEY = 'upswitch_valuation_journey_id.v1'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

let memoryJourneyId: string | null = null

function newJourneyId(): string {
  return crypto.randomUUID().toLowerCase()
}

function readStoredJourneyId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = window.sessionStorage.getItem(JOURNEY_STORAGE_KEY)
    return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null
  } catch {
    return null
  }
}

function readIncomingJourneyId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    const value = new URLSearchParams(window.location.search).get('journey_id')
    return value && UUID_PATTERN.test(value) ? value.toLowerCase() : null
  } catch {
    return null
  }
}

function persistJourneyId(journeyId: string): void {
  memoryJourneyId = journeyId
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(JOURNEY_STORAGE_KEY, journeyId)
  } catch {
    // Privacy-mode storage denial must not disable tracing for this app process.
  }
}

export function getOrCreateJourneyId(): string {
  const incoming = readIncomingJourneyId()
  if (incoming) {
    persistJourneyId(incoming)
    return incoming
  }
  const existing = readStoredJourneyId() ?? memoryJourneyId
  if (existing && UUID_PATTERN.test(existing)) return existing
  const created = newJourneyId()
  persistJourneyId(created)
  return created
}

/** Start one import → valuation → render → reopen journey for a new draft. */
export function beginNewJourney(): string {
  const created = readIncomingJourneyId() ?? newJourneyId()
  persistJourneyId(created)
  return created
}

/** W3C trace context: one fresh request span while journeyId stays stable. */
export function createTraceparent(): string {
  const traceId = crypto.randomUUID().replaceAll('-', '')
  const spanId = crypto.randomUUID().replaceAll('-', '').slice(0, 16)
  return `00-${traceId}-${spanId}-01`
}
