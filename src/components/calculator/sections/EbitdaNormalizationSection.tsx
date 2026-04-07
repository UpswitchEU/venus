'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { useTranslations } from 'next-intl'
import { useCallback, useId, useMemo } from 'react'
import { cn } from '@/design-system/utils'
import { useManualPreviewFormatters } from '@/lib/omniPreview'
import { useNormalizationStore } from '@/store/useNormalizationStore'
import { summarizeAcceptedNormalizations } from '@/utils/normalizationMath'
import type {
  NormalizationItem,
  NormalizationSource,
  NormalizationStatus,
} from '../UnifiedNormalizationModal'
import { CurrencyInput } from '../CurrencyInput'
import { ValuationSectionHeader } from './ValuationSectionHeader'

interface NormalizationPreset {
  key: string
  frontendCategory: NormalizationItem['category']
  backendCategory: string
}

const NORMALIZATION_PRESETS: NormalizationPreset[] = [
  {
    key: 'ownerComp',
    frontendCategory: 'salary',
    backendCategory: 'owner_compensation_adjustment',
  },
  {
    key: 'oneTime',
    frontendCategory: 'one-time',
    backendCategory: 'one_time_expenses',
  },
  {
    key: 'personal',
    frontendCategory: 'personal',
    backendCategory: 'personal_expenses',
  },
  {
    key: 'depreciation',
    frontendCategory: 'depreciation',
    backendCategory: 'depreciation_adjustment',
  },
]

const CHIP_ID_PREFIX = 'ebitda-norm-chip-'

function makeChipId(presetKey: string): string {
  return `${CHIP_ID_PREFIX}${presetKey}`
}

function isChipItem(item: NormalizationItem, presetKey: string): boolean {
  return item.id === makeChipId(presetKey)
}

export interface EbitdaNormalizationSectionProps {
  step: number
  reportedEbitda?: number
  currentFiscalYear: number
  onViewAllNormalizations?: () => void
  disabled?: boolean
}

