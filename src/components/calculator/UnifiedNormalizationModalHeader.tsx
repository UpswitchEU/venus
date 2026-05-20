'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, FileSpreadsheet } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { ModalTitle } from '@/design-system/components/Modal'
import { cn } from '@/design-system/utils'
import { formatCurrencyTaxLatency } from '../../store/useTaxLatencyStore'

export type NormalizationPrimaryTab = 'ebitda' | 'balans'

interface EbitdaTotalsSummary {
  original: number
  adjustment: number
  pendingAdjustment: number
  pendingCount: number
  normalized: number
}

interface UnifiedNormalizationModalHeaderProps {
  companyName: string
  primaryTab: NormalizationPrimaryTab
  onPrimaryTabChange: (tab: NormalizationPrimaryTab) => void
  onClose: () => void
  totals: EbitdaTotalsSummary
  formatCurrency: (amount: number) => string
  currentYear: number
  yearFilter: number | null
  taxLatencyCount: number
  taxLatencyCandidateCount: number
  taxLatencyNetImpact: number
  currencyLocale: string
}

export function UnifiedNormalizationModalHeader({
  companyName,
  primaryTab,
  onPrimaryTabChange,
  onClose,
  totals,
  formatCurrency,
  currentYear,
  yearFilter,
  taxLatencyCount,
  taxLatencyCandidateCount,
  taxLatencyNetImpact,
  currencyLocale,
}: UnifiedNormalizationModalHeaderProps) {
  const nh = useTranslations('normalizationHub')
  const tCommon = useTranslations('common.actions')
  const tTax = useTranslations('taxLatency')

  return (
    <>
      <div className="px-6 py-3 border-b border-foreground/[0.06] flex items-center justify-between pr-14 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label={tCommon('back')}
            title={tCommon('back')}
            className="p-2 -ml-2 rounded-lg text-foreground/60 hover:text-foreground hover:bg-foreground/[0.06] transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileSpreadsheet className="w-4 h-4 text-primary" />
          </div>
          <div>
            <ModalTitle className="text-sm font-semibold">{nh('modalTitle')}</ModalTitle>
            <p className="text-xs text-foreground/50">{companyName}</p>
          </div>
        </div>

        {primaryTab === 'ebitda' ? (
          <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0">
            <div className="flex items-center gap-4 lg:gap-6">
              <div className="text-right">
                <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                  {nh('original')}
                </p>
                <p className="text-sm font-mono font-medium text-foreground/50">
                  {formatCurrency(totals.original)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                  {nh('adjustment')}
                </p>
                <motion.p
                  key={totals.adjustment}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    'text-sm font-mono font-semibold',
                    totals.adjustment > 0
                      ? 'text-success'
                      : totals.adjustment < 0
                        ? 'text-secondary'
                        : 'text-foreground/50'
                  )}
                >
                  {totals.adjustment > 0 ? '+' : ''}
                  {formatCurrency(totals.adjustment)}
                </motion.p>
                {totals.pendingCount > 0 && totals.pendingAdjustment !== 0 && (
                  <p
                    className="text-[9px] font-mono font-medium text-warning/80 mt-0.5 tabular-nums"
                    title={nh('pendingHintTooltip', { count: totals.pendingCount })}
                  >
                    {nh('pendingHint', {
                      sign: totals.pendingAdjustment > 0 ? '+' : '',
                      amount: formatCurrency(totals.pendingAdjustment),
                    })}
                  </p>
                )}
              </div>
              <div className="w-px h-8 bg-foreground/10" />
              <div className="text-right">
                <p className="text-[9px] font-medium text-primary uppercase tracking-wider">
                  {nh('normalized')}
                </p>
                <motion.p
                  key={totals.normalized}
                  initial={{ opacity: 0.5, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  className="text-lg font-mono font-bold text-foreground tracking-tight"
                >
                  {formatCurrency(totals.normalized)}
                </motion.p>
              </div>
            </div>
            {yearFilter === null && (
              <p className="text-[9px] text-foreground/45 text-right max-w-[min(100%,26rem)] leading-snug">
                {nh('anchorYearBridgeHint', { year: currentYear })}
              </p>
            )}
            {yearFilter !== null && (
              <p className="text-[9px] text-foreground/45 text-right">
                {nh('filteredYearTotalsHint', { year: yearFilter })}
              </p>
            )}
          </div>
        ) : (
          <div className="hidden md:flex items-center gap-4 lg:gap-6">
            <div className="text-right">
              <p className="text-[9px] font-medium text-foreground/40 uppercase tracking-wider">
                {nh('primaryTabTaxLatencies')}
              </p>
              <p className="text-sm font-mono font-medium text-foreground/50 tabular-nums">
                {tTax('itemCount', { count: taxLatencyCount })}
              </p>
              {taxLatencyCandidateCount > 0 && (
                <p
                  className="text-[9px] font-mono font-medium text-warning/80 mt-0.5 tabular-nums"
                  title={tTax('pendingCandidatesTooltip', {
                    count: taxLatencyCandidateCount,
                  })}
                >
                  {tTax('pendingCandidatesHint', { count: taxLatencyCandidateCount })}
                </p>
              )}
            </div>
            <div className="w-px h-8 bg-foreground/10" />
            <div className="text-right">
              <p className="text-[9px] font-medium text-primary uppercase tracking-wider">
                {tTax('netImpact')}
              </p>
              <motion.p
                key={taxLatencyNetImpact}
                initial={{ opacity: 0.5, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className={cn(
                  'text-lg font-mono font-bold tracking-tight',
                  taxLatencyNetImpact > 0
                    ? 'text-success'
                    : taxLatencyNetImpact < 0
                      ? 'text-secondary'
                      : 'text-foreground/50'
                )}
              >
                {taxLatencyNetImpact > 0 ? '+' : ''}
                {formatCurrencyTaxLatency(taxLatencyNetImpact, currencyLocale)}
              </motion.p>
            </div>
          </div>
        )}
      </div>

      <div
        className="px-6 py-2 border-b border-foreground/[0.06] shrink-0"
        role="tablist"
        aria-label={`${nh('primaryTabEbitda')} / ${nh('primaryTabTaxLatencies')}`}
      >
        <div className="flex items-center gap-1.5 p-1 rounded-xl bg-background/80 border border-foreground/[0.06] w-fit">
          <button
            onClick={() => onPrimaryTabChange('ebitda')}
            role="tab"
            aria-selected={primaryTab === 'ebitda'}
            aria-controls="ebitda-tab-content"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              primaryTab === 'ebitda'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
            )}
          >
            {nh('primaryTabEbitda')}
          </button>
          <button
            onClick={() => onPrimaryTabChange('balans')}
            role="tab"
            aria-selected={primaryTab === 'balans'}
            aria-controls="balans-tab-content"
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
              primaryTab === 'balans'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-foreground/60 hover:text-foreground hover:bg-foreground/[0.05]'
            )}
          >
            {nh('primaryTabTaxLatencies')}
            {taxLatencyCount > 0 && (
              <span
                className={cn(
                  'ml-0.5 min-w-[1.25rem] h-5 px-1.5 inline-flex items-center justify-center rounded-md text-[10px] font-bold tabular-nums',
                  primaryTab === 'balans'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-foreground/[0.08] text-foreground/60'
                )}
              >
                {taxLatencyCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
