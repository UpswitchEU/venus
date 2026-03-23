'use client'

import { AuroraButton } from '@/design-system/components/Button'
import { AuroraSelect } from '@/design-system/components/Select'
import { cn } from '@/design-system/utils'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ValuationResponse } from '../../types/valuation'
import {
  PREPARER_EBITDA_REASON_KEYS,
  clientShouldWarnExtremeMultiple,
  usePreparerMultipleStore,
} from '../../store/manual/usePreparerMultipleStore'

interface PreparerMultiplePanelProps {
  result: ValuationResponse | null
  disabled?: boolean
  className?: string
  /** Re-run valuation with current form + preparer override payload */
  onRecalculate?: () => void
  industryLabel?: string
  businessTypeLabel?: string
  countryCode?: string
  /** Currently selected Omni-Calc method — controls contextual hints */
  selectedOmniMethod?: string
}

export function PreparerMultiplePanel({
  result,
  disabled,
  className,
  onRecalculate,
  industryLabel,
  businessTypeLabel,
  countryCode,
  selectedOmniMethod,
}: PreparerMultiplePanelProps) {
  const t = useTranslations('preparerMultiple')
  const locale = useLocale()
  const [open, setOpen] = useState(true)

  const benchmarkMedian = usePreparerMultipleStore((s) => s.benchmarkMedian)
  const appliedMedian = usePreparerMultipleStore((s) => s.appliedMedian)
  const reasonKey = usePreparerMultipleStore((s) => s.reasonKey)
  const note = usePreparerMultipleStore((s) => s.note)
  const acknowledgedExtreme = usePreparerMultipleStore((s) => s.acknowledgedExtreme)
  const syncFromValuationResult = usePreparerMultipleStore((s) => s.syncFromValuationResult)
  const setAppliedMedian = usePreparerMultipleStore((s) => s.setAppliedMedian)
  const setReasonKey = usePreparerMultipleStore((s) => s.setReasonKey)
  const setNote = usePreparerMultipleStore((s) => s.setNote)
  const setAcknowledgedExtreme = usePreparerMultipleStore((s) => s.setAcknowledgedExtreme)
  const resetToBenchmark = usePreparerMultipleStore((s) => s.resetToBenchmark)

  useEffect(() => {
    if (result) syncFromValuationResult(result)
  }, [result, syncFromValuationResult])

  const mv = result?.multiples_valuation
  const appliedNum = appliedMedian != null ? Number(appliedMedian) : null
  const benchmarkNum = benchmarkMedian ?? (mv?.ebitda_multiple != null ? Number(mv.ebitda_multiple) : null)
  const deltaNum =
    appliedNum != null && benchmarkNum != null
      ? Math.round((appliedNum - benchmarkNum) * 100) / 100
      : null
  const showExtreme =
    appliedNum != null &&
    clientShouldWarnExtremeMultiple(
      appliedNum,
      mv?.p10_ebitda_multiple,
      mv?.p90_ebitda_multiple,
      benchmarkMedian,
      mv?.p25_ebitda_multiple,
      mv?.p75_ebitda_multiple,
    )

  const bench = benchmarkNum ?? 5
  const sliderMin = Math.max(0.5, Math.round(bench * 0.45 * 20) / 20)
  const sliderMax = Math.min(40, Math.round(bench * 2.2 * 20) / 20)

  let regionName: string | null = null
  if (countryCode && countryCode.length === 2) {
    try {
      const loc = locale === 'nl' ? 'nl-BE' : 'en-GB'
      regionName = new Intl.DisplayNames([loc], { type: 'region' }).of(countryCode.toUpperCase()) ?? null
    } catch {
      regionName = countryCode.toUpperCase()
    }
  }
  const contextSegments = [businessTypeLabel, industryLabel, regionName].filter(
    (s): s is string => typeof s === 'string' && s.trim().length > 0
  )
  const benchmarkContext = contextSegments.length > 0 ? contextSegments.join(t('contextSeparator')) : null

  const qualityRaw = `${mv?.comparables_quality ?? ''} ${mv?.confidence ?? ''}`.toUpperCase()
  let confidenceKey: 'confidenceHigh' | 'confidenceMedium' | 'confidenceLow' | 'confidenceDefault' =
    'confidenceDefault'
  if (qualityRaw.includes('HIGH')) confidenceKey = 'confidenceHigh'
  else if (qualityRaw.includes('MEDIUM') || qualityRaw.includes('MODERATE'))
    confidenceKey = 'confidenceMedium'
  else if (qualityRaw.includes('LOW')) confidenceKey = 'confidenceLow'

  if (!result?.multiples_valuation?.ebitda_multiple && benchmarkMedian == null) return null

  const nonEbitdaMethodSelected =
    selectedOmniMethod != null &&
    selectedOmniMethod !== 'upswitch_adaptive' &&
    selectedOmniMethod !== 'ebitda_multiple'
  const effectiveDisabled = disabled || nonEbitdaMethodSelected

  const savedSummary = result?.multiple_adjustment_summary
  const livePreview =
    benchmarkNum != null &&
    appliedNum != null &&
    reasonKey &&
    Math.abs(appliedNum - benchmarkNum) >= 0.005
      ? t('previewTemplate', {
          benchmark: benchmarkNum.toFixed(2),
          applied: appliedNum.toFixed(2),
          delta: Math.abs(appliedNum - benchmarkNum).toFixed(2),
          adjustmentLabel: appliedNum >= benchmarkNum ? t('adjustmentPremium') : t('adjustmentDiscount'),
          reason: t(`reasons.${reasonKey}`),
        }) + (note.trim() ? ` ${t('previewNote', { note: note.trim() })}` : '')
      : null
  const savedPreview =
    locale === 'nl'
      ? savedSummary?.generated_footnote_nl ?? savedSummary?.generated_footnote ?? null
      : savedSummary?.generated_footnote_en ?? savedSummary?.generated_footnote ?? null
  const previewText = livePreview ?? savedPreview

  return (
    <div
      className={cn(
        'rounded-lg border border-border/60 bg-card/80 text-left',
        className
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <span className="text-xs font-semibold text-foreground/70 uppercase tracking-wide">
          {t('title')}
        </span>
        {open ? <ChevronDown className="w-4 h-4 shrink-0 opacity-50" /> : <ChevronRight className="w-4 h-4 shrink-0 opacity-50" />}
      </button>
      {open && (
        <div className={cn("px-3 pb-3 pt-0 space-y-3 border-t border-border/40", nonEbitdaMethodSelected && "opacity-60")}>
          {nonEbitdaMethodSelected && (
            <div className="mt-2 rounded-md border border-amber-300/30 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2">
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                {selectedOmniMethod === 'fiscal_4x'
                  ? t('hintFiscalMethod')
                  : t('hintOtherMethod')}
              </p>
            </div>
          )}
          <p className="text-[11px] text-foreground/50 leading-snug pt-2">{t('description')}</p>
          <div className="rounded-md border border-border/60 bg-background/60 px-3 py-2">
            <p className="text-[11px] leading-snug text-foreground/60">{t('applyHint')}</p>
          </div>
          <div className="grid gap-1.5">
            <span className="text-[10px] font-medium text-foreground/45 uppercase">{t('benchmark')}</span>
            <p className="text-[12px] text-foreground/80 leading-snug font-medium">
              {benchmarkContext
                ? t('benchmarkAnchored', {
                    context: benchmarkContext,
                    multiple: (benchmarkMedian ?? bench).toFixed(2),
                  })
                : t('benchmarkAnchoredShort', { multiple: (benchmarkMedian ?? bench).toFixed(2) })}
            </p>
            <span className="text-sm font-mono font-semibold tabular-nums text-primary">
              {(benchmarkMedian ?? bench).toFixed(2)}×
            </span>
            <p className="text-[10px] text-foreground/45">
              {t('benchmarkConfidence', { level: t(confidenceKey) })}
              {mv?.confidence_score != null && Number.isFinite(Number(mv.confidence_score))
                ? ` · ${t('scoreLabel', { score: Math.round(Number(mv.confidence_score)) })}`
                : ''}
            </p>
            {mv?.unadjusted_ebitda_multiple != null && (
              <span className="text-[10px] text-foreground/40">{t('benchmarkHint')}</span>
            )}
          </div>
          <div className="grid gap-1">
            <label className="text-[10px] font-medium text-foreground/45 uppercase" htmlFor="prep-ev-ebitda">
              {t('applied')}
            </label>
            {deltaNum != null && Math.abs(deltaNum) >= 0.005 && (
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/60 px-2 py-1 text-[10px] text-foreground/55">
                <span>{t('deltaLabel')}</span>
                <span className="font-mono tabular-nums text-foreground/75">
                  {deltaNum > 0 ? '+' : ''}
                  {deltaNum.toFixed(2)}×
                </span>
              </div>
            )}
            <input
              id="prep-ev-ebitda"
              type="number"
              step="0.05"
              min={0.5}
              max={40}
              disabled={effectiveDisabled}
              value={appliedMedian ?? ''}
              onChange={(e) => {
                const v = e.target.value
                if (v === '') {
                  setAppliedMedian(null)
                  return
                }
                const n = parseFloat(v)
                if (Number.isFinite(n)) setAppliedMedian(n)
              }}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm font-mono tabular-nums"
            />
            <input
              type="range"
              aria-label={t('applied')}
              disabled={effectiveDisabled}
              min={sliderMin}
              max={sliderMax}
              step={0.05}
              value={
                appliedMedian != null && Number.isFinite(appliedMedian)
                  ? Math.min(sliderMax, Math.max(sliderMin, appliedMedian))
                  : Math.min(sliderMax, Math.max(sliderMin, bench))
              }
              onChange={(e) => {
                const n = parseFloat(e.target.value)
                if (Number.isFinite(n)) setAppliedMedian(n)
              }}
              className="w-full h-2 mt-1 accent-primary"
            />
            <p className="text-[10px] text-foreground/35">{t('sliderHint')}</p>
          </div>
          <div className="grid gap-1">
            <label className="text-[10px] font-medium text-foreground/45 uppercase" htmlFor="prep-reason">
              {t('reason')}
            </label>
            <AuroraSelect
              size="sm"
              value={reasonKey}
              onChange={(v) =>
                setReasonKey(v as (typeof PREPARER_EBITDA_REASON_KEYS)[number] | '')
              }
              disabled={effectiveDisabled}
              placeholder={t('reasonPlaceholder')}
              options={PREPARER_EBITDA_REASON_KEYS.map((k) => ({
                value: k,
                label: t(`reasons.${k}`),
              }))}
              clearable
            />
          </div>
          <div className="grid gap-1">
            <label className="text-[10px] font-medium text-foreground/45 uppercase" htmlFor="prep-note">
              {t('noteOptional')}
            </label>
            <textarea
              id="prep-note"
              disabled={effectiveDisabled}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs resize-none"
            />
          </div>
          {previewText && (
            <div className="rounded-md border border-primary/20 bg-primary/[0.05] px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-primary/80">
                  {t('previewTitle')}
                </span>
                <span className="text-[10px] text-primary/65">
                  {livePreview ? t('previewLive') : t('previewSaved')}
                </span>
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-foreground/75">{previewText}</p>
            </div>
          )}
          {showExtreme && (
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                disabled={effectiveDisabled}
                checked={acknowledgedExtreme}
                onChange={(e) => setAcknowledgedExtreme(e.target.checked)}
                className="mt-1"
              />
              <span className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                {t('extremeWarning')}
              </span>
            </label>
          )}
          <div className="flex flex-col gap-2">
            {onRecalculate && (
              <AuroraButton
                type="button"
                variant="primary"
                size="sm"
                disabled={effectiveDisabled}
                className="w-full text-xs"
                onClick={() => onRecalculate()}
              >
                {t('recalculate')}
              </AuroraButton>
            )}
            <AuroraButton
              type="button"
              variant="outline"
              size="sm"
              disabled={effectiveDisabled}
              className="w-full text-xs"
              onClick={() => resetToBenchmark()}
            >
              {t('resetBenchmark')}
            </AuroraButton>
          </div>
        </div>
      )}
    </div>
  )
}
