'use client'

/**
 * Accounting Integration Components
 *
 * CSV-first integration UI for importing accounting software exports.
 * Supports Yuki, Exact, and Odoo file formats.
 * Direct API integrations planned for 2025.
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  ChevronRight,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Upload,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { Body, Caption, Heading, Mono } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface ImportStatus {
  status: 'none' | 'processing' | 'imported' | 'error'
  lastImport?: Date
  fileName?: string
  errorMessage?: string
}

export interface SuggestedNormalisation {
  id: string
  category: string
  description: string
  amount: number
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
}

export interface CSVImportCardProps {
  importStatus: ImportStatus
  onUpload: () => void
  onDownloadTemplate: () => void
  onClearImport?: () => void
  className?: string
  softwareName?: 'Yuki' | 'Exact' | 'Odoo' | 'Octopus' | 'Accountable' | 'Generiek'
}

export interface NormalisationReviewProps {
  suggestions: SuggestedNormalisation[]
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onAcceptAll: () => void
  className?: string
}

// Legacy type exports for backward compatibility
export interface YukiConnectionStatus {
  status: 'disconnected' | 'connecting' | 'connected' | 'error'
  lastSync?: Date
  errorMessage?: string
}

export interface YukiConnectCardProps {
  connectionStatus: YukiConnectionStatus
  onConnect: () => void
  onResync?: () => void
  onDisconnect?: () => void
  className?: string
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────

const formatCurrency = (amount: number) => {
  if (amount >= 1000) return `€${(amount / 1000).toFixed(1)}K`
  return `€${amount.toFixed(0)}`
}

type FormatImportTimeT = (key: string, values?: Record<string, number | string>) => string

const formatImportTime = (date: Date, t: FormatImportTimeT, locale: 'en' | 'nl' = 'nl') => {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const minutes = Math.floor(diff / 60000)

  if (minutes < 1) return t('justNow')
  if (minutes < 60) return t('minutesAgo', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('hoursAgo', { count: hours })
  return date.toLocaleDateString(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

// ─────────────────────────────────────────
// CSV IMPORT CARD (Primary Component)
// ─────────────────────────────────────────

export function CSVImportCard({
  importStatus,
  onUpload,
  onDownloadTemplate,
  onClearImport,
  className,
  softwareName = 'Generiek',
}: CSVImportCardProps) {
  const t = useTranslations('yukiIntegration')
  const locale = useLocale() as 'nl' | 'en'
  const { status, lastImport, fileName, errorMessage } = importStatus

  const softwareColors: Record<string, string> = {
    Yuki: '#00A4E4',
    Exact: '#E94E1B',
    Odoo: '#714B67',
    Octopus: '#2D7DD2',
    Accountable: '#10B981',
    Generiek: 'hsl(var(--primary))',
  }

  const color = softwareColors[softwareName]

  return (
    <GlassCard className={cn('p-6', className)}>
      <div className="flex items-start gap-4">
        {/* Software Icon */}
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${color}15` }}
        >
          <FileSpreadsheet className="w-6 h-6" style={{ color }} />
        </div>

        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            <Heading level={3} className="text-lg">
              {t('exportLabel', { software: softwareName })}
            </Heading>
            {status === 'imported' && (
              <Badge variant="primary" size="sm">
                {t('importedBadge')}
              </Badge>
            )}
            {status === 'error' && (
              <Badge variant="accent" size="sm">
                {t('errorBadge')}
              </Badge>
            )}
          </div>

          {/* Status Description */}
          {status === 'none' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              {t('uploadHint')}
            </Body>
          )}

          {status === 'processing' && (
            <Body size="sm" className="text-foreground/50 mb-4">
              {t('processing')}
            </Body>
          )}

          {status === 'imported' && lastImport && (
            <div className="mb-4">
              {fileName && <Caption className="text-foreground/60 mb-1">{fileName}</Caption>}
              <Caption className="text-foreground/40">
                {t('imported')}: {formatImportTime(lastImport, t, locale)}
              </Caption>
            </div>
          )}

          {status === 'error' && (
            <div className="flex items-start gap-2 mb-4">
              <AlertCircle className="w-4 h-4 text-secondary shrink-0 mt-0.5" />
              <Body size="sm" className="text-secondary">
                {errorMessage || t('errorDefault')}
              </Body>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3">
            {status === 'none' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <Upload className="w-4 h-4" />
                  {t('uploadCsv')}
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  {t('template')}
                </Button>
              </>
            )}

            {status === 'imported' && (
              <>
                <Button variant="secondary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  {t('newFile')}
                </Button>
                {onClearImport && (
                  <Button variant="ghost" size="sm" onClick={onClearImport}>
                    {t('clear')}
                  </Button>
                )}
              </>
            )}

            {status === 'error' && (
              <>
                <Button variant="primary" size="sm" className="gap-2" onClick={onUpload}>
                  <RefreshCw className="w-4 h-4" />
                  {t('retry')}
                </Button>
                <Button variant="ghost" size="sm" className="gap-2" onClick={onDownloadTemplate}>
                  <Download className="w-4 h-4" />
                  {t('template')}
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────
// YUKI CONNECT CARD (Legacy - maps to CSV flow)
// ─────────────────────────────────────────

export function YukiConnectCard({
  connectionStatus,
  onConnect,
  onResync,
  onDisconnect,
  className,
}: YukiConnectCardProps) {
  // Map legacy connection status to import status
  const importStatus: ImportStatus = {
    status:
      connectionStatus.status === 'connected'
        ? 'imported'
        : connectionStatus.status === 'connecting'
          ? 'processing'
          : connectionStatus.status === 'error'
            ? 'error'
            : 'none',
    lastImport: connectionStatus.lastSync,
    errorMessage: connectionStatus.errorMessage,
  }

  return (
    <CSVImportCard
      importStatus={importStatus}
      onUpload={onConnect}
      onDownloadTemplate={() => {}}
      onClearImport={onDisconnect}
      className={className}
      softwareName="Yuki"
    />
  )
}

// ─────────────────────────────────────────
// IMPORT STATUS BADGE
// ─────────────────────────────────────────

export function ImportStatusBadge({
  status,
  lastImport,
}: {
  status: ImportStatus['status']
  lastImport?: Date
}) {
  const t = useTranslations('yukiIntegration')
  const locale = useLocale() as 'nl' | 'en'

  if (status === 'processing') {
    return (
      <div className="flex items-center gap-2 text-sm text-foreground/50">
        <RefreshCw className="w-4 h-4 animate-spin" />
        <span>{t('processing')}</span>
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <AlertCircle className="w-4 h-4" />
        <span>{t('importFailed')}</span>
      </div>
    )
  }

  if (status === 'imported' && lastImport) {
    return (
      <div className="flex items-center gap-2 text-sm text-primary">
        <Check className="w-4 h-4" />
        <span>{t('importedAgo', { time: formatImportTime(lastImport, t, locale) })}</span>
      </div>
    )
  }

  return null
}

// Legacy component alias
export function SyncStatusBadge({
  status,
  lastSync,
}: {
  status: YukiConnectionStatus['status']
  lastSync?: Date
}) {
  const mappedStatus: ImportStatus['status'] =
    status === 'connected'
      ? 'imported'
      : status === 'connecting'
        ? 'processing'
        : status === 'error'
          ? 'error'
          : 'none'

  return <ImportStatusBadge status={mappedStatus} lastImport={lastSync} />
}

// ─────────────────────────────────────────
// NORMALISATION REVIEW PANEL
// ─────────────────────────────────────────

export function NormalisationReviewPanel({
  suggestions,
  onAccept,
  onReject,
  onAcceptAll,
  className,
}: NormalisationReviewProps) {
  const ca = useTranslations('chatAssistant')
  const pendingCount = suggestions.filter((s) => s.status === 'pending').length
  const acceptedCount = suggestions.filter((s) => s.status === 'accepted').length

  return (
    <GlassCard className={cn('p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Heading level={3} className="text-lg mb-1">
            {ca('suggestedNormalizations')}
          </Heading>
          <Caption className="text-foreground/50">
            {pendingCount > 0
              ? ca('normalizationsToReview', { count: pendingCount })
              : ca('normalizationsAccepted', { count: acceptedCount })}
          </Caption>
        </div>

        {pendingCount > 0 && (
          <Button variant="primary" size="sm" onClick={onAcceptAll}>
            {ca('acceptAll')}
          </Button>
        )}
      </div>

      {/* Suggestions List */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {suggestions.map((suggestion) => (
            <motion.div
              key={suggestion.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={cn(
                'flex items-start gap-4 p-4 rounded-xl',
                'border transition-all',
                suggestion.status === 'pending'
                  ? 'bg-foreground/[0.02] border-foreground/[0.06]'
                  : suggestion.status === 'accepted'
                    ? 'bg-primary/5 border-primary/20'
                    : 'bg-foreground/[0.01] border-foreground/[0.04] opacity-50'
              )}
            >
              {/* Amount */}
              <div className="w-20 shrink-0">
                <Mono className="text-lg font-semibold text-primary">
                  {formatCurrency(suggestion.amount)}
                </Mono>
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0">
                <Body size="sm" className="font-medium mb-0.5">
                  {suggestion.category}
                </Body>
                <Caption className="text-foreground/50 line-clamp-2">{suggestion.reason}</Caption>
              </div>

              {/* Actions */}
              {suggestion.status === 'pending' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => onReject(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-foreground/[0.06] transition-colors"
                    aria-label={ca('reject')}
                  >
                    <X className="w-4 h-4 text-foreground/40" />
                  </button>
                  <button
                    onClick={() => onAccept(suggestion.id)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center bg-primary/10 hover:bg-primary/20 transition-colors"
                    aria-label={ca('accept')}
                  >
                    <Check className="w-4 h-4 text-primary" />
                  </button>
                </div>
              )}

              {/* Status Badges */}
              {suggestion.status === 'accepted' && (
                <Badge variant="primary" size="sm">
                  {ca('accepted')}
                </Badge>
              )}
              {suggestion.status === 'rejected' && (
                <Badge variant="neutral" size="sm">
                  {ca('rejected')}
                </Badge>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────
// MAPPING TABLE (GROOTBOEK CODES)
// ─────────────────────────────────────────

export interface MappingRow {
  yukiCode: string
  yukiDescription: string
  mappedTo: string
  category: 'revenue' | 'expense' | 'asset' | 'liability'
}

export function MappingTable({
  mappings,
  className,
}: {
  mappings: MappingRow[]
  className?: string
}) {
  const t = useTranslations('yukiIntegration')
  return (
    <GlassCard className={cn('overflow-hidden', className)}>
      <div className="px-6 py-4 border-b border-foreground/[0.06]">
        <Heading level={3} className="text-lg">
          {t('mappingTitle')}
        </Heading>
        <Caption className="text-foreground/50">
          {t('accountsMatched', { count: mappings.length })}
        </Caption>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-foreground/[0.06]">
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('yukiCode')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('description')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('category')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-foreground/40 uppercase tracking-wider">
                {t('mappedTo')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-foreground/[0.04]">
            {mappings.map((mapping, index) => (
              <tr key={index} className="hover:bg-foreground/[0.02] transition-colors">
                <td className="px-6 py-3">
                  <Mono size="sm" className="text-foreground/70">
                    {mapping.yukiCode}
                  </Mono>
                </td>
                <td className="px-6 py-3">
                  <Body size="sm" className="text-foreground/70 truncate max-w-xs">
                    {mapping.yukiDescription}
                  </Body>
                </td>
                <td className="px-6 py-3">
                  <Badge
                    variant={
                      mapping.category === 'revenue'
                        ? 'primary'
                        : mapping.category === 'expense'
                          ? 'accent'
                          : 'neutral'
                    }
                    size="sm"
                  >
                    {mapping.category === 'revenue'
                      ? t('revenue')
                      : mapping.category === 'expense'
                        ? t('expense')
                        : mapping.category === 'asset'
                          ? t('asset')
                          : t('liability')}
                  </Badge>
                </td>
                <td className="px-6 py-3">
                  <Body size="sm" className="text-foreground">
                    {mapping.mappedTo}
                  </Body>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  )
}

// ─────────────────────────────────────────
// FALLBACK MANUAL INPUT CTA
// ─────────────────────────────────────────

export function ManualInputFallback({
  onManualInput,
  className,
}: {
  onManualInput: () => void
  className?: string
}) {
  const t = useTranslations('yukiIntegration')
  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 rounded-xl',
        'bg-foreground/[0.02] border border-dashed border-foreground/[0.10]',
        className
      )}
    >
      <div>
        <Body size="sm" className="font-medium mb-0.5">
          {t('noAccountingPackage')}
        </Body>
        <Caption className="text-foreground/40">{t('manualInputDesc')}</Caption>
      </div>
      <Button variant="secondary" size="sm" onClick={onManualInput}>
        {t('manualInput')}
        <ChevronRight className="w-4 h-4 ml-1" />
      </Button>
    </div>
  )
}
