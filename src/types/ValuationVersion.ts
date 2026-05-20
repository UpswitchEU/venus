/**
 * Valuation Version Types
 *
 * Single Responsibility: Define types for valuation versioning system
 * Enables M&A workflow with version history, comparison, and audit trail
 *
 * @module types/ValuationVersion
 */

import type { TaxLatencyItem } from '../store/useTaxLatencyStore'
import type { ValuationRequest, ValuationResponse } from './valuation'

/**
 * Valuation Version
 *
 * Represents a snapshot of a valuation at a specific point in time.
 * Each version is immutable once created.
 *
 * Use Cases:
 * - Track changes over M&A due diligence period
 * - Compare valuations before/after discoveries
 * - Maintain audit trail for compliance
 * - Enable scenario analysis (Conservative, Base, Optimistic)
 */
export interface ValuationVersion {
  // Version metadata
  id: string // version_uuid (e.g., "version_1765751234567_abc123")
  reportId: string // Links to valuation_sessions
  versionNumber: number // Sequential: 1, 2, 3, 4...
  versionLabel: string // User-friendly label (e.g., "Initial", "Q4 Update")

  // Timestamps
  createdAt: Date // When this version was created
  createdBy: string | null // User ID or 'guest'

  // Snapshot of data at this version
  formData: ValuationRequest // Input data used for calculation
  valuationResult: ValuationResponse | null // Calculation result
  htmlReport: string | null // Generated HTML report

  // Changes from previous version (for audit and comparison)
  changesSummary: VersionChanges

  // Version state
  isActive: boolean // Current/latest version
  isPinned: boolean // User-pinned for quick access

  // Metadata
  calculationDuration_ms?: number // How long calculation took
  tags?: string[] // User-defined tags (e.g., ["conservative", "q4-2025"])
  notes?: string // User notes for this version
  changeMetadata?: {
    normalized_years?: number[] // Years with EBITDA normalization
    adjustment_count?: number // Total adjustment count
    [key: string]: unknown // Allow other metadata
  }

  // Normalization data snapshot
  normalization_data?: {
    [year: string]: {
      reported_ebitda: number // Original EBITDA from financials
      normalized_ebitda: number // Adjusted EBITDA used in valuation
      total_adjustments: number // Net adjustment amount
      adjustments: Array<{
        category: string // e.g., "owner_compensation_adjustment"
        amount: number
        note?: string
      }>
      custom_adjustments?: Array<{
        description: string
        amount: number
        note?: string
      }>
      confidence_score: string // 'low' | 'medium' | 'high'
      adjustment_percentage?: number // Adjustment as % of reported EBITDA
    }
  } // Immutable snapshot of normalization data at time of version creation

  // Tax latency data snapshot
  tax_latency_data?: TaxLatencyItem[] // Immutable snapshot of tax latencies at time of version creation
}

/**
 * Changes between versions
 *
 * Tracks what changed from previous version to this version.
 * Used for audit trail and comparison views.
 */
export interface VersionChanges {
  // Financial changes
  revenue?: FieldChange<number>
  ebitda?: FieldChange<number>
  netIncome?: FieldChange<number>
  totalAssets?: FieldChange<number>
  totalDebt?: FieldChange<number>
  cash?: FieldChange<number>

  // Business profile changes
  companyName?: FieldChange<string>
  foundingYear?: FieldChange<number>
  numberOfEmployees?: FieldChange<number>
  numberOfOwners?: FieldChange<number>
  sharesForSale?: FieldChange<number>

  // Business type and industry
  businessTypeId?: FieldChange<string>
  businessType?: FieldChange<string>
  industry?: FieldChange<string>
  businessModel?: FieldChange<string>
  countryCode?: FieldChange<string>

  // Additional metrics
  recurringRevenuePercentage?: FieldChange<number>

  // Summary statistics
  totalChanges: number // Number of fields changed
  significantChanges: string[] // List of fields with >10% change
}

/**
 * Field change tracking
 *
 * Records old value → new value for a specific field.
 */
export interface FieldChange<T> {
  from: T
  to: T
  percentChange?: number // For numeric fields
  timestamp: Date
}

/**
 * Version comparison result
 *
 * Result of comparing two versions side-by-side.
 */
export interface VersionComparison {
  versionA: ValuationVersion
  versionB: ValuationVersion

  // Changes between versions
  changes: VersionChanges

  // Valuation impact
  valuationDelta: {
    absoluteChange: number // €500K increase
    percentChange: number // 25% increase
    direction: 'increase' | 'decrease' | 'unchanged'
  } | null

  // Highlights for UI
  highlights: {
    field: string
    label: string // "Revenue"
    oldValue: unknown
    newValue: unknown
    impact: string // "+€500K (+25%)"
  }[]
}

/**
 * Version list response
 *
 * Response from API when fetching version history.
 */
export interface VersionListResponse {
  reportId: string
  versions: ValuationVersion[]
  totalVersions: number
  activeVersion: number // Current version number

  // Pagination (for reports with many versions)
  hasMore: boolean
  nextCursor?: string
}

/**
 * Create version request
 *
 * Request payload for creating new version.
 */
export interface CreateVersionRequest {
  reportId: string
  versionLabel?: string // Auto-generated if not provided
  formData: ValuationRequest
  valuationResult?: ValuationResponse
  htmlReport?: string
  notes?: string
  tags?: string[]

  // Changes from current version (auto-detected if not provided)
  changesSummary?: VersionChanges

  // Normalization data snapshot (captured from store at version creation)
  normalization_data?: ValuationVersion['normalization_data']

  // Tax latency data snapshot (captured from store at version creation)
  tax_latency_data?: TaxLatencyItem[]
}

/**
 * Update version request
 *
 * Request payload for updating version metadata.
 */
export interface UpdateVersionRequest {
  versionLabel?: string
  notes?: string
  tags?: string[]
  isPinned?: boolean
}

/**
 * Version filter options
 *
 * Options for filtering version history.
 */
export interface VersionFilterOptions {
  // Filter by tags
  tags?: string[]

  // Filter by date range
  startDate?: Date
  endDate?: Date

  // Filter by creator
  createdBy?: string

  // Show only pinned
  pinnedOnly?: boolean

  // Pagination
  limit?: number
  offset?: number
}

/**
 * Version statistics
 *
 * Aggregated statistics about version history.
 */
export interface VersionStatistics {
  totalVersions: number
  averageTimeBetweenVersions_hours: number
  mostChangedFields: Array<{ field: string; changeCount: number }>
  averageValuationChange_percent: number

  // Timeline
  firstVersion: {
    number: number
    createdAt: Date
  }
  latestVersion: {
    number: number
    createdAt: Date
  }
}
