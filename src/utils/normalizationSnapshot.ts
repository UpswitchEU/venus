/**
 * Normalization Snapshot Utility
 *
 * Shared utility for creating immutable normalization snapshots linked to versions
 * Used by both manual and conversational flows to ensure consistency
 *
 * @module utils/normalizationSnapshot
 */

import { normalizationService } from '../services/ebitdaNormalizationService'
import { generalLogger } from './logger'

/**
 * Snapshot draft normalizations to a specific version
 *
 * Creates immutable copies of draft normalizations (version_id = null)
 * and links them to the specified version for version control
 *
 * This function is used by both manual and conversational flows to ensure
 * consistent normalization snapshotting across the application
 *
 * @param sessionId - The session ID containing draft normalizations
 * @param versionId - The version ID to link snapshots to
 * @returns Promise that resolves when all snapshots are created
 */
export async function snapshotNormalizationsToVersion(
  sessionId: string,
  versionId: string
): Promise<void> {
  try {
    // Get all draft normalizations (version_id = null) for this session
    const drafts = await normalizationService.getAllNormalizations(sessionId)

    if (!drafts || drafts.length === 0) {
      generalLogger.info('No draft normalizations to snapshot', { sessionId, versionId })
      return
    }

    generalLogger.info('Snapshotting normalizations to version', {
      sessionId,
      versionId,
      draftCount: drafts.length,
    })

    // Create snapshot for each draft
    for (const draft of drafts) {
      await normalizationService.saveNormalization({
        session_id: sessionId,
        version_id: versionId,
        year: draft.year,
        reported_ebitda: draft.reported_ebitda,
        adjustments: draft.adjustments,
        custom_adjustments: draft.custom_adjustments || [],
        confidence_score: draft.confidence_score,
        market_rate_source: draft.market_rate_source || undefined,
      })
    }

    generalLogger.info('Normalization snapshots created successfully', {
      sessionId,
      versionId,
      count: drafts.length,
    })
  } catch (error) {
    generalLogger.error('Failed to snapshot normalizations', {
      sessionId,
      versionId,
      error: error instanceof Error ? error.message : String(error),
    })
    // Don't throw - normalization snapshot failure shouldn't fail the valuation
  }
}
