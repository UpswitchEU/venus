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
import { getApiUrl } from '../../../utils/getMercuryUrl'
import { createContextLogger } from '../../../utils/logger'
import { getFirstRenderableReportHtml } from '../../../utils/safetyNetReportHtml'

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
const VERSION_API_TIMEOUT_MS = 10_000 // 10s - prevents indefinite hangs

export class VersionAPI {
  private baseURL: string
  /** Use same-origin proxy in browser to avoid CORS; direct Titan URL in Node */
  private useProxy: boolean

  constructor() {
    this.useProxy = typeof window !== 'undefined'
    this.baseURL = this.useProxy ? '' : getApiUrl()
  }

  /** Resolve URL: proxy path for browser, Titan path for server */
  private resolveUrl(path: string): string {
    if (this.useProxy) {
      // Proxy: /api/valuations/sessions/... maps to Titan /api/v2/valuations/sessions/...
      return path.replace('/api/v2/valuations/sessions/', '/api/valuations/sessions/')
    }
    return `${this.baseURL}${path}`
  }

  /**
   * Execute API request with error handling and timeout
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
    const url = this.resolveUrl(config.url)
    const controller = new AbortController()
    const timeoutId = setTimeout(
      () => controller.abort(),
      options?.timeout ?? VERSION_API_TIMEOUT_MS
    )
    if (options?.signal) {
      options.signal.addEventListener('abort', () => controller.abort())
    }
    const signal = controller.signal

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: config.data ? JSON.stringify(config.data) : undefined,
        credentials: 'include',
        signal,
      })

      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`)
      }

      return response.json()
    } finally {
      clearTimeout(timeoutId)
    }
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
        changes_summary: request.changesSummary,
        notes: request.notes,
        tags: request.tags,
        normalization_data: request.normalization_data,
        tax_latency_data: request.tax_latency_data,
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
   * Delete version
   *
   * @param reportId - Report identifier
   * @param versionNumber - Version number to delete
   */
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
   * Compare two versions
   *
   * @param reportId - Report identifier
   * @param versionA - First version number
   * @param versionB - Second version number
   * @returns Comparison result with highlighted changes
   */
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

      const response = await this.executeRequest<{
        success: boolean
        data: any
      }>(
        {
          method: 'POST',
          url: `/api/v2/valuations/sessions/${reportId}/versions/${versionNumber}/restore`,
          headers: {},
        },
        options
      )

      if (response.data) {
        return this.transformVersionFromBackend(response.data)
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
    // Extract version_data which contains formData and valuationResult
    const versionData = backendVersion.version_data || {}

    return {
      id: backendVersion.id,
      reportId: backendVersion.report_id || backendVersion.reportId,
      versionNumber: backendVersion.version_number,
      versionLabel: backendVersion.version_label || `Version ${backendVersion.version_number}`,
      createdAt: new Date(backendVersion.created_at),
      createdBy: backendVersion.created_by || null,
      // Extract formData from multiple possible locations
      formData:
        backendVersion.formData ||
        versionData.formData ||
        versionData.inputs ||
        backendVersion.form_data ||
        {},
      // Extract valuationResult from multiple possible locations
      valuationResult:
        backendVersion.valuationResult ||
        versionData.valuationResult ||
        versionData.outputs ||
        backendVersion.valuation_result ||
        null,
      // Extract HTML reports from multiple possible locations
      htmlReport:
        getFirstRenderableReportHtml(
          backendVersion.htmlReport,
          versionData.htmlReport,
          versionData.outputs?.html_report,
          versionData.outputs?.details?.html_report,
          backendVersion.html_report
        ) || null,
      changesSummary: backendVersion.changesSummary ||
        backendVersion.changes_summary || { totalChanges: 0, significantChanges: [] },
      isActive: backendVersion.isActive || backendVersion.is_active || false,
      isPinned: backendVersion.isPinned || backendVersion.is_pinned || false,
      calculationDuration_ms:
        backendVersion.calculationDuration_ms || backendVersion.calculation_duration_ms,
      tags: backendVersion.tags || [],
      notes: backendVersion.notes,
      normalization_data:
        backendVersion.normalization_data ||
        versionData.normalization_data ||
        undefined,
      tax_latency_data:
        backendVersion.tax_latency_data ||
        versionData.tax_latency_data ||
        undefined,
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
  async getConversationsByVersion(versionId: string, options?: APIRequestConfig): Promise<any[]> {
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
