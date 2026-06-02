import { METHOD_COMPACT_LABEL_KEYS, METHOD_LABEL_KEYS } from '@/constants/methodLabels'
import { cn } from '@/design-system/utils'
import { dateLikeAgeMs } from '@/utils/date-like'

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

export const formatPrice = (value: number) => {
  if (!Number.isFinite(value)) {
    return '—'
  }
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  }
  return `€${Math.round(value / 1000)}K`
}

export function confidenceDotClassName(confidence: 'high' | 'medium' | 'low') {
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
