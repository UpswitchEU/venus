'use client'

import { ArrowLeftRight, RotateCcw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { RefObject } from 'react'
import { AuroraButton, Modal, ModalContent, ModalHeader, ModalTitle } from '@/design-system'
import { cn } from '@/design-system/utils'
import { currencyLocaleFor, formatHistoryCurrency, type HistoryLocale } from './HistoryPanelModel'
import {
  financialVersionsComparable,
  formatComparisonRange,
  metricChange,
  percentageChange,
  validMetric,
} from './VersionCompareModel'

export interface VersionChange {
  field: string
  oldValue?: string
  newValue: string
  impact?: number
  sourceRef?: string
}

export interface HistoryVersion {
  currency?: string | null
  valueBasis?: 'equity_value' | 'enterprise_value' | null
  id: string
  version: number
  timestamp: Date
  author: string
  authorInitials: string
  type: 'initial' | 'normalization' | 'data_update' | 'methodology' | 'revision'
  summary: string
  changes: VersionChange[]
  valuation?: number
  valuationLow?: number
  valuationHigh?: number
  ebitda?: number
  multiple?: number
  isCurrent?: boolean
}

export interface VersionCompareModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  versionA: HistoryVersion | null
  versionB: HistoryVersion | null
  onRestore?: (version: HistoryVersion) => void
  restoring?: boolean
  onSwap?: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

const typeLabelKeys: Record<HistoryVersion['type'], string> = {
  initial: 'typeInitial',
  normalization: 'typeNormalization',
  data_update: 'typeDataUpdate',
  methodology: 'typeMethodology',
  revision: 'typeRevision',
}

function MetricRow({
  label,
  value,
  change,
  format,
  unavailable,
}: {
  label: string
  value?: number
  change: number | null
  format: (value: number) => string
  unavailable: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <dt className="text-xs text-foreground/60">{label}</dt>
      <dd className="min-w-0 flex flex-wrap justify-end items-center gap-2 text-sm font-mono tabular-nums text-foreground">
        <span className="break-words">{validMetric(value) ? format(value) : unavailable}</span>
        {change !== null && change !== 0 && (
          <span
            className={cn(
              'text-[11px] px-1.5 py-0.5 rounded',
              change > 0 ? 'text-success bg-success/10' : 'text-secondary bg-secondary/10'
            )}
          >
            {change > 0 ? '+' : ''}
            {format(change)}
          </span>
        )}
      </dd>
    </div>
  )
}

function VersionCard({
  version,
  comparison,
  label,
  formatCurrency,
  formatMultiple,
  formatTime,
  t,
}: {
  version: HistoryVersion
  comparison?: HistoryVersion
  label: string
  formatCurrency: (value: number) => string
  formatMultiple: (value: number) => string
  formatTime: (value: Date) => string
  t: (key: string) => string
}) {
  const unavailable = t('unavailable')
  return (
    <section
      aria-label={`${t('version')} ${version.version}`}
      className={cn(
        'min-w-0 rounded-xl border p-4',
        version.isCurrent
          ? 'border-primary/30 bg-primary/[0.02]'
          : 'border-foreground/[0.08] bg-foreground/[0.02]'
      )}
    >
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] font-medium">
        <span className="px-2 py-0.5 rounded-full bg-foreground/[0.08] text-foreground/70">
          {label}
        </span>
        <span className="px-2 py-0.5 rounded-full bg-foreground/[0.06] text-foreground/60">
          {t(typeLabelKeys[version.type])}
        </span>
        {version.isCurrent && (
          <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
            {t('current')}
          </span>
        )}
      </div>
      <div className="flex items-start gap-3 mb-4">
        <div
          className={cn(
            'shrink-0 w-10 h-10 rounded-xl flex items-center justify-center font-semibold text-sm',
            version.isCurrent
              ? 'bg-primary text-primary-foreground'
              : 'bg-foreground/[0.08] text-foreground/60'
          )}
        >
          <span>v{version.version}</span>
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-foreground break-words">{version.summary}</h4>
          <p className="text-xs text-foreground/60 mt-1 break-words">{version.author}</p>
          <p className="text-xs text-foreground/60 mt-1">{formatTime(version.timestamp)}</p>
        </div>
      </div>
      <dl className="space-y-3 p-3 rounded-lg bg-foreground/[0.02] border border-foreground/[0.06]">
        <MetricRow
          label={t('valuation')}
          value={version.valuation}
          change={
            financialVersionsComparable(comparison ?? undefined, version)
              ? metricChange(comparison?.valuation, version.valuation)
              : null
          }
          format={formatCurrency}
          unavailable={unavailable}
        />
        <MetricRow
          label={t('ebitda')}
          value={version.ebitda}
          change={
            financialVersionsComparable(comparison ?? undefined, version)
              ? metricChange(comparison?.ebitda, version.ebitda)
              : null
          }
          format={formatCurrency}
          unavailable={unavailable}
        />
        <MetricRow
          label={t('multiple')}
          value={version.multiple}
          change={
            financialVersionsComparable(comparison ?? undefined, version)
              ? metricChange(comparison?.multiple, version.multiple)
              : null
          }
          format={formatMultiple}
          unavailable={unavailable}
        />
      </dl>
      {version.changes.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-medium text-foreground/60">
            {t('changes')} ({version.changes.length})
          </p>
          <ul className="space-y-1.5">
            {version.changes.map((change, index) => (
              <li
                key={`${change.field}-${index}`}
                className="flex flex-wrap justify-between gap-2 text-xs p-2 rounded-lg bg-foreground/[0.02] border border-foreground/[0.04]"
              >
                <span className="text-foreground/60 break-words">{change.field}</span>
                <span className="font-mono text-foreground/80 break-words">{change.newValue}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function DiffRow({
  label,
  valueA,
  valueB,
  unavailable,
}: {
  label: string
  valueA?: string
  valueB?: string
  unavailable: string
}) {
  const isDifferent = valueA !== undefined && valueB !== undefined && valueA !== valueB
  return (
    <tr className={cn('border-b border-foreground/[0.06]', isDifferent && 'bg-warning/[0.03]')}>
      <th
        scope="row"
        className="w-1/3 py-3 pr-2 text-left font-medium text-xs text-foreground/60 break-words"
      >
        {label}
      </th>
      <td className="w-1/3 p-2 text-right text-xs font-mono tabular-nums text-foreground/70 break-words">
        <ComparisonValue value={valueA} unavailable={unavailable} />
      </td>
      <td className="w-1/3 py-3 pl-2 text-right text-xs font-mono tabular-nums text-foreground break-words">
        <ComparisonValue value={valueB} unavailable={unavailable} />
      </td>
    </tr>
  )
}

function ComparisonValue({ value, unavailable }: { value?: string; unavailable: string }) {
  if (value === undefined) return <>{unavailable}</>
  return (
    <>
      {value.split(' – ').map((part, index) => (
        <span key={`${index}-${part}`}>
          {index > 0 && ' – '}
          <span className="inline-block whitespace-nowrap">{part}</span>
        </span>
      ))}
    </>
  )
}

export function VersionCompareModal({
  open,
  onOpenChange,
  versionA,
  versionB,
  onRestore,
  restoring = false,
  onSwap,
  returnFocusRef,
}: VersionCompareModalProps) {
  const t = useTranslations('versionCompare')
  const hp = useTranslations('historyPanel')
  const rawLocale = useLocale()
  const locale: HistoryLocale = rawLocale === 'fr' ? 'fr' : rawLocale === 'nl' ? 'nl' : 'en'
  const formatCurrency = (amount: number) =>
    formatHistoryCurrency(amount, locale, versionB?.currency)
  const formatCurrencyA = (amount: number) =>
    formatHistoryCurrency(amount, locale, versionA?.currency)
  const formatDecimal = (value: number, digits: number) =>
    new Intl.NumberFormat(locale === 'en' ? 'en-GB' : currencyLocaleFor(locale), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  const formatMultiple = (amount: number) => `${formatDecimal(amount, 2)}×`
  const formatTime = (date: Date) =>
    Number.isFinite(date.getTime())
      ? date.toLocaleString(currencyLocaleFor(locale), {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : t('unavailable')
  if (!versionA || !versionB) return null

  // Respect selection order so swapping reverses both the comparison and restore target.
  const comparable = financialVersionsComparable(versionA, versionB)
  const valuationChange = comparable ? metricChange(versionA.valuation, versionB.valuation) : null
  const percentChange = comparable ? percentageChange(versionA.valuation, versionB.valuation) : null
  const aIsOlder = versionA.version < versionB.version
  const unavailable = t('unavailable')
  const formatted = (value: number | undefined, format: (n: number) => string) =>
    validMetric(value) ? format(value) : undefined
  const comparisonRows = [
    {
      key: 'valuation',
      valueA: formatted(versionA.valuation, formatCurrencyA),
      valueB: formatted(versionB.valuation, formatCurrency),
    },
    {
      key: 'ebitda',
      valueA: formatted(versionA.ebitda, formatCurrencyA),
      valueB: formatted(versionB.ebitda, formatCurrency),
    },
    {
      key: 'multiple',
      valueA: formatted(versionA.multiple, formatMultiple),
      valueB: formatted(versionB.multiple, formatMultiple),
    },
    {
      key: 'bandwidth',
      valueA: formatComparisonRange(versionA.valuationLow, versionA.valuationHigh, formatCurrencyA),
      valueB: formatComparisonRange(versionB.valuationLow, versionB.valuationHigh, formatCurrency),
    },
  ]

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent
        onCloseAutoFocus={(event) => {
          const trigger = returnFocusRef?.current
          if (trigger) {
            event.preventDefault()
            trigger.focus({ preventScroll: true })
          }
        }}
        closeLabel={t('close')}
        description={t('description', { from: versionA.version, to: versionB.version })}
        className="w-[calc(100vw-1.5rem)] max-w-4xl max-h-[90dvh] flex flex-col p-0"
      >
        <ModalHeader className="p-4 pr-14 border-b border-foreground/[0.06] shrink-0">
          <div className="flex flex-wrap items-start justify-between gap-3 w-full">
            <div className="flex items-center gap-3 min-w-0">
              <ArrowLeftRight aria-hidden="true" className="w-5 h-5 shrink-0 text-primary" />
              <div className="min-w-0">
                <ModalTitle className="text-base break-words">{t('title')}</ModalTitle>
                <p className="text-xs text-foreground/60 mt-0.5">
                  v{versionA.version} → v{versionB.version}
                </p>
              </div>
            </div>
            {valuationChange !== null && valuationChange !== 0 && (
              <div
                className={cn(
                  'flex flex-wrap items-center gap-2 px-3 py-1.5 rounded-lg font-mono',
                  valuationChange > 0
                    ? 'bg-success/10 text-success'
                    : 'bg-secondary/10 text-secondary'
                )}
              >
                <span className="text-sm font-semibold">
                  {valuationChange > 0 ? '+' : ''}
                  {formatCurrency(valuationChange)}
                </span>
                {percentChange !== null && (
                  <span className="text-xs">
                    ({percentChange > 0 ? '+' : ''}
                    {formatDecimal(percentChange, 1)}%)
                  </span>
                )}
              </div>
            )}
          </div>
        </ModalHeader>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <VersionCard
              version={versionA}
              label={t(aIsOlder ? 'older' : 'newer')}
              formatCurrency={formatCurrencyA}
              formatMultiple={formatMultiple}
              formatTime={formatTime}
              t={t}
            />
            <VersionCard
              version={versionB}
              comparison={versionA}
              label={t(aIsOlder ? 'newer' : 'older')}
              formatCurrency={formatCurrency}
              formatMultiple={formatMultiple}
              formatTime={formatTime}
              t={t}
            />
          </div>
          <div className="sm:hidden mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3">{t('comparisonDetails')}</h3>
            <dl className="space-y-4">
              {comparisonRows.map((row) => (
                <div key={row.key} className="border-b border-foreground/[0.06] pb-3">
                  <dt className="text-xs font-medium text-foreground/70 mb-2">{t(row.key)}</dt>
                  <dd className="grid grid-cols-2 gap-3 text-xs font-mono tabular-nums text-foreground">
                    <div className="min-w-0">
                      <span className="block text-foreground/60 mb-1">v{versionA.version}</span>
                      <ComparisonValue value={row.valueA} unavailable={unavailable} />
                    </div>
                    <div className="min-w-0 text-right">
                      <span className="block text-foreground/60 mb-1">v{versionB.version}</span>
                      <ComparisonValue value={row.valueB} unavailable={unavailable} />
                    </div>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
          <table className="hidden sm:table w-full table-fixed mt-6">
            <caption className="text-sm font-semibold text-foreground mb-3 text-left">
              {t('comparisonDetails')}
            </caption>
            <thead>
              <tr className="text-xs text-foreground/60">
                <th scope="col" className="text-left pb-2">
                  {t('metric')}
                </th>
                <th scope="col" className="text-right p-2">
                  v{versionA.version}
                </th>
                <th scope="col" className="text-right pb-2 pl-2">
                  v{versionB.version}
                </th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <DiffRow
                  key={row.key}
                  label={t(row.key)}
                  valueA={row.valueA}
                  valueB={row.valueB}
                  unavailable={unavailable}
                />
              ))}
            </tbody>
          </table>
        </div>
        <div className="shrink-0 px-4 py-3 border-t border-foreground/[0.06] bg-foreground/[0.01]">
          <div className="grid grid-cols-[auto_minmax(0,1fr)] sm:flex items-center gap-2">
            <AuroraButton
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-foreground/70 min-h-[44px] justify-self-start sm:mr-auto"
            >
              {t('close')}
            </AuroraButton>
            <div className="contents">
              {onSwap && (
                <AuroraButton
                  variant="outline"
                  size="sm"
                  disabled={restoring}
                  onClick={onSwap}
                  className="gap-1.5 min-h-[44px] justify-self-end"
                >
                  <ArrowLeftRight aria-hidden="true" className="w-4 h-4" />
                  {t('swap')}
                </AuroraButton>
              )}
              {onRestore && !versionB.isCurrent && (
                <AuroraButton
                  size="sm"
                  onClick={() => onRestore(versionB)}
                  loading={restoring}
                  loadingScreenReaderLabel={hp('restoring')}
                  className="col-span-2 gap-1.5 min-h-[44px] motion-reduce:[&_svg]:animate-none"
                >
                  <RotateCcw aria-hidden="true" className="w-4 h-4" />
                  {t('restoreTo', { version: versionB.version })}
                </AuroraButton>
              )}
            </div>
          </div>
        </div>
      </ModalContent>
    </Modal>
  )
}
