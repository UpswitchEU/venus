/**
 * Report Card Component
 *
 * Single Responsibility: Display individual report preview
 * Like Lovable template cards: thumbnail, metadata, actions
 */

'use client'

import { Calendar, Clock, Trash2, TrendingUp } from 'lucide-react'
import { useTranslations } from 'next-intl'
import React, { useState } from 'react'
import { toast } from 'sonner'
import { dateLikeToUnixMs, formatDateLikeToLocaleDateString } from '@/utils/date-like'
import { generalLogger } from '@/utils/logger'
import { getFinalValuation } from '@/utils/valuationResultAccess'
import { formatCurrency } from '../../../config/countries'
import type { ValuationSession } from '../../../types/valuation'

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readValuationAmount(value: unknown): number | null {
  return getFinalValuation(value)
}

export interface ReportCardProps {
  report: ValuationSession
  onClick: () => void
  onDelete: () => void
}

/**
 * Report Card Component
 *
 * M&A Workflow Enhancement:
 * - Always navigates to edit mode (not view mode)
 * - Clicking any report (even completed) opens editable form
 * - Enables continuous adjustments and regeneration
 * - Like Figma projects: always editable, previews are secondary
 */
export function ReportCard({ report, onClick, onDelete }: ReportCardProps) {
  const t = useTranslations('valuation')
  const [isHovered, setIsHovered] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Extract data from report
  const companyName = report.partialData?.company_name || t('untitledValuation')
  const _industry = report.partialData?.industry || 'business'
  const countryCode = report.partialData?.country_code || 'BE'
  const createdAt = report.createdAt
  const currentView = report.currentView || 'manual'

  // Determine status from session state
  // M&A workflow: All reports are "editable" - status just indicates calculation state
  const status = report.completedAt ? 'completed' : 'in_progress'

  // Get valuation result if available (completed reports)
  // Type assertion since sessionData can contain valuation_result from backend
  const valuationResult = asRecord(report.sessionData)?.valuation_result ?? null
  const valuationAmount = valuationResult ? readValuationAmount(valuationResult) : null

  // Format date
  const formatDate = (date: Date) => {
    try {
      const pastMs = dateLikeToUnixMs(date)
      if (pastMs === null) return 'Recently'
      const diffMs = Date.now() - pastMs
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

      if (diffDays === 0) return 'Today'
      if (diffDays === 1) return 'Yesterday'
      if (diffDays < 7) return `${diffDays} days ago`
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`

      return formatDateLikeToLocaleDateString(date, 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    } catch {
      return 'Recently'
    }
  }

  // Calculate completeness (simple heuristic)
  const calculateCompleteness = (): number => {
    if (status === 'completed') return 100

    const data = report.partialData || {}
    let filledFields = 0
    let totalFields = 6

    if (data.company_name) filledFields++
    if (data.industry) filledFields++
    if (data.country_code) filledFields++
    if (data.current_year_data?.revenue) filledFields++
    if (data.current_year_data?.ebitda) filledFields++
    if (data.business_type_id) filledFields++

    return Math.round((filledFields / totalFields) * 100)
  }

  // Handle delete with confirmation
  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (!confirm(t('deleteReportConfirm', { name: companyName }))) {
      return
    }

    setIsDeleting(true)

    try {
      await onDelete()
    } catch (error) {
      generalLogger.error('Failed to delete report from card', {
        error,
        reportId: report.reportId,
      })
      toast.error(t('deleteReportFailed'))
      setIsDeleting(false)
    }
  }

  // Get status badge color
  const getStatusColor = () => {
    switch (status) {
      case 'completed':
        return 'bg-success/10 text-success border-success/30'
      case 'in_progress':
        return 'bg-info/10 text-info border-info/30'
      default:
        return 'bg-muted text-muted-foreground border-foreground/10'
    }
  }

  const completeness = calculateCompleteness()

  return (
    <div
      className={`
        group relative bg-card border border-foreground/10 rounded-lg overflow-hidden
        cursor-pointer transition-all duration-200
        ${isHovered ? 'shadow-lg border-primary' : 'shadow-sm hover:shadow-md'}
        ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
      `}
      onClick={onClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Header with industry icon and status */}
      <div className="relative p-4 bg-gradient-to-br from-primary/10 to-primary/20">
        {/* Industry icon placeholder */}
        <div className="w-12 h-12 bg-card rounded-lg flex items-center justify-center shadow-sm">
          <TrendingUp className="w-6 h-6 text-primary" />
        </div>

        {/* Status badge */}
        <div
          className={`
          absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium border
          ${getStatusColor()}
        `}
        >
          {status === 'completed' ? t('statusCompleted') : t('statusInProgress')}
        </div>

        {/* Delete button (visible on hover) */}
        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className={`
            absolute bottom-3 right-3 p-2 rounded-lg
            bg-card text-destructive hover:bg-destructive/10 hover:text-destructive
            transition-all duration-200 shadow-sm
            ${isHovered ? 'opacity-100' : 'opacity-0'}
          `}
          title={t('deleteReportTitle')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4">
        {/* Company name */}
        <h3 className="font-semibold text-lg text-foreground truncate mb-2">{companyName}</h3>

        {/* Metadata */}
        <div className="flex items-center gap-3 text-sm text-muted-foreground mb-3">
          <div className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(createdAt)}</span>
          </div>
          <span className="text-foreground/30">·</span>
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span className="capitalize">{currentView}</span>
          </div>
        </div>

        {/* Progress indicator (for in-progress reports) */}
        {status === 'in_progress' && (
          <div className="mb-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
              <span>{t('completeness')}</span>
              <span>{completeness}%</span>
            </div>
            <div className="w-full bg-foreground/10 rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full rounded-full transition-all duration-300"
                style={{ width: `${completeness}%` }}
              />
            </div>
          </div>
        )}

        {/* Valuation result preview (for completed reports) */}
        {status === 'completed' && valuationAmount != null && (
          <div className="mt-3 p-3 bg-success/10 border border-success/30 rounded-lg">
            <p className="text-xs text-muted-foreground mb-1">{t('estimatedValue')}</p>
            <p className="text-xl font-bold text-success">
              {formatCurrency(valuationAmount, countryCode)}
            </p>
          </div>
        )}

        {/* Hover indicator */}
        {isHovered && (
          <div className="mt-3 text-sm text-primary font-medium flex items-center gap-1">
            <span>{t('openReport')}</span>
            <span className="transition-transform duration-200 group-hover:translate-x-1">→</span>
          </div>
        )}
      </div>
    </div>
  )
}
