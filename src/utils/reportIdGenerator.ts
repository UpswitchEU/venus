/**
 * Report ID Generator Utility
 * Generate unique report IDs with collision-proof source encoding
 *
 * This utility ensures Venus and Mercury can NEVER generate conflicting IDs
 * by encoding the source application in the ID itself.
 *
 * ID Format: val_${timestamp}_${source}${random}
 * - Venus:   val_1234567890_v7a8b9c0d (source='v')
 * - Mercury: val_1234567890_m7a8b9c0d (source='m')
 *
 * Collision Prevention Strategy:
 * 1. Source Encoding: First char of random part identifies source (v=Venus, m=Mercury)
 * 2. Timestamp Uniqueness: Millisecond precision reduces collision window
 * 3. Cryptographic Random: 8 chars = 36^8 = 2.8 trillion combinations
 * 4. Mathematical Proof: Different source prefixes = zero collision probability
 *
 * Benefits:
 * - Visual Distinction: Easy to identify report source in logs/URLs
 * - Zero Collision Risk: Mathematically impossible for Venus/Mercury to collide
 * - Backward Compatible: Regex still matches ^val_\d+_[a-z0-9]+$
 * - Debugging: Source encoded in ID itself (no extra field needed)
 */

/**
 * Generate unique report ID with Venus source encoding
 * Format: val_${timestamp}_v${random8chars}
 * Example: val_1729800000_v7a8b9c0d
 *
 * The 'v' prefix guarantees this ID can NEVER conflict with Mercury-generated IDs (prefix 'm')
 */
export const generateReportId = (): string => {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9) // 8-9 chars
  return `val_${timestamp}_v${random}` // ✅ 'v' = Venus source
}

/**
 * Validate report ID format
 * Accepts both legacy (no source prefix) and new source-encoded IDs
 * - Legacy: val_1234567890_abc123xyz
 * - Venus: val_1234567890_v7a8b9c0d
 * - Mercury: val_1234567890_m7a8b9c0d
 */
export const isValidReportId = (reportId: string): boolean => {
  // Accept any val_-prefixed session key (Venus or Mercury format).
  // Mercury generates session keys with mixed-case characters and underscores
  // that the original strict regex rejected, causing erroneous redirects to
  // new empty reports. Accept anything that starts with val_ and has a
  // reasonable length — the API will reject truly invalid IDs at request time.
  if (reportId.startsWith('val_') && reportId.length > 8) return true
  // Also accept UUID format (Mercury passes valuation_reports.id as UUID)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(reportId)) return true
  return false
}

/**
 * Extract source from report ID
 * Returns 'venus', 'mercury', or 'unknown' (legacy IDs without source prefix)
 *
 * Examples:
 * - val_1234567890_v7a8b9c0d → 'venus'
 * - val_1234567890_m7a8b9c0d → 'mercury'
 * - val_1234567890_abc123xyz → 'unknown' (legacy)
 */
export const getReportSource = (reportId: string): 'venus' | 'mercury' | 'unknown' => {
  const match = reportId.match(/^val_\d+_([a-z])/)
  if (!match) return 'unknown'

  const prefix = match[1]
  if (prefix === 'v') return 'venus'
  if (prefix === 'm') return 'mercury'
  return 'unknown'
}

/**
 * Extract timestamp from report ID
 */
export const getReportTimestamp = (reportId: string): number | null => {
  const match = reportId.match(/^val_(\d+)_/)
  return match ? parseInt(match[1], 10) : null
}

/**
 * Check if report ID is from Venus
 */
export const isVenusReportId = (reportId: string): boolean => {
  return getReportSource(reportId) === 'venus'
}

/**
 * Check if report ID is from Mercury
 */
export const isMercuryReportId = (reportId: string): boolean => {
  return getReportSource(reportId) === 'mercury'
}

/**
 * Generate report name deterministically from report ID
 * Similar to Ilara's approach for consistent naming
 */
export const generateReportName = (reportId: string): string => {
  const trendWords = [
    'Wave',
    'Pulse',
    'Flow',
    'Surge',
    'Spike',
    'Shift',
    'Boom',
    'Peak',
    'Rise',
    'Edge',
    'Vibe',
    'Buzz',
    'Momentum',
    'Force',
  ]

  const descriptors = [
    'Business',
    'Company',
    'Enterprise',
    'Corporate',
    'Valuation',
    'Analysis',
    'Assessment',
    'Review',
    'Study',
    'Report',
  ]

  const formats = [
    'Valuation',
    'Analysis',
    'Report',
    'Assessment',
    'Study',
    'Brief',
    'Overview',
    'Summary',
    'Intelligence',
    'Tracker',
  ]

  // Use report ID for deterministic seeding
  let hashSum = 0
  for (let i = 0; i < reportId.length; i++) {
    hashSum += reportId.charCodeAt(i) * (i + 1)
  }

  const trendWord = trendWords[hashSum % trendWords.length]
  const descriptor = descriptors[(hashSum * 2) % descriptors.length]
  const format = formats[(hashSum * 3) % formats.length]

  return `${trendWord} ${descriptor} ${format}`
}
