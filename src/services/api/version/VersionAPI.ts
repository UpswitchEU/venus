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

export interface APIRequestConfig {
  signal?: AbortSignal
  timeout?: number
}

const versionLogger = createContextLogger('VersionAPI')

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
 * Note: Uses direct fetch calls since backend endpoints don't exist yet
 */
export class VersionAPI {
  private baseURL: string

  constructor() {
    this.baseURL =
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      'https://api.upswitch.app'
  }

  /**
   * Execute API request with error handling
   */
  private async executeRequest<T>(
    config: {
      method: string
      url: string
      data?: any
      headers?: Record<string, string>
    },
    options?: APIRequestConfig
  ): Promise<T> {
    const url = `${this.baseURL}${config.url}`

    const response = await fetch(url, {
      method: config.method,
      headers: {
        'Content-Type': 'application/json',
        ...config.headers,
      },
      body: config.data ? JSON.stringify(config.data) : undefined,
      credentials: 'include',
      signal: options?.signal,
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
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
      const response = await this.executeRequest<{
        success: boolean
        data: {
          versions: any[]
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
      const versions: ValuationVersion[] = response.data.versions.map((v: any) =>
        this.transformVersionFromBackend(v)
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

      const response = await this.executeRequest<{
        success: boolean
        data: any
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

      const version = this.transformVersionFromBackend(response.data)

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

      // Transform to backend format
      const backendRequest = {
        version_label: request.versionLabel,
        form_data: request.formData,
        valuation_result: request.valuationResult,
        html_report: request.htmlReport,
        info_tab_html: request.infoTabHtml,
        changes_summary: request.changesSummary,
        notes: request.notes,
        tags: request.tags,
      }

      const response = await this.executeRequest<{
        success: boolean
        data: any
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

      const version = this.transformVersionFromBackend(response.data)

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
   * Update version metadata
   *
   * @param reportId - Report identifier
   * @param versionNumber - Version number to update
   * @param updates - Metadata updates
   * @returns Updated version
   */
  async updateVersion(
    reportId: string,
    versionNumber: number,
    updates: UpdateVersionRequest,
    options?: APIRequestConfig
  ): Promise<ValuationVersion> {
    try {
      versionLogger.info('Updating version metadata', {
        reportId,
        versionNumber,
        updates,
      })

      const response = await this.executeRequest<{
        success: boolean
        data: any
      }>(
        {
          method: 'PATCH',
          url: `/api/v2/valuations/sessions/${reportId}/versions/${versionNumber}`,
          data: {
            version_label: updates.versionLabel,
            notes: updates.notes,
            tags: updates.tags,
            is_pinned: updates.isPinned,
          },
          headers: {},
        },
        options
      )

      if (!response.data) {
        throw new Error('No data in response')
      }

      const version = this.transformVersionFromBackend(response.data)

      versionLogger.info('Version metadata updated', { reportId, versionNumber })

      return version
    } catch (error) {
      versionLogger.error('Failed to update version', {
        reportId,
        versionNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Delete version
   *
   * @param reportId - Report identifier
   * @param versionNumber - Version number to delete
   */
  async deleteVersion(
    reportId: string,
    versionNumber: number,
    options?: APIRequestConfig
  ): Promise<void> {
    try {
      versionLogger.info('Deleting version', { reportId, versionNumber })

      await this.executeRequest<{ success: boolean }>(
        {
          method: 'DELETE',
          url: `/api/v2/valuations/sessions/${reportId}/versions/${versionNumber}`,
          headers: {},
        },
        options
      )

      versionLogger.info('Version deleted', { reportId, versionNumber })
    } catch (error) {
      versionLogger.error('Failed to delete version', {
        reportId,
        versionNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
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

      const response = await this.executeRequest<{
        success: boolean
        data: any
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

      // Transform backend response
      const comparison: VersionComparison = {
        versionA: this.transformVersionFromBackend(response.data.version_a),
        versionB: this.transformVersionFromBackend(response.data.version_b),
        changes: response.data.changes || {},
        valuationDelta: response.data.valuation_delta
          ? {
              absoluteChange: response.data.valuation_delta.absolute_change,
              percentChange: response.data.valuation_delta.percent_change,
              direction: response.data.valuation_delta.direction,
            }
          : null,
        highlights: response.data.highlights || [],
      }

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
      const response = await this.executeRequest<{
        success: boolean
        data: any
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

      return {
        totalVersions: response.data.total_versions,
        averageTimeBetweenVersions_hours: response.data.avg_time_between_versions_hours,
        mostChangedFields: response.data.most_changed_fields || [],
        averageValuationChange_percent: response.data.avg_valuation_change_percent,
        firstVersion: {
          number: response.data.first_version.number,
          createdAt: new Date(response.data.first_version.created_at),
        },
        latestVersion: {
          number: response.data.latest_version.number,
          createdAt: new Date(response.data.latest_version.created_at),
        },
      }
    } catch (error) {
      versionLogger.error('Failed to fetch statistics', {
        reportId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      throw error
    }
  }

  /**
   * Transform backend version to frontend type
   *
   * Normalizes field names and date objects.
   */
  private transformVersionFromBackend(backendVersion: any): ValuationVersion {
    return {
      id: backendVersion.id,
      reportId: backendVersion.report_id,
      versionNumber: backendVersion.version_number,
      versionLabel: backendVersion.version_label || `Version ${backendVersion.version_number}`,
      createdAt: new Date(backendVersion.created_at),
      createdBy: backendVersion.created_by || null,
      formData: backendVersion.form_data,
      valuationResult: backendVersion.valuation_result || null,
      htmlReport: backendVersion.html_report || null,
      infoTabHtml: backendVersion.info_tab_html || null,
      changesSummary: backendVersion.changes_summary || { totalChanges: 0, significantChanges: [] },
      isActive: backendVersion.is_active || false,
      isPinned: backendVersion.is_pinned || false,
      calculationDuration_ms: backendVersion.calculation_duration_ms,
      tags: backendVersion.tags || [],
      notes: backendVersion.notes,
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

    return this.createVersion({
      ...request,
      context: { conversationId },
    } as CreateVersionRequest, options)
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
  ): Promise<{
    conversation: any
    triggerMessage: any
    triggerType: string
    context: any
  } | null> {
    try {
      versionLogger.info('Fetching conversation context', { versionId })

      const response = await this.executeRequest<{
        success: boolean
        data: any
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

      versionLogger.info('Conversation context fetched', { versionId })

      return {
        conversation: response.data.conversation,
        triggerMessage: response.data.trigger_message,
        triggerType: response.data.trigger_type,
        context: response.data.context,
      }
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
  ): Promise<any[]> {
    try {
      const response = await this.executeRequest<{
        success: boolean
        data: any[]
      }>(
        {
          method: 'GET',
          url: `/api/valuation-versions/${versionId}/conversations`,
          headers: {},
        },
        options
      )

      return response.data || []
    } catch (error) {
      versionLogger.error('Failed to fetch conversations', {
        versionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      return []
    }
  }
}