export function EbitdaNormalizationSection({
  step,
  reportedEbitda,
  currentFiscalYear,
  onViewAllNormalizations,
  disabled,
}: EbitdaNormalizationSectionProps) {
  const t = useTranslations('manualInput.methodSelector')
  const { currency: currencyFormatter } = useManualPreviewFormatters()
  const idPrefix = useId()

  const items = useNormalizationStore((s) => s.items)
  const addItems = useNormalizationStore((s) => s.addItems)
  const removeItem = useNormalizationStore((s) => s.removeItem)
  const updateItem = useNormalizationStore((s) => s.updateItem)

  const safeReportedEbitda = useMemo(() => {
    const v = Number(reportedEbitda)
    return Number.isFinite(v) ? v : 0
  }, [reportedEbitda])

  const bridge = useMemo(
    () => summarizeAcceptedNormalizations(items, safeReportedEbitda),
    [items, safeReportedEbitda]
  )

  const chipValues = useMemo(() => {
    const map: Record<string, { active: boolean; amount: number }> = {}
    for (const preset of NORMALIZATION_PRESETS) {
      const existing = items.find(
        (n) => isChipItem(n, preset.key) && n.status === 'accepted'
      )
      map[preset.key] = {
        active: !!existing,
        amount: existing ? Math.abs(existing.adjustment) : 0,
      }
    }
    return map
  }, [items])

  const sectionComplete = useMemo(
    () => items.some((n) => n.status === 'accepted'),
    [items]
  )

  const toggleChip = useCallback(
    (preset: NormalizationPreset) => {
      const chipId = makeChipId(preset.key)
      const currentItems = useNormalizationStore.getState().items
      const existing = currentItems.find((n) => n.id === chipId)

      if (existing?.status === 'accepted') {
        removeItem(chipId)
        return
      }

      if (existing) {
        updateItem(chipId, {
          status: 'accepted' as NormalizationStatus,
          type: 'add',
          value: 0,
          adjustment: 0,
          applyAllYears: true,
          year: currentFiscalYear,
        })
      } else {
        addItems([{
          id: chipId,
          ledgerCode: '',
          ledgerName: t(`fields.ebitdaNormChip_${preset.key}` as any),
          category: preset.frontendCategory,
          backendCategory: preset.backendCategory,
          type: 'add',
          value: 0,
          adjustment: 0,
          source: 'manual' as NormalizationSource,
          sourceRef: '',
          status: 'accepted' as NormalizationStatus,
          applyAllYears: true,
          year: currentFiscalYear,
        }])
      }
    },
    [removeItem, addItems, updateItem, currentFiscalYear, t]
  )

  const handleAmountChange = useCallback(
    (preset: NormalizationPreset, amount: number | undefined) => {
      const chipId = makeChipId(preset.key)
      const safeAmount = amount != null && Number.isFinite(amount) ? amount : 0
      updateItem(chipId, {
        value: safeAmount,
        adjustment: safeAmount,
      })
    },
    [updateItem]
  )

  const acceptedCount = useMemo(
    () => items.filter((n) => n.status === 'accepted').length,
    [items]
  )

  const hasReportedEbitda = safeReportedEbitda !== 0

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="mt-6 space-y-4 pt-2"
      aria-label={t('sections.ebitdaNormalization')}
    >
      <ValuationSectionHeader
        step={step}
        complete={sectionComplete}
        title={t('sections.ebitdaNormalization')}
        badge={
          acceptedCount > 0 ? (
            <span className="rounded-full bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
              {acceptedCount}
            </span>
          ) : undefined
        }
      />

      <p className="text-xs leading-relaxed text-muted-foreground -mt-1">
        {t('fields.ebitdaNormLead')}
      </p>

      <div className="rounded-xl border border-primary/10 bg-primary/[0.03] p-3 space-y-2">
        {NORMALIZATION_PRESETS.map((preset) => {
          const cv = chipValues[preset.key]
          const chipInputId = `${idPrefix}-chip-${preset.key}`

          return (
            <div key={preset.key}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => toggleChip(preset)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-xs font-medium transition-colors',
                  cv.active
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted/50 text-foreground/60 hover:bg-muted/80'
                )}
              >
                <span
                  className={cn(
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded text-[11px] font-bold transition-colors',
                    cv.active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-foreground/10 text-foreground/40'
                  )}
                >
                  {cv.active ? '−' : '+'}
                </span>
                <span className="flex-1 truncate">
                  {t(`fields.ebitdaNormChip_${preset.key}` as any)}
                </span>
                {cv.active && cv.amount > 0 && (
                  <span className="tabular-nums text-success font-mono text-[11px]">
                    +{currencyFormatter.format(cv.amount)}
                  </span>
                )}
              </button>

              <AnimatePresence>
                {cv.active && (
                  <motion.div
                    key={chipInputId}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15, ease: 'easeOut' }}
                    className="overflow-hidden"
                  >
                    <div className="px-3 pb-2 pt-1.5">
                      <CurrencyInput
                        value={cv.amount || undefined}
                        onChange={(v) => handleAmountChange(preset, v)}
                        placeholder="15.000"
                        size="sm"
                        disabled={disabled}
                        description={t(`fields.ebitdaNormChipDesc_${preset.key}` as any)}
                      />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {onViewAllNormalizations && (
          <button
            type="button"
            onClick={onViewAllNormalizations}
            className="mt-1 text-[11px] font-medium text-primary/70 hover:text-primary transition-colors underline underline-offset-2"
          >
            {t('fields.ebitdaNormMoreAdjustments')}
          </button>
        )}
      </div>

      {hasReportedEbitda && (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-foreground/50">
              {t('fields.ebitdaNormBridgeReported')}
            </span>
            <span className="font-mono tabular-nums text-foreground/70">
              {currencyFormatter.format(bridge.original)}
            </span>
          </div>

          {bridge.adjustment !== 0 && (
            <div className="flex items-center justify-between text-xs mt-1.5">
              <span className="text-foreground/50">
                {t('fields.ebitdaNormBridgeAdjustments')}
              </span>
              <span
                className={cn(
                  'font-mono tabular-nums font-medium',
                  bridge.adjustment > 0 ? 'text-success' : 'text-destructive'
                )}
              >
                {bridge.adjustment > 0 ? '+' : ''}
                {currencyFormatter.format(bridge.adjustment)}
              </span>
            </div>
          )}

          <div className="mt-2 flex items-center justify-between border-t border-border/40 pt-2 text-xs">
            <span className="font-medium text-foreground/80">
              {t('fields.ebitdaNormBridgeNormalized')}
            </span>
            <span className="font-mono tabular-nums font-bold text-foreground text-sm">
              {currencyFormatter.format(bridge.normalized)}
            </span>
          </div>
        </div>
      )}
    </motion.section>
  )
}
