'use client'

import { useEffect, useId, useState } from 'react'
import {
  Download,
  Loader2,
  Pencil,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/design-system/utils'
import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import type { ValuationMethodResult } from '../../types/valuation'
import { buildZeroDraftCsv, downloadZeroDraftCsv } from '@/utils/zeroDraftCsv'
import { OmniMethodPanorama } from './omni/OmniMethodPanorama'

const METHOD_OVERRIDE_REASON_KEYS = [
  'fiscal_compliance',
  'asset_heavy_business',
  'internal_transfer',
  'conservative_anchor',
  'client_preference',
  'regulatory_requirement',
  'other',
] as const

interface OmniCalcPanelProps {
  valuationResults: Record<string, ValuationMethodResult>
  selectedMethod: string
  onSelectMethod: (method: string, overrideReason?: string, overrideNote?: string) => void
  fiscalAnchor?: number | null
  showFiscalAnchorRow?: boolean
  compact?: boolean
  showZeroDraftExport?: boolean
  zeroDraftReportId?: string
  zeroDraftBusinessName?: string | null
  zeroDraftCreatedAt?: string | null
  /** When true, locks method UI (matches ValuationEditModal during PATCH). */
  isMethodPersisting?: boolean
}

const formatCurrency = (amount: number) =>
  amount >= 1_000_000
    ? `€${(amount / 1_000_000).toFixed(1)}M`
    : amount >= 1_000
      ? `€${(amount / 1_000).toFixed(0)}K`
      : `€${Math.round(amount)}`

const getSelectedMethodLabel = (
  selectedMethod: string,
  valuationResults: Record<string, ValuationMethodResult>,
  fallback: string
) =>
  selectedMethod === 'upswitch_adaptive'
    ? fallback
    : valuationResults[selectedMethod]?.label || fallback

export function OmniCalcPanel({
  valuationResults,
  selectedMethod,
  onSelectMethod,
  fiscalAnchor,
  showFiscalAnchorRow = false,
  compact = false,
  showZeroDraftExport = false,
  zeroDraftReportId,
  zeroDraftBusinessName,
  zeroDraftCreatedAt,
  isMethodPersisting = false,
}: OmniCalcPanelProps) {
  const t = useTranslations('omniCalc')
  const tValuationModal = useTranslations('valuationEditModal')
  const panelHeadingId = useId()
  const adaptiveLabel = t('currentMethodAdaptive')

  const isManualMode = selectedMethod !== 'upswitch_adaptive'
  const [mode, setMode] = useState<'ai' | 'manual'>(isManualMode ? 'manual' : 'ai')
  const [pendingMethod, setPendingMethod] = useState<string | null>(null)
  const [overrideReasonKey, setOverrideReasonKey] = useState('')
  const [overrideNote, setOverrideNote] = useState('')

  useEffect(() => {
    setMode(selectedMethod === 'upswitch_adaptive' ? 'ai' : 'manual')
    setPendingMethod(null)
    setOverrideReasonKey('')
    setOverrideNote('')
  }, [selectedMethod])

  const entries = Object.entries(valuationResults)
  if (entries.length === 0) {
    return (
      <div
        data-omni-calc-panel="true"
        role="region"
        aria-labelledby={panelHeadingId}
        className={cn('space-y-2', compact ? 'px-3 py-2' : 'px-4 py-3')}
      >
        <div className="rounded-lg border border-dashed border-border/60 bg-background/60 px-3 py-3">
          <p id={panelHeadingId} className="text-[11px] font-semibold uppercase tracking-wide text-foreground/60">
            {t('unavailableTitle')}
          </p>
          <p className="mt-1 text-[11px] leading-snug text-foreground/50">
            {t('unavailableBlurb')}
          </p>
        </div>
      </div>
    )
  }

  const currentMethodLabel = getSelectedMethodLabel(selectedMethod, valuationResults, adaptiveLabel)

  const methodSelectionLocked = isMethodPersisting

  const handleModeChange = (newMode: 'ai' | 'manual') => {
    if (methodSelectionLocked) return
    setMode(newMode)
    if (newMode === 'ai') {
      setPendingMethod(null)
      setOverrideReasonKey('')
      setOverrideNote('')
      onSelectMethod('upswitch_adaptive')
    }
  }

  const handleMethodClick = (key: string) => {
    if (methodSelectionLocked) return
    if (key === 'upswitch_adaptive') {
      handleModeChange('ai')
      return
    }
    setPendingMethod(key)
    setOverrideReasonKey('')
    setOverrideNote('')
  }

  const handleConfirmOverride = () => {
    if (methodSelectionLocked) return
    if (!pendingMethod || !overrideReasonKey) return
    onSelectMethod(pendingMethod, overrideReasonKey, overrideNote || undefined)
    setPendingMethod(null)
  }

  const showMethodList = mode === 'manual'
  const guidanceTone = pendingMethod
    ? 'border-primary/20 bg-primary/[0.04] text-primary/80'
    : mode === 'manual'
      ? 'border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
      : 'border-border/60 bg-background/60 text-foreground/60'
  const guidanceText = pendingMethod
    ? t('stepExplainReason')
    : mode === 'manual'
      ? t('stepChooseMethod')
      : t('stepAiActive')

  const availableCount = entries.filter(([, m]) => m.available).length

  return (
    <div
      data-omni-calc-panel="true"
      role="region"
      aria-labelledby={panelHeadingId}
      aria-busy={isMethodPersisting}
      className={cn('space-y-2', compact ? 'px-3 py-2' : 'px-4 py-3')}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h4
            id={panelHeadingId}
            className="text-xs font-semibold text-foreground/60 uppercase tracking-wider"
          >
            {t('title')}
          </h4>
          <p className="text-[11px] leading-snug text-foreground/50">
            {t('subtitle')}
          </p>
        </div>
        <div className="shrink-0 text-right max-w-[55%]">
          <span className="text-[10px] text-foreground/40 leading-tight block">
            {t('methodsReadyBadge', { available: availableCount, total: entries.length })}
          </span>
          <div className="mt-1 inline-flex items-center rounded-full border border-primary/15 bg-primary/[0.05] px-2 py-1 text-[10px] font-medium text-primary/80 max-w-full">
            <span className="truncate">{t('currentMethodLabel', { method: currentMethodLabel })}</span>
          </div>
        </div>
      </div>

      {/* AI vs Manual Toggle */}
      <SegmentedControl
        options={[
          { value: 'ai' as const, label: t('modeAi') },
          { value: 'manual' as const, label: t('modeManual'), icon: <Pencil className="w-3 h-3" /> },
        ]}
        value={mode}
        onChange={handleModeChange}
        size="sm"
        fullWidth
        disabled={methodSelectionLocked}
        aria-label={t('modeLabel')}
      />
      <p className="px-1 text-[10px] leading-snug text-foreground/45">
        {mode === 'ai' ? t('modeAiBlurb') : t('modeManualBlurb')}
      </p>
      <p className="px-1 text-[10px] leading-snug text-foreground/40">
        {t('selectionPersistenceHint')}
      </p>
      <div
        role="status"
        aria-live="polite"
        className={cn('rounded-md border px-3 py-2 text-[11px] leading-snug', guidanceTone)}
      >
        {guidanceText}
      </div>

      {isMethodPersisting && (
        <p
          className="text-[11px] text-foreground/50 flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary/70" aria-hidden />
          {tValuationModal('persistingMethod')}
        </p>
      )}

      {showMethodList && (
        <OmniMethodPanorama
          valuationResults={valuationResults}
          selectedMethod={selectedMethod}
          pendingMethod={pendingMethod}
          methodSelectionLocked={methodSelectionLocked}
          onMethodClick={handleMethodClick}
        />
      )}

      {/* Override Justification (required before confirming a manual method) */}
      {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
          {valuationResults[pendingMethod]?.label && (
            <p className="text-[10px] font-medium text-foreground/55">
              {t('overrideConfirmingFor', { method: valuationResults[pendingMethod]!.label })}
            </p>
          )}
          <p className="text-[11px] font-semibold text-primary/80 uppercase tracking-wider">
            {t('overrideJustificationTitle')}
          </p>
          <p className="text-[10px] text-foreground/50 leading-snug">
            {t('overrideJustificationBlurb')}
          </p>
          <AuroraSelect
            size="sm"
            value={overrideReasonKey}
            onChange={(v) => setOverrideReasonKey(v)}
            placeholder={t('overrideReasonPlaceholder')}
            disabled={methodSelectionLocked}
            options={METHOD_OVERRIDE_REASON_KEYS.map((k) => ({
              value: k,
              label: t(`overrideReasons.${k}`),
            }))}
          />
          <textarea
            value={overrideNote}
            onChange={(e) => setOverrideNote(e.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('overrideNotePlaceholder')}
            disabled={methodSelectionLocked}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
          />
          <div className="flex gap-2">
            <AuroraButton
              type="button"
              variant="primary"
              size="sm"
              disabled={!overrideReasonKey || methodSelectionLocked}
              className="flex-1 text-xs"
              onClick={handleConfirmOverride}
            >
              {t('overrideConfirm')}
            </AuroraButton>
            <AuroraButton
              type="button"
              variant="outline"
              size="sm"
              disabled={methodSelectionLocked}
              className="text-xs"
              onClick={() => setPendingMethod(null)}
            >
              {t('overrideCancel')}
            </AuroraButton>
          </div>
        </div>
      )}

      {/* Fiscal anchor (legacy reference row — still shown for non-selectable display) */}
      {showFiscalAnchorRow && fiscalAnchor != null && !valuationResults['fiscal_4x'] && (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-foreground/[0.02] border border-dashed border-border/50">
            <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
              {t('fiscalAnchor')}
            </span>
            <span className="text-xs font-mono font-medium text-foreground/60 tabular-nums">
              {formatCurrency(Number(fiscalAnchor))}
            </span>
          </div>
          <p className="text-[9px] text-foreground/40 leading-snug px-1">{t('fiscalAnchorFootnote')}</p>
        </div>
      )}

      {showZeroDraftExport && zeroDraftReportId && entries.length > 0 && (
        <div className="pt-1 border-t border-border/40 space-y-1">
          <p className="text-[10px] text-foreground/45 leading-snug px-0.5">{t('zeroDraftBlurb')}</p>
          <AuroraButton
            type="button"
            variant="outline"
            size="sm"
            className="w-full text-xs gap-2"
            onClick={() => {
              const csv = buildZeroDraftCsv({
                reportId: zeroDraftReportId,
                businessName: zeroDraftBusinessName,
                createdAt: zeroDraftCreatedAt ?? undefined,
                fiscalAnchor:
                  showFiscalAnchorRow && fiscalAnchor != null ? fiscalAnchor ?? undefined : undefined,
                selectedMethod,
                methods: valuationResults,
              })
              const rawName = t('zeroDraftFilename', { reportId: zeroDraftReportId })
              const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_')
              downloadZeroDraftCsv(safeName, csv)
            }}
          >
            <Download className="w-3.5 h-3.5" />
            {t('exportZeroDraft')}
          </AuroraButton>
        </div>
      )}
    </div>
  )
}
