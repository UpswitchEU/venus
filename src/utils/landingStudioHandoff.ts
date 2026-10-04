import {
  readBrowserRecoveryValue,
  removeBrowserRecoveryValue,
  WORKFLOW_RECOVERY_TTL_MS,
  writeBrowserRecoveryValue,
} from './browserRecoveryStorage'
import { sanitizeLandingPayload } from './startupHandoffPayload'

const STORAGE_KEY = 'venus_landing_studio_handoff'
const OPTIONS = { maxBytes: 100_000, allowLegacy: true }

/** One-use recovery across the founder's signup redirect. Never an access decision. */
export interface LandingStudioHandoff {
  studio: Record<string, unknown>
  formData: Record<string, unknown>
  written_at_ms: number
  source: 'landing'
}

function isHandoff(value: unknown): value is LandingStudioHandoff {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<LandingStudioHandoff>
  return (
    candidate.source === 'landing' &&
    typeof candidate.written_at_ms === 'number' &&
    Number.isFinite(candidate.written_at_ms) &&
    candidate.written_at_ms <= Date.now() &&
    Date.now() - candidate.written_at_ms < WORKFLOW_RECOVERY_TTL_MS &&
    !!candidate.studio &&
    typeof candidate.studio === 'object' &&
    !Array.isArray(candidate.studio) &&
    !!candidate.formData &&
    typeof candidate.formData === 'object' &&
    !Array.isArray(candidate.formData)
  )
}

export function writeLandingStudioHandoff(payload: {
  studio: Record<string, unknown>
  formData: Record<string, unknown>
}): void {
  const value: LandingStudioHandoff = {
    ...sanitizeLandingPayload(payload),
    written_at_ms: Date.now(),
    source: 'landing',
  }
  if (!writeBrowserRecoveryValue(STORAGE_KEY, value, OPTIONS)) {
    removeBrowserRecoveryValue(STORAGE_KEY)
  }
}

export function consumeLandingStudioHandoff(): LandingStudioHandoff | null {
  const value = readBrowserRecoveryValue(STORAGE_KEY, isHandoff, OPTIONS)
  removeBrowserRecoveryValue(STORAGE_KEY)
  return value ? { ...value, ...sanitizeLandingPayload(value) } : null
}

export function hasLandingStudioHandoff(): boolean {
  return readBrowserRecoveryValue(STORAGE_KEY, isHandoff, OPTIONS) !== null
}
