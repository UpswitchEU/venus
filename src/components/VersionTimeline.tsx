/**
 * Version Timeline Component
 *
 * Single Responsibility: Display version history timeline
 * Shows v1, v2, v3... with dates, labels, and quick navigation
 *
 * WORLD-CLASS: Supports pagination for reports with 100+ versions
 * - Shows first 10 versions by default
 * - "Load More" button for additional versions
 * - Smooth scroll to newly loaded versions
 *
 * @module components/VersionTimeline
 */

'use client'

import { useState, useCallback } from 'react'
import { ArrowDown, ArrowUp, Calendar, CheckCircle2, Loader2, Minus, ChevronDown } from 'lucide-react'
import { formatCurrency } from '../config/countries'
import type { ValuationVersion } from '../types/ValuationVersion'
import { formatChangesSummary } from '../utils/versionDiffDetection'

/** Number of versions to show initially and per "Load More" click */
const VERSIONS_PER_PAGE = 10

export interface VersionTimelineProps {
  versions: ValuationVersion[]
  activeVersion: number
  onVersionSelect: (versionNumber: number) => void
  onVersionPin?: (versionNumber: number) => void
  compact?: boolean
  /** Total version count (if different from versions.length, shows "Load More") */
  totalVersions?: number
  /** Callback to fetch more versions */
  onLoadMore?: () => Promise<void>
}

/**
 * Version Timeline
 *
 * Displays chronological version history with:
 * - Version labels and dates
 * - Valuation cards
 * - Change summaries
 *
 * Simplified design with harvest-50 background.
 *
 * @example
 * ```tsx
 * <VersionTimeline
 *   versions={versions}
 *   activeVersion={3}
 *   onVersionSelect={(v) => loadVersion(v)}
 * />
 * ```
 */
