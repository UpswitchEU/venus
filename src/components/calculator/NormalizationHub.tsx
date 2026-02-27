'use client'

/**
 * Normalization Hub
 *
 * World-class unified entry point for all EBITDA normalizations.
 * Replaces fragmented NormalisationReviewStep with a clean, intuitive interface
 * that opens the UnifiedNormalizationModal as the central hub.
 *
 * Architecture:
 * - This component is a "gateway" panel shown in the sidebar
 * - Clicking "Open Hub" opens UnifiedNormalizationModal with full control
 * - Chat AI suggestions also redirect here after CSV upload
 *
 * Design: Klarna/Stripe-inspired fintech aesthetic
 */

import { motion } from 'framer-motion'
import {
  ArrowRight,
  Calculator,
  Check,
  ChevronRight,
  Clock,
  FileSpreadsheet,
  Settings2,
  Sparkles,
  Upload,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { cn } from '@/design-system/utils'
import {
  type NormalizationItem,
  type NormalizationSource,
  UnifiedNormalizationModal,
} from './UnifiedNormalizationModal'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface NormalizationHubProps {
  companyName: string
  originalEbitda: number
  currentYear?: number
  sourceIntegration?: 'yuki' | 'exact' | 'odoo' | 'csv' | 'manual'
  normalizations: NormalizationItem[]
  onNormalizationsChange: (normalizations: NormalizationItem[]) => void
  onContinue: () => void
  onBack: () => void
  onUploadClick?: () => void
  hasUploadedData?: boolean
  ledgerAccounts?: { code: string; name: string; category?: string; balance?: number }[]
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const formatCurrency = (amount: number) => {
  if (Math.abs(amount) >= 1000000) {
    return `€${(amount / 1000000).toFixed(2)}M`
  }
  if (Math.abs(amount) >= 1000) {
    return `€${Math.round(amount / 1000)}K`
  }
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

const sourceIcons: Record<string, string> = {
  yuki: '🟣',
  exact: '🔵',
  odoo: '🟠',
  csv: '📄',
  manual: '✏️',
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function NormalizationHub({
  companyName,
  originalEbitda,
  currentYear = new Date().getFullYear(),
  sourceIntegration = 'manual',
  normalizations,
  onNormalizationsChange,
  onContinue,
  onBack,
  onUploadClick,
  hasUploadedData = false,
  ledgerAccounts = [],
}: NormalizationHubProps) {
  const nh = useTranslations('normalizationHub')
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Calculate stats
  const stats = useMemo(() => {
    const pending = normalizations.filter((n) => n.status === 'pending').length
    const accepted = normalizations.filter((n) => n.status === 'accepted').length
    const rejected = normalizations.filter((n) => n.status === 'rejected').length
    const totalAdjustment = normalizations
      .filter((n) => n.status === 'accepted')
      .reduce((sum, n) => sum + n.adjustment, 0)
    const normalizedEbitda = originalEbitda + totalAdjustment

    return {
      pending,
      accepted,
      rejected,
      total: normalizations.length,
      totalAdjustment,
      normalizedEbitda,
    }
  }, [normalizations, originalEbitda])

  const sourceKey = ['yuki', 'exact', 'odoo', 'csv', 'manual'].includes(sourceIntegration)
    ? sourceIntegration
    : 'manual'
  const source = {
    label: nh(`sources.${sourceKey}`),
    icon: sourceIcons[sourceKey] ?? '✏️',
  }

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        {/* Header */}
        <div className="shrink-0 px-4 md:px-6 py-4 md:py-5 border-b border-foreground/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Calculator className="w-5 h-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {nh('title')}
              </h2>
              <p className="text-xs md:text-sm text-foreground/50 truncate">{companyName}</p>
            </div>
          </div>
        </div>

        {/* Source & Status */}
        <div className="shrink-0 px-4 md:px-6 py-3 border-b border-foreground/[0.06] bg-foreground/[0.01]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm">{source.icon}</span>
              <span className="text-xs text-foreground/60">{source.label}</span>
              {hasUploadedData && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-success/10 text-success text-[10px] font-medium">
                  <Check className="w-2.5 h-2.5" />
                  {nh('connected')}
                </span>
              )}
            </div>
            {!hasUploadedData && onUploadClick && (
              <Button variant="ghost" size="sm" onClick={onUploadClick} className="text-xs gap-1.5">
                <Upload className="w-3.5 h-3.5" />
                {nh('uploadCsv')}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="shrink-0 px-4 md:px-6 py-4 border-b border-foreground/[0.06]">
          <div className="grid grid-cols-3 gap-3">
            {/* Original */}
            <div className="text-center p-3 rounded-xl bg-foreground/[0.02] border border-foreground/[0.04]">
              <p className="text-[9px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-1">
                {nh('original')}
              </p>
              <p className="text-sm md:text-base font-mono font-semibold text-foreground/60 line-through">
                {formatCurrency(originalEbitda)}
              </p>
            </div>

            {/* Adjustment */}
            <div className="text-center p-3 rounded-xl bg-foreground/[0.02] border border-foreground/[0.04]">
              <p className="text-[9px] md:text-[10px] font-medium text-foreground/40 uppercase tracking-wider mb-1">
                {nh('adjustment')}
              </p>
              <p
                className={cn(
                  'text-sm md:text-base font-mono font-semibold',
                  stats.totalAdjustment > 0
                    ? 'text-success'
                    : stats.totalAdjustment < 0
                      ? 'text-secondary'
                      : 'text-foreground/40'
                )}
              >
                {stats.totalAdjustment > 0 ? '+' : ''}
                {formatCurrency(stats.totalAdjustment)}
              </p>
            </div>

            {/* Normalized */}
            <div className="text-center p-3 rounded-xl bg-gradient-to-br from-primary/5 to-primary/10 border border-primary/15">
              <p className="text-[9px] md:text-[10px] font-medium text-primary uppercase tracking-wider mb-1">
                {nh('normalized')}
              </p>
              <p className="text-sm md:text-base font-mono font-bold text-foreground">
                {formatCurrency(stats.normalizedEbitda)}
              </p>
            </div>
          </div>
        </div>

        {/* Status Overview */}
        <div className="shrink-0 px-4 md:px-6 py-4 border-b border-foreground/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">{nh('statusOverview')}</h3>
            <span className="text-xs text-foreground/50">
              {nh('normalizationsCount', { count: stats.total })}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {/* Pending */}
            <div
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                stats.pending > 0
                  ? 'bg-warning/5 border-warning/20'
                  : 'bg-foreground/[0.02] border-foreground/[0.06]'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center',
                  stats.pending > 0 ? 'bg-warning/15' : 'bg-foreground/[0.06]'
                )}
              >
                <Clock
                  className={cn(
                    'w-3.5 h-3.5',
                    stats.pending > 0 ? 'text-warning' : 'text-foreground/40'
                  )}
                />
              </div>
              <div>
                <p className="text-xs text-foreground/50">{nh('toReview')}</p>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    stats.pending > 0 ? 'text-warning' : 'text-foreground/40'
                  )}
                >
                  {stats.pending}
                </p>
              </div>
            </div>

            {/* Accepted */}
            <div
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                stats.accepted > 0
                  ? 'bg-success/5 border-success/20'
                  : 'bg-foreground/[0.02] border-foreground/[0.06]'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center',
                  stats.accepted > 0 ? 'bg-success/15' : 'bg-foreground/[0.06]'
                )}
              >
                <Check
                  className={cn(
                    'w-3.5 h-3.5',
                    stats.accepted > 0 ? 'text-success' : 'text-foreground/40'
                  )}
                />
              </div>
              <div>
                <p className="text-xs text-foreground/50">{nh('accepted')}</p>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    stats.accepted > 0 ? 'text-success' : 'text-foreground/40'
                  )}
                >
                  {stats.accepted}
                </p>
              </div>
            </div>

            {/* Rejected */}
            <div
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg border transition-colors',
                stats.rejected > 0
                  ? 'bg-destructive/5 border-destructive/20'
                  : 'bg-foreground/[0.02] border-foreground/[0.06]'
              )}
            >
              <div
                className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center',
                  stats.rejected > 0 ? 'bg-destructive/15' : 'bg-foreground/[0.06]'
                )}
              >
                <X
                  className={cn(
                    'w-3.5 h-3.5',
                    stats.rejected > 0 ? 'text-destructive' : 'text-foreground/40'
                  )}
                />
              </div>
              <div>
                <p className="text-xs text-foreground/50">{nh('rejected')}</p>
                <p
                  className={cn(
                    'text-sm font-semibold',
                    stats.rejected > 0 ? 'text-destructive' : 'text-foreground/40'
                  )}
                >
                  {stats.rejected}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Main CTA - Open Hub */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-8">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm text-center"
          >
            {/* Hero Icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/20 border border-primary/20 flex items-center justify-center">
              <Settings2 className="w-8 h-8 text-primary" />
            </div>

            <h3 className="text-lg font-semibold text-foreground mb-2">{nh('centralHub')}</h3>
            <p className="text-sm text-foreground/50 mb-6 max-w-xs mx-auto">
              {nh('centralHubDesc')}
            </p>

            {/* Primary CTA */}
            <Button
              onClick={() => setIsModalOpen(true)}
              className="w-full max-w-xs gap-2 h-12 text-sm font-medium shadow-lg shadow-primary/20"
            >
              <Sparkles className="w-4 h-4" />
              {nh('openHub')}
              <ArrowRight className="w-4 h-4 ml-auto" />
            </Button>

            {/* Quick stats below CTA */}
            {stats.pending > 0 && (
              <p className="mt-3 text-xs text-warning flex items-center justify-center gap-1">
                <Clock className="w-3 h-3" />
                {stats.pending === 1
                  ? nh('pendingSuggestions', { count: stats.pending })
                  : nh('pendingSuggestionsPlural', { count: stats.pending })}
              </p>
            )}
          </motion.div>
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 px-4 md:px-6 py-4 border-t border-foreground/[0.06] bg-foreground/[0.01]">
          <div className="flex items-center gap-3">
            <Button variant="ghost" onClick={onBack} className="text-foreground/60">
              {nh('back')}
            </Button>
            <Button
              onClick={onContinue}
              disabled={stats.pending > 0}
              className={cn(
                'flex-1 gap-2',
                stats.pending > 0 &&
                  'bg-warning/15 text-warning border border-warning/30 hover:bg-warning/20'
              )}
              variant={stats.pending > 0 ? 'outline' : 'primary'}
            >
              {stats.pending > 0 ? (
                <>
                  <Clock className="w-4 h-4" />
                  {nh('reviewFirst', { count: stats.pending })}
                </>
              ) : (
                <>
                  {nh('continueToEstimate')}
                  <ChevronRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Unified Normalization Modal - THE Central Hub */}
      <UnifiedNormalizationModal
        open={isModalOpen}
        onOpenChange={setIsModalOpen}
        companyName={companyName}
        currentYear={currentYear}
        originalEBITDA={originalEbitda}
        normalizations={normalizations}
        onNormalizationsChange={onNormalizationsChange}
        ledgerAccounts={ledgerAccounts}
        hasUploadedData={hasUploadedData}
        onUploadClick={onUploadClick}
      />
    </>
  )
}
