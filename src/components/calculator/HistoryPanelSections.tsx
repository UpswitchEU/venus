import { motion } from 'framer-motion'
import { Clock, TrendingUp } from 'lucide-react'
import { springDefault, springSnappy } from '@/design-system/components/motion'
import { cn } from '@/design-system/utils'
import {
  formatHistoryCurrency,
  type HistoryLocale,
  type HistoryTranslator,
} from './HistoryPanelModel'
import type { HistoryVersion } from './VersionCompareModal'

export function VisualTimeline({
  versions,
  hp,
  locale,
}: {
  versions: HistoryVersion[]
  hp: HistoryTranslator
  locale: HistoryLocale
}) {
  const firstVal = versions[0]?.valuation
  const lastVal = versions[versions.length - 1]?.valuation
  const totalChange = versions.length > 1 && firstVal && lastVal ? firstVal - lastVal : 0
  const percentChange = lastVal && totalChange ? (totalChange / lastVal) * 100 : 0

  return (
    <div className="px-4 py-4 border-b border-foreground/[0.06] bg-gradient-to-r from-primary/[0.02] to-transparent">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-foreground/40" />
          <span className="text-xs text-foreground/50">{hp('valuationFlow')}</span>
        </div>
        {totalChange !== 0 && (
          <div
            className={cn(
              'flex items-center gap-1.5 text-xs font-medium',
              totalChange > 0 ? 'text-success' : 'text-secondary'
            )}
          >
            <TrendingUp className={cn('w-3.5 h-3.5', totalChange < 0 && 'rotate-180')} />
            <span className="font-mono">
              {totalChange > 0 ? '+' : ''}
              {formatHistoryCurrency(totalChange, locale)}
            </span>
            <span className="text-foreground/40">
              ({percentChange > 0 ? '+' : ''}
              {percentChange.toFixed(1)}%)
            </span>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-foreground/[0.08] rounded-full" />
        <motion.div
          className="absolute left-4 right-4 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-foreground/20 via-primary/50 to-primary rounded-full origin-left"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={springDefault}
        />

        <div className="relative flex justify-between px-4 py-2">
          {[...versions].reverse().map((version, index) => (
            <div key={version.id} className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ ...springSnappy, delay: index * 0.1 }}
                className={cn(
                  'relative w-4 h-4 rounded-full border-2 transition-all',
                  version.isCurrent
                    ? 'bg-primary border-primary shadow-lg shadow-primary/30'
                    : 'bg-background border-foreground/20 hover:border-foreground/40'
                )}
              >
                {version.isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/30"
                    animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}
              </motion.div>

              <span
                className={cn(
                  'text-[9px] mt-1.5 font-medium',
                  version.isCurrent ? 'text-primary' : 'text-foreground/40'
                )}
              >
                v{version.version}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function ValuationSummaryCard({
  version,
  hp,
  locale,
}: {
  version: HistoryVersion
  hp: HistoryTranslator
  locale: HistoryLocale
}) {
  if (!version.valuation) return null

  return (
    <div className="-mx-4 mb-4 border-y border-foreground/[0.06] bg-foreground/[0.025]">
      <div className="px-4 py-4">
        <p className="text-[11px] font-semibold text-foreground/50">{hp('indicativeEV')}</p>

        <div className="mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-2xl font-bold leading-none tracking-normal text-foreground tabular-nums">
            {formatHistoryCurrency(version.valuation, locale)}
          </span>
          {version.isCurrent && (
            <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-primary/20 bg-primary/10 px-1.5 text-[9px] font-semibold leading-none text-primary">
              {hp('current')}
            </span>
          )}
        </div>

        <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(8.75rem,1fr))] gap-3 border-t border-foreground/[0.06] pt-3">
          {version.valuationLow != null &&
            version.valuationHigh != null &&
            (version.valuationLow > 0 || version.valuationHigh > 0) && (
              <div>
                <p className="mb-1 text-[10px] font-semibold text-foreground/40">
                  {hp('bandwidth')}
                </p>
                <p className="font-mono text-xs font-semibold leading-5 tracking-normal text-foreground/80 tabular-nums">
                  {formatHistoryCurrency(version.valuationLow, locale)} &mdash;{' '}
                  {formatHistoryCurrency(version.valuationHigh, locale)}
                </p>
              </div>
            )}
          {version.ebitda != null && Number.isFinite(version.ebitda) && (
            <div>
              <p className="mb-1 text-[10px] font-semibold text-foreground/40">
                {hp('normalizedEbitda')}
              </p>
              <p className="font-mono text-xs font-semibold leading-5 tracking-normal text-foreground/80 tabular-nums">
                {formatHistoryCurrency(version.ebitda, locale)}
              </p>
            </div>
          )}
          {version.multiple != null && version.multiple > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold text-foreground/40">{hp('multiple')}</p>
              <p className="font-mono text-xs font-semibold leading-5 tracking-normal text-foreground/80 tabular-nums">
                {version.multiple.toFixed(2)}&times;
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
