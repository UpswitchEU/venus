/**
 * Version Timeline Component
 *
 * Single Responsibility: Display version history timeline
 * Shows v1, v2, v3... with dates, labels, and quick navigation
 *
 * WORLD-CLASS: Supports pagination for reports with 100+ versions
 * - Shows first 10 versions by default
 * - "Load More" button for additional versions
 *
 * @module components/VersionTimeline
 */

'use client'

import {
  ArrowDown,
  ArrowUp,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Minus,
  User,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useState } from 'react'
import { formatCurrency } from '../config/countries'
import type { ValuationVersion } from '../types/ValuationVersion'
import { formatChangesSummary } from '../utils/versionDiffDetection'
import {
  buildSortedTimelineVersions,
  buildVersionTimelineItemModel,
  buildVersionTimelineListModel,
  VERSION_TIMELINE_PAGE_SIZE,
} from './VersionTimelineModel'

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
  /** Format createdBy (user ID) to display name/email */
  formatAuthor?: (createdBy: string | null) => string
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
  compact = false,
  totalVersions,
  onLoadMore,
  formatAuthor,
}: VersionTimelineProps) {
  const t = useTranslations('historyPanel')
  // WORLD-CLASS: Pagination state for large version lists
  const [displayCount, setDisplayCount] = useState(VERSION_TIMELINE_PAGE_SIZE)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  if (versions.length === 0) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p className="text-lg font-medium">{t('noVersions')}</p>
        <p className="text-sm mt-2">{t('versionsAppearAfterRegen')}</p>
      </div>
    )
  }

  const { displayedVersions, hasMoreToFetch, hasMoreToShow, sortedVersions, totalCount } =
    buildVersionTimelineListModel({
      versions,
      displayCount,
      totalVersions,
    })

  // Handle "Load More" click
  const handleLoadMore = useCallback(async () => {
    // If we have more versions in memory, just show them
    if (hasMoreToShow) {
      setDisplayCount((prev) => Math.min(prev + VERSION_TIMELINE_PAGE_SIZE, sortedVersions.length))
      return
    }

    // If we need to fetch more from server
    if (hasMoreToFetch && onLoadMore) {
      setIsLoadingMore(true)
      try {
        await onLoadMore()
        setDisplayCount((prev) => prev + VERSION_TIMELINE_PAGE_SIZE)
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
              formatAuthor={formatAuthor}
              previousVersion={
                index < displayedVersions.length - 1 ? displayedVersions[index + 1] : null
              }
              isActive={version.versionNumber === activeVersion}
              onClick={() => onVersionSelect(version.versionNumber)}
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
                  {t('loading')}
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  {t('loadMore', { displayed: displayCount, total: totalCount })}
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
  onClick: () => void
  compact?: boolean
  formatAuthor?: (createdBy: string | null) => string
}

function VersionTimelineItem({
  version,
  previousVersion,
  isActive,
  onClick,
  compact,
  formatAuthor,
}: VersionTimelineItemProps) {
  const t = useTranslations('historyPanel')
  const formatDate = (date: Date | string) => {
    try {
      const dateObj = date instanceof Date ? date : new Date(date)
      return dateObj.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch (_error) {
      return t('invalidDate')
    }
  }

  const itemModel = buildVersionTimelineItemModel({ version, previousVersion })
  const {
    hasChanges,
    hasNormalizedEbitda,
    normalizedYearsCount,
    previousValuation,
    priceChange,
    priceChangePercent,
    valuationCard,
  } = itemModel

  const countryCode = version.formData.country_code || 'BE'
  const changeSummaries = hasChanges
    ? formatChangesSummary(version.changesSummary, countryCode)
    : []

  return (
    <div
      aria-current={isActive ? 'step' : undefined}
      className={`relative transition-all duration-200 rounded-lg bg-muted ${
        isActive ? 'ring-2 ring-primary/50 ring-offset-2 ring-offset-background' : ''
      }`}
    >
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
                {formatAuthor && version.createdBy != null && (
                  <div className="flex items-center gap-1.5">
                    <User className="w-4 h-4" />
                    <span>{formatAuthor(version.createdBy)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Valuation Card - Full Width Navy Theme */}
          {valuationCard && (
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
                    {t('valuationCardHeroLabel')}
                  </p>

                  {/* Main Valuation Amount */}
                  <div className="flex items-baseline gap-4 mb-6">
                    <span
                      className="text-5xl font-extrabold leading-none tracking-tight"
                      style={{ color: '#FFFFFF', letterSpacing: '-0.02em' }}
                    >
                      {formatCurrency(valuationCard.equityValueMid, countryCode)}
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
                            {t('valuationRangeLabel')}
                          </p>
                          <div className="inline-block">
                            <p
                              className="text-base font-semibold mb-1"
                              style={{ color: '#FFFFFF' }}
                            >
                              {formatCurrency(valuationCard.equityValueLow, countryCode)}
                            </p>
                            <p className="text-xs mb-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                              {t('rangeTo')}
                            </p>
                            <p className="text-base font-semibold" style={{ color: '#FFFFFF' }}>
                              {formatCurrency(valuationCard.equityValueHigh, countryCode)}
                            </p>
                          </div>
                        </td>

                        {/* Suggested Listing Price */}
                        {valuationCard.recommendedAskingPrice > 0 && (
                          <td className="w-1/2 align-top pl-4">
                            <p
                              className="text-xs font-semibold uppercase tracking-wider mb-2 mt-3"
                              style={{ color: '#94A3B8', opacity: 0.6 }}
                            >
                              {t('suggestedListingPrice')}
                            </p>
                            <div className="mb-1">
                              <span
                                className="text-lg font-semibold mr-2"
                                style={{ color: '#FFFFFF' }}
                              >
                                {formatCurrency(valuationCard.recommendedAskingPrice, countryCode)}
                              </span>
                              {valuationCard.premiumPercent > 0 && (
                                <span
                                  className="inline-block align-middle text-xs font-bold px-2 py-1 rounded border"
                                  style={{
                                    backgroundColor: 'rgba(52, 211, 153, 0.2)',
                                    color: '#6EE7B7',
                                    borderColor: 'rgba(52, 211, 153, 0.3)',
                                  }}
                                >
                                  {t('premiumLabel', {
                                    percent: valuationCard.premiumPercent,
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="text-xs" style={{ color: '#94A3B8' }}>
                              {t('strategicBuffer')}
                            </p>
                          </td>
                        )}
                      </tr>
                    </tbody>
                  </table>

                  {/* Opinion of Value Badge */}
                  {valuationCard.equityValueLow > 0 && valuationCard.equityValueHigh > 0 && (
                    <div
                      className="inline-block mt-4 px-4 py-2 rounded-md border"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.1)',
                        borderColor: 'rgba(255,255,255,0.1)',
                      }}
                    >
                      <p className="text-sm m-0" style={{ color: '#E2E8F0' }}>
                        {t('opinionOfValue')}:{' '}
                        <strong>{formatCurrency(valuationCard.equityValueLow, countryCode)}</strong>{' '}
                        —{' '}
                        <strong>
                          {formatCurrency(valuationCard.equityValueHigh, countryCode)}
                        </strong>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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

  const sortedVersions = buildSortedTimelineVersions(versions)

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
        title={`Select version (${sortedVersions.length} total)`}
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
