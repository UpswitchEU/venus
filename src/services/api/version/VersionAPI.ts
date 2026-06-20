/**
 * Version API Service
 *
 * Single Responsibility: Handle all version-related API operations
 * Manages version CRUD, comparison, and history for M&A workflow
 *
 * @module services/api/version/VersionAPI
 */

import type {
  CreateVersionRequest,
  UpdateVersionRequest,
  ValuationVersion,
  VersionComparison,
  VersionFilterOptions,
  VersionListResponse,
  VersionStatistics,
} from '../../../types/ValuationVersion'
import { createContextLogger } from '../../../utils/logger'
import { type APIRequestConfig, VersionAPIClient } from './VersionAPIClient'
import {
  buildCreateVersionBackendRequest,
  transformVersionComparison,
  transformVersionConversationContext,
  transformVersionFromBackend,
  transformVersionStatistics,
  type VersionConversationContext,
} from './VersionAPITransforms'

const versionLogger = createContextLogger('VersionAPI')

export type { APIRequestConfig } from './VersionAPIClient'

/**
 * Version API
 *
 * Handles version lifecycle:
 * - Create new version (on regenerate)
 * - List version history
 * - Get specific version
 * - Compare versions
 * - Update version metadata (label, notes, tags)
 * - Delete version
 *
 * Backend endpoints (to be implemented):
 * - GET /api/v2/valuations/sessions/:reportId/versions
 * - POST /api/v2/valuations/sessions/:reportId/versions
 * - GET /api/v2/valuations/sessions/:reportId/versions/:versionNumber
 * - PATCH /api/v2/valuations/sessions/:reportId/versions/:versionNumber
 * - DELETE /api/v2/valuations/sessions/:reportId/versions/:versionNumber
 * - GET /api/v2/valuations/sessions/:reportId/versions/compare?v1=1&v2=3
 * - GET /api/v2/valuations/sessions/:reportId/versions/statistics
 *
 * Transport details live in VersionAPIClient so this class stays focused on
 * endpoint semantics and response shaping.
 */
export class VersionAPI {
  private readonly client: VersionAPIClient

