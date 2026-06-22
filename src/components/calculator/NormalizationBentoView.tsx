'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Check, Clock, Edit3, Trash2, TrendingDown, TrendingUp, X } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { LEDGER_LABEL_TEXT_CLASSES } from '@/constants/ledgerLabelTypography'
import { cn } from '@/design-system/utils'
import { NormalizationActionButton as ActionButton } from './NormalizationActionButton'
import {
  adjustmentForYear,
  type NormalizationViewProps,
  useNormalizationCategoryLabels,
  useNormalizationCurrencyFormatter,
  useNormalizationSourceConfig,
} from './NormalizationViewModel'
import { isImportedLedgerNormalizationItem } from './UnifiedNormalizationTypes'

export function NormalizationBentoView({
  items,
  years,
  originalEBITDA,
  originalEBITDAByYear,
  onAccept,
  onReject,
  onRemove,
  onRestore,
  onEdit,
}: NormalizationViewProps) {
  const t = useTranslations('normalizationHub')
  const formatCurrency = useNormalizationCurrencyFormatter()
  const categoryLabels = useNormalizationCategoryLabels()
  const sourceConfig = useNormalizationSourceConfig()

  if (items.length === 0) {
    return null
  }

  return (
    <div className="pt-2">
      <div className="grid grid-cols-12 gap-4">
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => {
            const cat = categoryLabels[item.category] || categoryLabels.other
            const baseSource = sourceConfig[item.source] || sourceConfig.manual
            const source = isImportedLedgerNormalizationItem(item)
              ? {
                  label: t('sources.importedLedger'),
                  color: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
                }
              : baseSource

            const displayYear = item.applyYears?.[0] ?? item.year ?? years[0]
            const displayAdj = adjustmentForYear(
              item,
              displayYear,
              originalEBITDA,
              originalEBITDAByYear
            )
            const magnitude = Math.abs(displayAdj)
            const isLarge = magnitude > 50000
            const colSpan = isLarge
              ? 'col-span-12 md:col-span-6'
              : 'col-span-12 md:col-span-6 lg:col-span-4'

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.95, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.03, type: 'spring', stiffness: 200, damping: 25 }}
                className={cn(
                  colSpan,
                  'group relative overflow-hidden rounded-xl transition-all duration-300',
                  'bg-card/80 backdrop-blur-lg border hover:translate-y-[-2px]',
                  item.status === 'pending' &&
                    'border-foreground/[0.08] hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5',
                  item.status === 'accepted' &&
                    'border-success/20 bg-success/[0.02] hover:border-success/40 hover:shadow-lg hover:shadow-success/5',
                  item.status === 'rejected' && 'border-secondary/20 bg-secondary/[0.02] opacity-60'
                )}
              >
                <div
                  className={cn(
                    'absolute top-0 left-0 right-0 h-0.5',
                    item.status === 'pending' &&
                      'bg-gradient-to-r from-warning/20 via-warning/30 to-transparent',
                    item.status === 'accepted' &&
                      'bg-gradient-to-r from-success/50 via-success/30 to-transparent',
                    item.status === 'rejected' &&
                      'bg-gradient-to-r from-secondary/50 via-secondary/30 to-transparent'
                  )}
                />

                <div className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'w-10 h-10 rounded-xl flex items-center justify-center text-lg',
                          item.status === 'accepted' ? 'bg-success/10' : 'bg-foreground/[0.05]'
                        )}
                      >
                        {cat.icon}
                      </div>
                      <div className="min-w-0 flex-1 max-w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-foreground/[0.08] text-foreground/60">
                            {item.ledgerCode}
                          </span>
                          <span
                            title={
                              isImportedLedgerNormalizationItem(item)
                                ? t('importedLedgerTooltip')
                                : undefined
                            }
                            className={cn(
                              'px-2 py-0.5 rounded-full text-[9px] font-medium',
                              source.color
                            )}
                          >
                            {source.label}
                          </span>
                        </div>
                        <p
                          className={cn(
                            'text-sm font-medium text-foreground/80 mt-1',
                            LEDGER_LABEL_TEXT_CLASSES
                          )}
                          title={item.ledgerName}
                        >
                          {item.ledgerName}
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                      {item.status === 'pending' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                            size="sm"
                          />
                          <ActionButton
                            icon={X}
                            tooltip={t('actions.reject')}
                            onClick={() => onReject(item.id)}
                            color="secondary"
                            size="sm"
                          />
                          <ActionButton
                            icon={Check}
                            tooltip={t('actions.accept')}
                            onClick={() => onAccept(item.id)}
                            color="success"
                            size="sm"
                          />
                        </>
                      )}
                      {item.status === 'accepted' && (
                        <>
                          <ActionButton
                            icon={Edit3}
                            tooltip={t('actions.edit')}
                            onClick={() => onEdit(item)}
                            color="primary"
                            size="sm"
                          />
                          {item.source === 'manual' && (
                            <ActionButton
                              icon={Trash2}
                              tooltip={t('actions.remove')}
                              onClick={() => onRemove(item.id)}
                              color="secondary"
                              size="sm"
                            />
                          )}
                        </>
                      )}
                      {item.status === 'rejected' && (
                        <ActionButton
                          icon={Clock}
                          tooltip={t('actions.restore')}
                          onClick={() => onRestore(item.id)}
                          color="muted"
                          size="sm"
                        />
                      )}
                    </div>
                  </div>

                  <div className="flex items-end justify-between mt-4 pt-3 border-t border-foreground/[0.06]">
                    <div className="flex items-center gap-2">
                      {displayAdj > 0 ? (
                        <TrendingUp className="w-4 h-4 text-success" />
                      ) : displayAdj < 0 ? (
                        <TrendingDown className="w-4 h-4 text-secondary" />
                      ) : null}
                      <span
                        className={cn(
                          'text-xl font-bold font-mono tabular-nums',
                          displayAdj > 0
                            ? 'text-success'
                            : displayAdj < 0
                              ? 'text-secondary'
                              : 'text-foreground/40'
                        )}
                      >
                        {displayAdj > 0 ? '+' : ''}
                        {formatCurrency(displayAdj)}
                      </span>
                    </div>

                    <div className="flex gap-1">
                      {item.applyAllYears ? (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-primary/10 text-primary tabular-nums">
                          {t('all')}
                        </span>
                      ) : (
                        <>
                          {(item.applyYears || [item.year]).slice(0, 3).map((year) => (
                            <span
                              key={year}
                              className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-foreground/[0.06] text-foreground/50 tabular-nums"
                            >
                              {year}
                            </span>
                          ))}
                          {(item.applyYears || []).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-foreground/[0.06] text-foreground/50">
                              +{(item.applyYears?.length || 0) - 3}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {item.reason && (
                    <p
                      className={cn('text-xs text-foreground/40 mt-2', LEDGER_LABEL_TEXT_CLASSES)}
                      title={item.reason}
                    >
                      {item.reason}
                    </p>
                  )}
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
