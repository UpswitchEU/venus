'use client'

import { Loader2, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { AuroraButton } from '@/design-system/components/Button'
import { SegmentedControl } from '@/design-system/components/SegmentedControl'
import { AuroraSelect } from '@/design-system/components/Select'
import { cn } from '@/design-system/utils'
import type { ValuationMethodResult } from '../../types/valuation'
import { getValuationMethodResultForKey } from '../../utils/extractValuationResultsMap'
import { OmniMethodPanorama } from './omni/OmniMethodPanorama'
import { formatCurrency } from './ValuationEditModalFormatting'
import {
  getValuationEditGuidanceTextKey,
  getValuationEditGuidanceVariant,
  METHOD_OVERRIDE_REASON_KEYS,
  resolveSelectedValuationMethodLabel,
  VALUATION_EDIT_GUIDANCE_TONE_CLASS,
  type ValuationEditMode,
} from './ValuationEditModalModel'

interface ValuationEditMethodSelectorPanelProps {
  valuationResults: Record<string, ValuationMethodResult>
  panoramaValuationResults: Record<string, ValuationMethodResult>
  selectedMethod: string
  pendingMethod: string | null
  mode: ValuationEditMode
  overrideReasonKey: string
  overrideNote: string
  showFiscalAnchorRow: boolean
  fiscalAnchor?: number | null
  methodSelectionLocked: boolean
  firmCountryCode?: string
  comparablesCount: number | null
  comparablesQuality: string | null
  onModeChange: (mode: ValuationEditMode) => void
  onMethodClick: (method: string) => void
  onOverrideReasonChange: (reason: string) => void
  onOverrideNoteChange: (note: string) => void
  onConfirmOverride: () => void
  onCancelOverride: () => void
  onPlanLockedMethodClick?: () => void
}

export function ValuationEditMethodSelectorPanel({
  valuationResults,
  panoramaValuationResults,
  selectedMethod,
  pendingMethod,
  mode,
  overrideReasonKey,
  overrideNote,
  showFiscalAnchorRow,
  fiscalAnchor,
  methodSelectionLocked,
  firmCountryCode,
  comparablesCount,
  comparablesQuality,
  onModeChange,
  onMethodClick,
  onOverrideReasonChange,
  onOverrideNoteChange,
  onConfirmOverride,
  onCancelOverride,
  onPlanLockedMethodClick,
}: ValuationEditMethodSelectorPanelProps) {
  const t = useTranslations('omniCalc')
  const tModal = useTranslations('valuationEditModal')
  const panoramaEntries = Object.entries(panoramaValuationResults)
  const adaptiveLabel = t('currentMethodAdaptive')
  const currentMethodLabel = resolveSelectedValuationMethodLabel({
    adaptiveLabel,
    method: selectedMethod,
    valuationResults,
  })
  const pendingOverrideRow =
    pendingMethod && pendingMethod !== 'upswitch_adaptive'
      ? getValuationMethodResultForKey(valuationResults, pendingMethod)
      : null
  const guidanceVariant = getValuationEditGuidanceVariant(mode, pendingMethod)
  const guidanceTextKey = getValuationEditGuidanceTextKey(guidanceVariant)
  const showMethodList = mode === 'manual'
  const availableCount = panoramaEntries.filter(([, method]) => method.available).length

  return (
    <div className="space-y-3 min-h-0 min-w-0 flex-1 lg:max-h-[min(82vh,880px)] lg:overflow-y-auto lg:pr-2">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <h4 className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">
            {tModal('methodSection')}
          </h4>
          <p className="text-[11px] leading-snug text-foreground/50">{t('subtitle')}</p>
        </div>
        <div className="shrink-0 text-right max-w-[55%]">
          <span className="text-[10px] text-foreground/40 leading-tight block">
            {t('methodsReadyBadge', {
              available: availableCount,
              total: panoramaEntries.length,
            })}
          </span>
          <div className="mt-1 inline-flex items-center rounded-full border border-primary/15 bg-primary/[0.05] px-2 py-1 text-[10px] font-medium text-primary/80 max-w-full">
            <span className="truncate">
              {t('currentMethodLabel', { method: currentMethodLabel })}
            </span>
          </div>
        </div>
      </div>

      <SegmentedControl
        options={[
          {
            value: 'ai' as const,
            label: t('modeAi'),
          },
          {
            value: 'manual' as const,
            label: t('modeManual'),
            icon: <Pencil className="w-3 h-3" />,
          },
        ]}
        value={mode}
        onChange={onModeChange}
        size="sm"
        fullWidth
        disabled={methodSelectionLocked}
        aria-label={t('modeLabel')}
      />

      <div
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-md border px-3 py-2 text-[11px] leading-snug',
          VALUATION_EDIT_GUIDANCE_TONE_CLASS[guidanceVariant]
        )}
      >
        {t(guidanceTextKey as Parameters<typeof t>[0])}
      </div>

      {methodSelectionLocked && (
        <p
          className="text-[11px] text-foreground/50 mt-2 flex items-center gap-2"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0 text-primary/70" aria-hidden />
          {tModal('persistingMethod')}
        </p>
      )}

      {showMethodList && (
        <OmniMethodPanorama
          valuationResults={panoramaValuationResults}
          selectedMethod={selectedMethod}
          pendingMethod={pendingMethod}
          methodSelectionLocked={methodSelectionLocked}
          onMethodClick={onMethodClick}
          firmCountryCode={firmCountryCode}
          onPlanLockedMethodClick={onPlanLockedMethodClick}
          comparablesCount={comparablesCount}
          comparablesQuality={comparablesQuality}
        />
      )}

      {pendingMethod && pendingMethod !== 'upswitch_adaptive' && (
        <div className="rounded-lg border border-primary/20 bg-primary/[0.03] px-3 py-3 space-y-2">
          {pendingOverrideRow?.label && (
            <p className="text-[10px] font-medium text-foreground/55">
              {t('overrideConfirmingFor', {
                method: pendingOverrideRow.label,
              })}
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
            onChange={onOverrideReasonChange}
            label={t('overrideJustificationTitle')}
            placeholder={t('overrideReasonPlaceholder')}
            options={METHOD_OVERRIDE_REASON_KEYS.map((key) => ({
              value: key,
              label: t(`overrideReasons.${key}`),
            }))}
          />
          <textarea
            value={overrideNote}
            onChange={(event) => onOverrideNoteChange(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder={t('overrideNotePlaceholder')}
            aria-label={t('overrideNotePlaceholder')}
            className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
          />
          <div className="flex gap-2">
            <AuroraButton
              type="button"
              variant="primary"
              size="sm"
              disabled={!overrideReasonKey || methodSelectionLocked}
              className="flex-1 text-xs"
              onClick={onConfirmOverride}
            >
              {t('overrideConfirm')}
            </AuroraButton>
            <AuroraButton
              type="button"
              variant="outline"
              size="sm"
              disabled={methodSelectionLocked}
              className="text-xs"
              onClick={onCancelOverride}
            >
              {t('overrideCancel')}
            </AuroraButton>
          </div>
        </div>
      )}

      {showFiscalAnchorRow &&
        fiscalAnchor != null &&
        !getValuationMethodResultForKey(valuationResults, 'fiscal_4x') && (
          <div className="space-y-1">
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-foreground/[0.02] border border-dashed border-border/50">
              <span className="text-[10px] font-medium text-foreground/50 uppercase tracking-wider">
                {t('fiscalAnchor')}
              </span>
              <span className="text-xs font-mono font-medium text-foreground/60 tabular-nums">
                {formatCurrency(Number(fiscalAnchor))}
              </span>
            </div>
            <p className="text-[9px] text-foreground/40 leading-snug px-1">
              {t('fiscalAnchorFootnote')}
            </p>
          </div>
        )}
    </div>
  )
}