  constructor() {
    this.client = new VersionAPIClient()
  }
  /**
   * List all versions for a report
   *
   * @param reportId - Report identifier
   * @param options - Filter and pagination options
   * @returns Version list with metadata
   */
  async listVersions(
    reportId: string,
    options?: VersionFilterOptions & APIRequestConfig
  ): Promise<VersionListResponse> {
    try {
      versionLogger.info('Fetching version history', { reportId, options })

      // Build query params
      const params = new URLSearchParams()
      if (options?.limit) params.append('limit', options.limit.toString())
      if (options?.offset) params.append('offset', options.offset.toString())
      if (options?.tags) params.append('tags', options.tags.join(','))
      if (options?.pinnedOnly) params.append('pinned', 'true')

      const query = params.toString()
      const url = `/api/v2/valuations/sessions/${reportId}/versions${query ? `?${query}` : ''}`

      // Backend endpoint returns:
      // { success: true, data: { versions: [...], total: N, active_version: N } }
      const response = await this.client.request<{
        success: boolean
        data: {
          versions: unknown[]
          total: number
          active_version: number
          has_more: boolean
          next_cursor?: string
        }
      }>(
        {
          method: 'GET',
          url,
          headers: {},
        },
        options
      )

      if (!response.data) {
        throw new Error('No data in response')
      }

      // Transform backend response to frontend types
      const versions: ValuationVersion[] = response.data.versions.map((v) =>
        transformVersionFromBackend(v)
      )

      const result: VersionListResponse = {
        reportId,
        versions,
        totalVersions: response.data.total,
        activeVersion: response.data.active_version,
        hasMore: response.data.has_more,
        nextCursor: response.data.next_cursor,
      }

      versionLogger.info('Version history fetched', {
        reportId,
        versionCount: versions.length,
        activeVersion: result.activeVersion,
      })

      return result
    } catch (error) {
      versionLogger.error('Failed to fetch version history', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      // Graceful fallback - return empty versions
      return {
        reportId,
        versions: [],
        totalVersions: 0,
        activeVersion: 1,
        hasMore: false,
      }
    }
  }

  /**
   * Get specific version by number
   *
   * @param reportId - Report identifier
   * @param versionNumber - Version number (1, 2, 3...)
   * @returns Version data
   */
  async getVersion(
    reportId: string,
    versionNumber: number,
    options?: APIRequestConfig
  ): Promise<ValuationVersion | null> {
    try {
      versionLogger.info('Fetching specific version', { reportId, versionNumber })

      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'GET',
          url: `/api/v2/valuations/sessions/${reportId}/versions/${versionNumber}`,
          headers: {},
        },
        options
      )

      if (!response.data) {
        return null
      }

      const version = transformVersionFromBackend(response.data)

      versionLogger.info('Version fetched', { reportId, versionNumber })

      return version
    } catch (error) {
      versionLogger.error('Failed to fetch version', {
        reportId,
        versionNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Create new version
   *
   * Called when user regenerates valuation with updated data.
   *
   * @param request - Create version request
   * @returns Created version
   */
  async createVersion(
    request: CreateVersionRequest,
    options?: APIRequestConfig
  ): Promise<ValuationVersion> {
    try {
      versionLogger.info('Creating new version', {
        reportId: request.reportId,
        hasLabel: !!request.versionLabel,
      })

      const backendRequest = buildCreateVersionBackendRequest(request)

      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'POST',
          url: `/api/v2/valuations/sessions/${request.reportId}/versions`,
          data: backendRequest,
          headers: {},
        },
        options
      )

      if (!response.data) {
        throw new Error('No data in response')
      }

      const version = transformVersionFromBackend(response.data)

      versionLogger.info('Version created', {
        reportId: request.reportId,
        versionNumber: version.versionNumber,
        versionLabel: version.versionLabel,
      })

      return version
    } catch (error) {
      versionLogger.error('Failed to create version', {
        reportId: request.reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Update version metadata (local-only).
   *
   * Titan does not have a PATCH endpoint for versions yet.
   * Updates are stored in the local Zustand store only.
   * Backend support will be added in a future release.
   */
  async updateVersion(
    reportId: string,
    versionNumber: number,
    updates: UpdateVersionRequest,
    _options?: APIRequestConfig
  ): Promise<ValuationVersion> {
    versionLogger.warn('updateVersion: local-only (no backend endpoint)', {
      reportId,
      versionNumber,
      updates,
    })

    // Return a minimal version object so callers can update local state
    return {
      id: `local-${reportId}-${versionNumber}`,
      reportId,
      versionNumber,
      versionLabel: updates.versionLabel || `Versie ${versionNumber}`,
      notes: updates.notes,
      tags: updates.tags,
      isPinned: updates.isPinned,
      isActive: false,
    } as ValuationVersion
  }

  /**
   * Delete version (local-only).
   *
   * Titan does not have a DELETE endpoint for versions yet.
   * Deletion is applied to the local Zustand store only.
   * Backend support will be added in a future release.
   */
  async deleteVersion(
    reportId: string,
    versionNumber: number,
    _options?: APIRequestConfig
  ): Promise<void> {
    versionLogger.warn('deleteVersion: local-only (no backend endpoint)', {
      reportId,
      versionNumber,
    })
    // No-op — local store removal handled by caller
  }

  /**
   * Restore a version via Titan's POST restore endpoint.
   * Creates a new version that is a copy of the specified version.
   */
  async restoreVersion(
    reportId: string,
    versionNumber: number,
    options?: APIRequestConfig
  ): Promise<ValuationVersion | null> {
    try {
      versionLogger.info('Restoring version via Titan', { reportId, versionNumber })

      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'POST',
          url: `/api/v2/valuations/sessions/${reportId}/versions/${versionNumber}/restore`,
          headers: {},
        },
        options
      )

      if (response.data) {
        return transformVersionFromBackend(response.data)
      }
      return null
    } catch (error) {
      versionLogger.warn('Restore via backend failed (will use local restore)', {
        reportId,
        versionNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Compare two versions
   *
   * @param reportId - Report identifier
   * @param versionA - First version number
   * @param versionB - Second version number
   * @returns Comparison result with highlighted changes
   */
  async compareVersions(
    reportId: string,
    versionA: number,
    versionB: number,
    options?: APIRequestConfig
  ): Promise<VersionComparison> {
    try {
      versionLogger.info('Comparing versions', { reportId, versionA, versionB })

      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'GET',
          url: `/api/v2/valuations/sessions/${reportId}/versions/compare?v1=${versionA}&v2=${versionB}`,
          headers: {},
        },
        options
      )

      if (!response.data) {
        throw new Error('No data in response')
      }

      const comparison = transformVersionComparison(response.data)

      versionLogger.info('Versions compared', { reportId, versionA, versionB })

      return comparison
    } catch (error) {
      versionLogger.error('Failed to compare versions', {
        reportId,
        versionA,
        versionB,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Get version statistics
   *
   * @param reportId - Report identifier
   * @returns Aggregated statistics
   */
  async getStatistics(reportId: string, options?: APIRequestConfig): Promise<VersionStatistics> {
    try {
      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'GET',
          url: `/api/v2/valuations/sessions/${reportId}/versions/statistics`,
          headers: {},
        },
        options
      )

      if (!response.data) {
        throw new Error('No data in response')
      }

      return transformVersionStatistics(response.data)
    } catch (error) {
      versionLogger.error('Failed to fetch statistics', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Create version with conversation context
   *
   * Used when version is created from a Mercury conversation
   *
   * @param reportId - Report identifier
   * @param conversationId - Mercury conversation ID
   * @param request - Create version request
   * @returns Created version
   */
  async createVersionFromConversation(
    reportId: string,
    conversationId: string,
    request: CreateVersionRequest,
    options?: APIRequestConfig
  ): Promise<ValuationVersion> {
    versionLogger.info('Creating version from conversation', {
      reportId,
      conversationId,
    })

    return this.createVersion(
      {
        ...request,
        context: { conversationId },
      } as CreateVersionRequest,
      options
    )
  }

  /**
   * Get conversation context for a version
   *
   * Returns Mercury conversation details that influenced this version
   *
   * @param versionId - Version identifier
   * @returns Conversation context or null
   */
  async getConversationContext(
    versionId: string,
    options?: APIRequestConfig
  ): Promise<VersionConversationContext | null> {
    try {
      versionLogger.info('Fetching conversation context', { versionId })

      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'GET',
          url: `/api/valuation-versions/${versionId}/conversation-context`,
          headers: {},
        },
        options
      )

      if (!response.data) {
        return null
      }

      const context = transformVersionConversationContext(response.data)
      if (!context) return null

      versionLogger.info('Conversation context fetched', { versionId })

      return context
    } catch (error) {
      versionLogger.error('Failed to fetch conversation context', {
        versionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return null
    }
  }

  /**
   * Get all conversations that influenced a version
   *
   * @param versionId - Version identifier
   * @returns Array of conversations
   */
  async getConversationsByVersion(
    versionId: string,
    options?: APIRequestConfig
  ): Promise<unknown[]> {
    try {
      const response = await this.client.request<{
        success: boolean
        data: unknown
      }>(
        {
          method: 'GET',
          url: `/api/valuation-versions/${versionId}/conversations`,
          headers: {},
        },
        options
      )

      return Array.isArray(response.data) ? response.data : []
    } catch (error) {
      versionLogger.error('Failed to fetch conversations', {
        versionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return []
    }
  }
}
