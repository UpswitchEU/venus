import { METHOD_COMPACT_LABEL_KEYS, METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { cn } from '@/design-system/utils'
import { dateLikeAgeMs } from '@/utils/date-like'
import { parseFinancialTransportNumber } from '@/utils/financialTransport'
import type { CalculatorNavProps } from './CalculatorNav.types'

export type CalculatorNavDisplaySummary = NonNullable<CalculatorNavProps['valuationSummary']>

export const formatTimeAgo = (
  date: Date,
  t: (key: string, values?: Record<string, number>) => string
) => {
  const diff = dateLikeAgeMs(date) ?? 0
  const minutes = Math.floor(diff / (1000 * 60))
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (diff < 1000 * 60) return t('common.time.justNow')
  if (diff < 1000 * 60 * 60) return t('common.time.minutesAgo', { count: minutes })
  if (diff < 1000 * 60 * 60 * 24) return t('common.time.hoursAgo', { count: hours })
  return t('common.time.daysAgo', { count: days })
}

export const formatPrice = (value: number | undefined, currency?: string | null) => {
  if (value == null || !Number.isFinite(value) || !currency || !/^[A-Z]{3}$/.test(currency))
    return '—'
  return new Intl.NumberFormat('en-BE', {
    style: 'currency',
    currency,
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(value)
}

function finiteNumber(value: unknown): number | null {
  return parseFinancialTransportNumber(value) ?? null
}

export function normalizeCalculatorNavDisplaySummary(
  summary: CalculatorNavDisplaySummary | null
): CalculatorNavDisplaySummary | null {
  if (!summary) return null
  const min = finiteNumber(summary.priceRange?.min)
  const max = finiteNumber(summary.priceRange?.max)
  const askPrice = finiteNumber(summary.askPrice)
  if (min == null || max == null || askPrice == null || min > max) return null
  return { ...summary, askPrice, priceRange: { min, max } }
}

export function confidenceDotClassName(confidence?: 'high' | 'medium' | 'low') {
  const base = 'w-1.5 h-1.5 rounded-full shrink-0'
  switch (confidence) {
    case 'high':
      return cn(base, 'bg-success')
    case 'medium':
      return cn(base, 'bg-warning')
    case 'low':
      return cn(base, 'bg-destructive')
    default:
      return cn(base, 'bg-foreground/40')
  }
}

type NavTranslator = (key: string) => string

export function resolvePdfDownloadTooltip(pdfPlanLocked: boolean, navLocale: string) {
  if (!pdfPlanLocked) return null
  return navLocale === 'nl'
    ? 'Read-only met watermerk — klik voor opties om de PDF zonder watermerk te ontgrendelen'
    : 'Read-only with watermark — click for options to unlock the watermark-free PDF'
}

export function resolveCalculatorNavMethodLabels({
  displayPreSelectedMethod,
  preSelectedMethods,
  t,
}: {
  displayPreSelectedMethod: string
  preSelectedMethods?: string[]
  t: NavTranslator
}) {
  const selectedMethodLabel = t(
    METHOD_LABEL_KEYS[displayPreSelectedMethod] ?? 'manualInput.methodSelector.adaptiveRecommended'
  )
  const compactLabelKey =
    METHOD_COMPACT_LABEL_KEYS[displayPreSelectedMethod] ??
    'manualInput.methodSelector.adaptiveRecommendedPill'
  const multiMethodCount = preSelectedMethods?.length ?? 0
  const isMultiMethod =
    multiMethodCount > 1 && !(preSelectedMethods ?? []).includes('upswitch_adaptive')

  return {
    selectedMethodLabel,
    compactMethodLabel: isMultiMethod
      ? `${multiMethodCount} ${t('manualInput.methodSelector.methods')}`
      : t(compactLabelKey),
  }
}
