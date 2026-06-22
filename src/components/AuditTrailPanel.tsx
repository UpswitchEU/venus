/**
 * AuditTrailPanel Component
 *
 * Single Responsibility: Display version history timeline with detailed audit information
 * Split layout: Timeline on left/top, details on right/bottom
 *
 * @module components/AuditTrailPanel
 */

'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useVersionHistoryStore } from '../store/useVersionHistoryStore'
import { formatVersionAuthor } from '../utils/formatters'
import { generalLogger } from '../utils/logger'
import { buildVersionDisplayList } from '../utils/versionDisplayModel'
import { VersionTimeline } from './VersionTimeline'

export interface AuditTrailPanelProps {
  reportId: string
  className?: string
}

/**
 * Audit Trail Panel
 *
 * Displays comprehensive audit trail with:
 * - Version timeline (left/top) using existing VersionTimeline component
 * - Detailed audit information (right/bottom) for selected version
 * - Responsive layout (vertical split on desktop, stacked on mobile)
 */
export function AuditTrailPanel({ reportId, className = '' }: AuditTrailPanelProps) {
  const t = useTranslations('historyPanel')
  const { user } = useAuth()
  const {
    versions: allVersions,
    getActiveVersion,
    setActiveVersion,
    loading,
    fetchVersions, // WORLD-CLASS: Used for "Load More" pagination
  } = useVersionHistoryStore()

  // WORLD-CLASS: Track total version count from bootstrap for pagination
  const [totalVersionCount, _setTotalVersionCount] = useState<number | undefined>(undefined)

  const [selectedVersionNumber, setSelectedVersionNumber] = useState<number | null>(null)

  const versions = useMemo(
    () => buildVersionDisplayList(allVersions[reportId] || [], { deduplicateIds: true }),
    [allVersions, reportId]
  )
  const activeVersion = getActiveVersion(reportId)

  // NOTE: Version fetching is now handled by SessionRestorationService
  // when the session is loaded. No need to fetch here - versions will be
  // in the store once the session is fully restored.

  // Auto-select latest version when versions load
  useEffect(() => {
    if (versions.length > 0 && selectedVersionNumber === null) {
      const latestVersion = Math.max(...versions.map((v) => v.versionNumber))
      setSelectedVersionNumber(latestVersion)
    }
  }, [versions, selectedVersionNumber])

  // Handle version selection
  const handleVersionSelect = (versionNumber: number) => {
    setSelectedVersionNumber(versionNumber)
    // Also update the active version in the store for consistency
    setActiveVersion(reportId, versionNumber)
  }

  // Handle version pinning
  const handleVersionPin = (versionNumber: number) => {
    // Pin/unpin functionality would be implemented here
    // For now, we'll just log it
    generalLogger.debug('Pin version', { versionNumber })
  }

  // Get selected version data
  const _selectedVersion = selectedVersionNumber
    ? versions.find((v) => v.versionNumber === selectedVersionNumber)
    : null

  // Loading state
  if (loading && versions.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full bg-background ${className}`}>
        <div className="text-center text-muted-foreground p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm">{t('loadingVersionHistory')}</p>
        </div>
      </div>
    )
  }

  // Empty state
  if (versions.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full bg-background ${className}`}>
        <div className="text-center text-muted-foreground p-8 max-w-md">
          <svg
            className="w-16 h-16 mx-auto mb-4 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
          <h3 className="text-lg font-semibold text-foreground mb-2">{t('noVersionsTitle')}</h3>
          <p className="text-sm leading-relaxed">{t('noVersionsDescLong')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-full overflow-hidden bg-background ${className}`}>
      {/* Header */}
      <div className="p-6 border-b border-foreground/10">
        <h2 className="text-2xl font-semibold text-foreground">Version History</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {versions.length} version{versions.length !== 1 ? 's' : ''} • Track changes and compare
          valuations
        </p>
      </div>

      {/* Timeline */}
      <div className="h-[calc(100%-5rem)] overflow-y-auto">
        <VersionTimeline
          versions={versions}
          activeVersion={selectedVersionNumber || activeVersion?.versionNumber || 1}
          onVersionSelect={handleVersionSelect}
          onVersionPin={handleVersionPin}
          compact={false}
          totalVersions={totalVersionCount}
          onLoadMore={async () => {
            // WORLD-CLASS: Fetch more versions from backend
            await fetchVersions(reportId)
          }}
          formatAuthor={(createdBy) =>
            formatVersionAuthor(createdBy, user, {
              user: t('user'),
              guest: t('guest'),
            })
          }
        />
      </div>
    </div>
  )
}
