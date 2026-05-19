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

export const valuationNavAmountClass = 'text-sm font-semibold text-foreground tracking-tight'

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