export function VersionTimeline({
  versions,
  activeVersion,
  onVersionSelect,
  onVersionPin,
  compact = false,
  totalVersions,
  onLoadMore,
}: VersionTimelineProps) {
  // WORLD-CLASS: Pagination state for large version lists
  const [displayCount, setDisplayCount] = useState(VERSIONS_PER_PAGE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  if (versions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium">No versions yet</p>
        <p className="text-sm mt-2">Versions will appear here after regenerating the valuation</p>
      </div>
    )
  }

  // ✅ FIX: Deduplicate versions by versionNumber to prevent duplicates
  // First deduplicate by id (exact duplicates), then by versionNumber
  const idMap = new Map<string, ValuationVersion>()
  versions.forEach((version) => {
    if (!idMap.has(version.id)) {
      idMap.set(version.id, version)
    }
  })
  const uniqueByIdVersions = Array.from(idMap.values())

  // Then deduplicate by versionNumber (keep latest createdAt)
  const versionMap = new Map<number, ValuationVersion>()
  uniqueByIdVersions.forEach((version) => {
    const existing = versionMap.get(version.versionNumber)
    if (!existing) {
      versionMap.set(version.versionNumber, version)
    } else {
      const versionCreatedAt = version.createdAt ? new Date(version.createdAt).getTime() : 0
      const existingCreatedAt = existing.createdAt ? new Date(existing.createdAt).getTime() : 0

      if (versionCreatedAt > existingCreatedAt) {
        versionMap.set(version.versionNumber, version)
      }
      // If timestamps are equal or both missing, keep the existing one (first encountered)
    }
  })

  // Sort versions by number (newest first for display)
  const sortedVersions = Array.from(versionMap.values()).sort(
    (a, b) => b.versionNumber - a.versionNumber
  )

  // WORLD-CLASS: Paginate displayed versions
  const displayedVersions = sortedVersions.slice(0, displayCount)
  const hasMoreToShow = sortedVersions.length > displayCount
  const totalCount = totalVersions ?? sortedVersions.length
  const hasMoreToFetch = totalCount > sortedVersions.length

  // Handle "Load More" click
  const handleLoadMore = useCallback(async () => {
    // If we have more versions in memory, just show them
    if (hasMoreToShow) {
      setDisplayCount((prev) => Math.min(prev + VERSIONS_PER_PAGE, sortedVersions.length))
      return
    }

    // If we need to fetch more from server
    if (hasMoreToFetch && onLoadMore) {
      setIsLoadingMore(true)
      try {
        await onLoadMore()
        setDisplayCount((prev) => prev + VERSIONS_PER_PAGE)
      } finally {
        setIsLoadingMore(false)
      }
    }
  }, [hasMoreToShow, hasMoreToFetch, onLoadMore, sortedVersions.length])

  return (
    <div className="w-full p-6">
      <div className="relative">
        {displayedVersions.map((version, index) => (
          <div key={version.id} className="relative pb-8">
            <VersionTimelineItem
              version={version}
              previousVersion={index < displayedVersions.length - 1 ? displayedVersions[index + 1] : null}
              isActive={version.versionNumber === activeVersion}
              isLatest={index === 0}
              onClick={() => onVersionSelect(version.versionNumber)}
              onPin={onVersionPin ? () => onVersionPin(version.versionNumber) : undefined}
              compact={compact}
            />
          </div>
        ))}

        {/* WORLD-CLASS: Load More button for pagination */}
        {(hasMoreToShow || hasMoreToFetch) && (
          <div className="flex justify-center pt-4 pb-2">
            <button
              onClick={handleLoadMore}
              disabled={isLoadingMore}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-muted hover:bg-foreground/10 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoadingMore ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  Load More ({displayCount} of {totalCount})
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Version Timeline Item
 *
 * Individual version entry in timeline.
 */
interface VersionTimelineItemProps {
  version: ValuationVersion
  previousVersion: ValuationVersion | null
  isActive: boolean
  isLatest: boolean
  onClick: () => void
  onPin?: () => void
  compact?: boolean
}

function VersionTimelineItem({
  version,
  previousVersion,
  isActive: _isActive, // Kept for backward compatibility but not used in rendering
  isLatest: _isLatest, // Kept for backward compatibility but not used in rendering
  onClick,
  onPin: _onPin, // Kept for backward compatibility but not used in rendering
  compact,
}: VersionTimelineItemProps) {
  const formatDate = (date: Date | string) => {
    try {
      const dateObj = date instanceof Date ? date : new Date(date)
      return dateObj.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (error) {
      return 'Invalid date'
    }
  }

  // Get valuation amounts
  const currentValuation =
    (version.valuationResult as any)?.valuation_summary?.final_valuation ||
    (version.valuationResult as any)?.value ||
    (version.valuationResult as any)?.equity_value_mid ||
    0
  const previousValuation =
    (previousVersion?.valuationResult as any)?.valuation_summary?.final_valuation ||
    (previousVersion?.valuationResult as any)?.value ||
    (previousVersion?.valuationResult as any)?.equity_value_mid ||
    null

  // Calculate price difference
  let priceChange = 0
  let priceChangePercent = 0
  if (previousValuation !== null && previousValuation > 0) {
    priceChange = currentValuation - previousValuation
    priceChangePercent = ((currentValuation - previousValuation) / previousValuation) * 100
  }

  const countryCode = version.formData.country_code || 'BE'

  const hasChanges = version.changesSummary && version.changesSummary.totalChanges > 0
  const changeSummaries = hasChanges
    ? formatChangesSummary(version.changesSummary, countryCode)
    : []

  // Check if version has normalized EBITDA
  const hasNormalizedEbitda =
    version.changeMetadata?.normalized_years &&
    Array.isArray(version.changeMetadata.normalized_years) &&
    version.changeMetadata.normalized_years.length > 0
  const normalizedYearsCount =
    hasNormalizedEbitda && version.changeMetadata?.normalized_years
      ? version.changeMetadata.normalized_years.length
      : 0

  return (
    <div className="relative transition-all duration-200 rounded-lg bg-muted">
      <div className="p-6 cursor-pointer" onClick={onClick}>
        {/* Content */}
        <div className="w-full">
          {/* Header row */}
          <div className="mb-3">
            <div className="flex-1">
              <div className="mb-1 flex items-center gap-2">
                <h3 className="text-lg font-semibold text-foreground">{version.versionLabel}</h3>
                {hasNormalizedEbitda && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success border border-success/30">
                    <CheckCircle2 className="w-3 h-3" />
                    Normalized ({normalizedYearsCount} year{normalizedYearsCount > 1 ? 's' : ''})
                  </span>
                )}
              </div>

              {/* Metadata row */}
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4" />
                  <span>{formatDate(version.createdAt)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Valuation Card - Full Width Navy Theme */}
          {version.valuationResult &&
            (() => {
              const valuationResult = version.valuationResult as any
              const equityValueLow =
                valuationResult.equity_value_low ||
                valuationResult.valuation_summary?.equity_value_low ||
                0
              const equityValueMid =
                valuationResult.equity_value_mid ||
                valuationResult.valuation_summary?.final_valuation ||
                currentValuation ||
                0
              const equityValueHigh =
                valuationResult.equity_value_high ||
                valuationResult.valuation_summary?.equity_value_high ||
                0
              const recommendedAskingPrice =
                valuationResult.recommended_asking_price ||
                valuationResult.valuation_summary?.recommended_asking_price ||
                0

              // Calculate premium percentage if we have both mid and asking price
              const premiumPercent =
                recommendedAskingPrice && equityValueMid
                  ? Math.round(((recommendedAskingPrice - equityValueMid) / equityValueMid) * 100)
                  : 0

              return (
                <div
                  className="w-full mb-4 rounded-xl overflow-hidden"
                  style={{
                    backgroundColor: '#0F172A',
                    backgroundImage: 'linear-gradient(to bottom right, #0F172A, #1E293B)',
                    boxShadow:
                      '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                  }}
                >
                  <div className="relative p-8">
                    {/* Decorative circle */}
                    <div
                      className="absolute -top-36 -right-8 w-72 h-72 rounded-full opacity-50"
                      style={{ backgroundColor: '#1E293B' }}
                    />

                    <div className="relative z-10">
                      {/* Header */}
                      <p
                        className="text-xs font-semibold uppercase tracking-wider mb-3"
                        style={{ color: '#94A3B8', opacity: 0.9 }}
                      >
                        Synthesized Intrinsic Value (Equity)
                      </p>

                      {/* Main Valuation Amount */}
                      <div className="flex items-baseline gap-4 mb-6">
                        <span
                          className="text-5xl font-extrabold leading-none tracking-tight"
                          style={{ color: '#FFFFFF', letterSpacing: '-0.02em' }}
                        >
                          {formatCurrency(equityValueMid, countryCode)}
                        </span>
                      </div>

                      {/* Range and Suggested Price Table */}
                      <table className="w-full border-collapse border-t border-white/10 pt-6 mt-6">
                        <tbody>
                          <tr>
                            {/* Valuation Range */}
                            <td className="w-1/2 align-top pr-4">
                              <p
                                className="text-xs font-semibold uppercase tracking-wider mb-2 mt-3"
                                style={{ color: '#94A3B8', opacity: 0.6 }}
                              >
                                Valuation Range
                              </p>
                              <div className="inline-block">
                                <p
                                  className="text-base font-semibold mb-1"
                                  style={{ color: '#FFFFFF' }}
                                >
                                  {formatCurrency(equityValueLow, countryCode)}
                                </p>
                                <p
                                  className="text-xs mb-1"
                                  style={{ color: 'rgba(255,255,255,0.4)' }}
                                >
                                  to
                                </p>
                                <p className="text-base font-semibold" style={{ color: '#FFFFFF' }}>
                                  {formatCurrency(equityValueHigh, countryCode)}
                                </p>
                              </div>
                            </td>

                            {/* Suggested Listing Price */}
                            <td className="w-1/2 align-top pl-4">
                              <p
                                className="text-xs font-semibold uppercase tracking-wider mb-2 mt-3"
                                style={{ color: '#94A3B8', opacity: 0.6 }}
                              >
                                Suggested Listing Price
                              </p>
                              <div className="mb-1">
                                <span
                                  className="text-lg font-semibold mr-2"
                                  style={{ color: '#FFFFFF' }}
                                >
                                  {formatCurrency(recommendedAskingPrice, countryCode)}
                                </span>
                                {premiumPercent > 0 && (
                                  <span
                                    className="inline-block align-middle text-xs font-bold px-2 py-1 rounded border"
                                    style={{
                                      backgroundColor: 'rgba(52, 211, 153, 0.2)',
                                      color: '#6EE7B7',
                                      borderColor: 'rgba(52, 211, 153, 0.3)',
                                    }}
                                  >
                                    +{premiumPercent}% Premium
                                  </span>
                                )}
                              </div>
                              <p className="text-xs" style={{ color: '#94A3B8' }}>
                                Strategic buffer for negotiation
                              </p>
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Opinion of Value Badge */}
                      {equityValueLow > 0 && equityValueHigh > 0 && (
                        <div
                          className="inline-block mt-4 px-4 py-2 rounded-md border"
                          style={{
                            backgroundColor: 'rgba(255,255,255,0.1)',
                            borderColor: 'rgba(255,255,255,0.1)',
                          }}
                        >
                          <p className="text-sm m-0" style={{ color: '#E2E8F0' }}>
                            Opinion of Value:{' '}
                            <strong>{formatCurrency(equityValueLow, countryCode)}</strong> —{' '}
                            <strong>{formatCurrency(equityValueHigh, countryCode)}</strong>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })()}

          {/* Price change indicator (below the card) */}
          {previousValuation !== null && priceChange !== 0 && (
            <div
              className={`flex items-center gap-1 text-sm font-medium mb-3 ${
                priceChange > 0
                  ? 'text-success'
                  : priceChange < 0
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {priceChange > 0 ? (
                <ArrowUp className="w-4 h-4" />
              ) : priceChange < 0 ? (
                <ArrowDown className="w-4 h-4" />
              ) : (
                <Minus className="w-4 h-4" />
              )}
              <span>
                {formatCurrency(Math.abs(priceChange), countryCode)}(
                {priceChangePercent > 0 ? '+' : ''}
                {priceChangePercent.toFixed(1)}%)
              </span>
            </div>
          )}

          {/* Changes summary */}
          {!compact && hasChanges && changeSummaries.length > 0 && (
            <div className="mb-3">
              <p className="text-xs font-medium text-foreground mb-2">Key Changes:</p>
              <div className="space-y-1.5">
                {changeSummaries.slice(0, 3).map((change, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                    <span className="text-primary mt-1">•</span>
                    <span>{change}</span>
                  </div>
                ))}
                {changeSummaries.length > 3 && (
                  <p className="text-sm text-muted-foreground ml-4">
                    +{changeSummaries.length - 3} more changes
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Notes */}
          {!compact && version.notes && (
            <div className="mt-3 p-3 bg-warning/10 border-l-2 border-warning rounded">
              <p className="text-sm text-foreground italic">"{version.notes}"</p>
            </div>
          )}

          {/* Tags */}
          {!compact && version.tags && version.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {version.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs font-medium bg-muted text-foreground rounded-md border border-foreground/10"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Collapsible Details Section - Removed expand button but keeping section for potential future use */}
      {false && (
        <div className="px-6 pb-6 pt-0 space-y-4 border-t border-foreground/10 mt-4">
          {/* Valuation Breakdown */}
          {version.valuationResult && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-foreground mb-3">Valuation Details</h4>
              <div className="grid grid-cols-2 gap-3">
                {version.valuationResult?.valuation_summary &&
                  typeof version.valuationResult?.valuation_summary === 'object' && (
                    <>
                      {(version.valuationResult?.valuation_summary as any)?.base_valuation && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Base Valuation</p>
                          <p className="text-sm font-semibold text-foreground">
                            {formatCurrency(
                              (version.valuationResult?.valuation_summary as any)?.base_valuation,
                              countryCode
                            )}
                          </p>
                        </div>
                      )}
                      {(version.valuationResult?.valuation_summary as any)?.adjustments_total !==
                        undefined && (
                        <div className="p-3 bg-muted rounded-lg">
                          <p className="text-xs text-muted-foreground mb-1">Total Adjustments</p>
                          <p
                            className={`text-sm font-semibold ${
                              (version.valuationResult?.valuation_summary as any)
                                ?.adjustments_total >= 0
                                ? 'text-success'
                                : 'text-destructive'
                            }`}
                          >
                            {(version.valuationResult?.valuation_summary as any)
                              ?.adjustments_total >= 0
                              ? '+'
                              : ''}
                            {formatCurrency(
                              (version.valuationResult?.valuation_summary as any)
                                ?.adjustments_total,
                              countryCode
                            )}
                          </p>
                        </div>
                      )}
                    </>
                  )}
              </div>
            </div>
          )}

          {/* Key Metrics */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Key Metrics</h4>
            <div className="grid grid-cols-2 gap-3">
              {version.formData.current_year_data?.revenue && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Revenue</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(version.formData.current_year_data.revenue, countryCode)}
                  </p>
                </div>
              )}
              {version.formData.current_year_data?.ebitda !== undefined && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">EBITDA</p>
                  <p className="text-sm font-semibold text-foreground">
                    {formatCurrency(version.formData.current_year_data.ebitda, countryCode)}
                  </p>
                </div>
              )}
              {version.formData.number_of_employees && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Employees</p>
                  <p className="text-sm font-semibold text-foreground">
                    {version.formData.number_of_employees}
                  </p>
                </div>
              )}
              {version.formData.number_of_owners && (
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs text-muted-foreground mb-1">Owners</p>
                  <p className="text-sm font-semibold text-foreground">
                    {version.formData.number_of_owners}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Business Info */}
          <div>
            <h4 className="text-sm font-semibold text-foreground mb-3">Business Information</h4>
            <div className="space-y-2 text-sm">
              {version.formData.company_name && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Company:</span>
                  <span className="font-medium text-foreground">{version.formData.company_name}</span>
                </div>
              )}
              {version.formData.industry && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Industry:</span>
                  <span className="font-medium text-foreground">{version.formData.industry}</span>
                </div>
              )}
              {version.formData.business_type && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Business Type:</span>
                  <span className="font-medium text-foreground">
                    {version.formData.business_type}
                  </span>
                </div>
              )}
              {version.formData.country_code && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Country:</span>
                  <span className="font-medium text-foreground">{version.formData.country_code}</span>
                </div>
              )}
            </div>
          </div>

          {/* Calculation Info */}
          {version.calculationDuration_ms && (
            <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-foreground">Calculation Time:</span>
                <span className="font-semibold text-primary">
                  {((version.calculationDuration_ms ?? 0) / 1000).toFixed(2)}s
                </span>
              </div>
            </div>
          )}

          {/* Initial Version Message */}
          {!previousVersion && (
            <div className="p-4 bg-muted border border-foreground/10 rounded-lg text-center">
              <p className="text-sm text-muted-foreground">
                This is the initial version. No previous version to compare against.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Compact Version Selector
 *
 * Dropdown selector for version navigation.
 * Used in toolbar for quick version switching.
 */
export interface CompactVersionSelectorProps {
  versions: ValuationVersion[]
  activeVersion: number
  onVersionSelect: (versionNumber: number) => void
}

export function CompactVersionSelector({
  versions,
  activeVersion,
  onVersionSelect,
}: CompactVersionSelectorProps) {
  if (versions.length === 0) return null

  const sortedVersions = [...versions].sort((a, b) => b.versionNumber - a.versionNumber)
  const activeVersionData = versions.find((v) => v.versionNumber === activeVersion)

  return (
    <div className="relative">
      <select
        value={activeVersion}
        onChange={(e) => onVersionSelect(parseInt(e.target.value))}
        className="
          px-2 py-1.5 pr-6 rounded-lg border border-foreground/20
          bg-muted text-foreground text-xs font-medium
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          cursor-pointer hover:bg-foreground/10 transition-colors
          appearance-none
        "
        title={`Select version (${versions.length} total)`}
      >
        {sortedVersions.map((version) => (
          <option
            key={version.id}
            value={version.versionNumber}
            className="bg-muted text-foreground"
          >
            {version.versionLabel}
            {version.isPinned ? ' 📌' : ''}
          </option>
        ))}
      </select>

      {/* Dropdown icon */}
      <div className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
        <svg
          className="w-3 h-3 text-muted-foreground"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>
    </div>
  )
}
