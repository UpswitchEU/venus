/**
 * Recent Reports Section Component
 *
 * Single Responsibility: Display recent reports in Lovable-style grid layout
 * Handles loading states, empty states, and grid responsiveness
 * Uses BusinessProfileCardV4 (Airbnb-inspired design) for report cards
 */

'use client'

import { ArrowRight, FileText } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import BusinessProfileCardV4 from '../../../components/business/BusinessProfileCardV4'
import EditChoiceModal from '../../../components/modals/EditChoiceModal'
import type { ValuationSession } from '../../../types/valuation'
import {
  extractProfileData,
  extractValuationAmount,
  mapValuationSessionToBusinessInfo,
} from '../../../utils/valuationSessionMapper'

export interface RecentReportsSectionProps {
  reports: ValuationSession[]
  loading: boolean
  onReportClick: (reportId: string) => void
  onReportDelete: (reportId: string) => void
  onViewAll?: () => void
  user?: {
    id?: string
    name?: string
    email?: string
    avatar?: string
    profileImage?: string
  } | null
}

export function RecentReportsSection({
  reports,
  loading,
  onReportClick,
  onReportDelete,
  onViewAll,
  user,
}: RecentReportsSectionProps) {
  const t = useTranslations('valuation')
  const tEditChoice = useTranslations('modals.editChoice')
  // Modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [selectedReport, setSelectedReport] = useState<ValuationSession | null>(null)

  // Handle edit button click - open modal
  const handleEditClick = (report: ValuationSession) => {
    setSelectedReport(report)
    setIsEditModalOpen(true)
  }

  // Handle edit report action
  const handleEditReport = () => {
    if (selectedReport?.reportId) {
      onReportClick(selectedReport.reportId)
    }
  }

  // Handle delete report action
  const handleDeleteReport = async () => {
    if (selectedReport?.reportId) {
      try {
        await onReportDelete(selectedReport.reportId)
      } catch (error) {
        console.error('Failed to delete report:', error)
        // Error handling is done in parent component
      }
    }
  }

  // Close modal
  const handleCloseModal = () => {
    setIsEditModalOpen(false)
    setSelectedReport(null)
  }

  // Filter reports with valuation results (stage 3 only)
  const reportsWithValuations = reports.filter((report) => (report as any).valuationResult)

  // Loading skeleton - only show when loading AND no reports exist (Optimistic UI pattern)
  if (loading && reports.length === 0) {
    return (
      <section className="w-full bg-gradient-to-b from-black/5 to-transparent py-16">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <div className="h-8 w-48 bg-foreground/10 animate-pulse rounded" />
            <div className="h-8 w-24 bg-foreground/10 animate-pulse rounded" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="aspect-square rounded-xl sm:rounded-2xl overflow-hidden bg-foreground/10 border border-foreground/5 animate-pulse"
              >
                <div className="w-full h-full bg-foreground/5" />
              </div>
            ))}
          </div>
        </div>
      </section>
    )
  }

  // Empty state - only show if no reports with valuations and not loading
  if (reportsWithValuations.length === 0 && !loading) {
    return (
      <section className="w-full bg-gradient-to-b from-black/5 to-transparent py-8 md:py-12">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between mb-8">
            <h2 className="text-3xl font-semibold text-white">{t('recentValuations')}</h2>
          </div>

          <div className="max-w-md mx-auto text-center py-12">
            <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-white/60" />
            </div>
            <h3 className="text-xl font-medium text-white mb-3">{t('recentEmptyTitle')}</h3>
            <p className="text-white/70 mb-6">{t('recentEmptyDesc')}</p>
          </div>
        </div>
      </section>
    )
  }

  // Reports grid (with optional subtle loading indicator during refetch)
  return (
    <section className="w-full bg-gradient-to-b from-black/5 to-transparent py-8 md:py-12">
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-3xl font-semibold text-white">{t('recentValuations')}</h2>

          <div className="flex items-center gap-3">
            {/* Subtle loading spinner during refetch (Optimistic UI) */}
            {loading && (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
            )}

            {onViewAll && reportsWithValuations.length > 8 && (
              <button
                onClick={onViewAll}
                className="flex items-center gap-2 px-4 py-2 text-white/80 hover:text-white transition-colors"
              >
                <span>{t('viewAll')}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Grid of report cards - Using BusinessProfileCardV4 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {reportsWithValuations.map((report) => {
            // Map session data to business info (comprehensive extraction)
            const businessInfo = mapValuationSessionToBusinessInfo(report)
            const valuationAmount = extractValuationAmount(report)
            const profileData = extractProfileData(report, user || undefined)

            // Debug logging (only in development)
            if (process.env.NODE_ENV === 'development') {
              console.debug('[RecentReportsSection] Mapping report to card:', {
                reportId: report.reportId,
                businessInfo,
                hasValuation: !!(report as any).valuationResult,
                valuationAmount,
                hasProfileData: !!profileData,
              })
            }

            return (
              <BusinessProfileCardV4
                key={report.reportId}
                businessInfo={businessInfo}
                reportId={report.reportId}
                hasValuationReports={!!(report as any).valuationResult}
                latestValuationReport={
                  valuationAmount
                    ? {
                        businessValue: valuationAmount,
                        method: 'DCF + Multiples',
                        confidence:
                          ((report as any).valuationResult as any)?.overall_confidence || 'high',
                        date: (report as any).calculatedAt || report.updatedAt,
                      }
                    : null
                }
                profileCardData={profileData}
                onEdit={() => handleEditClick(report)}
                onCreateValuation={() => onReportClick(report.reportId)}
              />
            )
          })}
        </div>

        {/* Footer hint */}
        {reportsWithValuations.length > 0 && (
          <p className="text-center text-white/50 text-sm mt-8">
            {t('showingCount', {
              shown: Math.min(reportsWithValuations.length, 8),
              total: reportsWithValuations.length,
            })}
          </p>
        )}
      </div>

      {/* Edit Choice Modal */}
      <EditChoiceModal
        isOpen={isEditModalOpen}
        onClose={handleCloseModal}
        onEditReport={handleEditReport}
        onDeleteReport={handleDeleteReport}
        reportName={
          selectedReport
            ? mapValuationSessionToBusinessInfo(selectedReport).name || tEditChoice('thisReport')
            : tEditChoice('thisReport')
        }
      />
    </section>
  )
}
