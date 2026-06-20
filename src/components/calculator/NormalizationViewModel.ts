import { useLocale, useTranslations } from 'next-intl'
import React from 'react'
import { getNormalizationAmountForBase, getReportedEbitdaBaseline } from '@/utils/normalizationMath'
import type { NormalizationItem, NormalizationSource } from './UnifiedNormalizationTypes'

export interface NormalizationViewProps {
  items: NormalizationItem[]
  years: number[]
  originalEBITDA: number
  /** Per-year reported EBITDA for accurate multi-year display */
  originalEBITDAByYear?: Record<number, number>
  onAccept: (id: string) => void
  onReject: (id: string) => void
  onRemove: (id: string) => void
  onRestore: (id: string) => void
  onEdit: (item: NormalizationItem) => void
}

const categoryIcons: Record<string, string> = {
  salary: '👤',
  rent: '🏢',
  vehicle: '🚗',
  'one-time': '⚡',
  personal: '🏠',
  depreciation: '📉',
  other: '📋',
}

const sourceColors: Record<NormalizationSource, string> = {
  manual: 'bg-foreground/10 text-foreground/70',
  yuki: 'bg-accent/10 text-accent',
  exact: 'bg-info/10 text-info',
  silverfin: 'bg-indigo-500/10 text-indigo-600',
  bizzcontrol: 'bg-cyan-500/10 text-cyan-600',
  odoo: 'bg-purple-500/10 text-purple-600',
  octopus: 'bg-blue-500/10 text-blue-600',
  expertm: 'bg-violet-500/10 text-violet-600',
  accountable: 'bg-emerald-500/10 text-emerald-600',
  csv: 'bg-warning/10 text-warning',
  ai: 'bg-primary/10 text-primary',
  auto: 'bg-success/10 text-success',
}

type CategoryLabel = {
  label: string
  icon: string
  group: 'omzet' | 'kosten'
}

type SourceConfig = {
  label: string
  color: string
}

/**
 * Recalculate adjustment for a normalization item in the context of a specific year.
 * Percentage and absolute types must use the year-specific EBITDA, not the stored amount.
 */
export function adjustmentForYear(
  item: NormalizationItem,
  year: number,
  originalEBITDA: number,
  originalEBITDAByYear?: Record<number, number>
): number {
  const yearEbitda = getReportedEbitdaBaseline({
    year,
    originalEBITDAByYear,
    fallbackCandidates: [originalEBITDA],
  })

  return getNormalizationAmountForBase(item, yearEbitda)
}

export function useNormalizationCurrencyFormatter() {
  const locale = useLocale()

  return React.useCallback(
    (value: number) => {
      const safe = Number.isFinite(value) ? value : 0
      return new Intl.NumberFormat(
        locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE',
        {
          style: 'currency',
          currency: 'EUR',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }
      ).format(safe)
    },
    [locale]
  )
}

export function useNormalizationCategoryLabels() {
  const t = useTranslations('normalizationHub')

  return React.useMemo(
    () =>
      ({
        salary: {
          label: t('categories.salary'),
          icon: categoryIcons.salary,
          group: 'kosten' as const,
        },
        rent: { label: t('categories.rent'), icon: categoryIcons.rent, group: 'kosten' as const },
        vehicle: {
          label: t('categories.vehicle'),
          icon: categoryIcons.vehicle,
          group: 'kosten' as const,
        },
        'one-time': {
          label: t('categories.oneTime'),
          icon: categoryIcons['one-time'],
          group: 'kosten' as const,
        },
        personal: {
          label: t('categories.personal'),
          icon: categoryIcons.personal,
          group: 'kosten' as const,
        },
        depreciation: {
          label: t('categories.depreciation'),
          icon: categoryIcons.depreciation,
          group: 'kosten' as const,
        },
        other: {
          label: t('categories.other'),
          icon: categoryIcons.other,
          group: 'kosten' as const,
        },
      }) as Record<string, CategoryLabel>,
    [t]
  )
}

export function useNormalizationSourceConfig() {
  const t = useTranslations('normalizationHub')

  return React.useMemo(
    () =>
      ({
        manual: { label: t('sources.manual'), color: sourceColors.manual },
        yuki: { label: t('sources.yuki'), color: sourceColors.yuki },
        exact: { label: t('sources.exact'), color: sourceColors.exact },
        silverfin: { label: t('sources.silverfin'), color: sourceColors.silverfin },
        bizzcontrol: { label: t('sources.bizzcontrol'), color: sourceColors.bizzcontrol },
        odoo: { label: t('sources.odoo'), color: sourceColors.odoo },
        octopus: { label: t('sources.octopus'), color: sourceColors.octopus },
        expertm: { label: t('sources.expertm'), color: sourceColors.expertm },
        accountable: { label: t('sources.accountable'), color: sourceColors.accountable },
        csv: { label: t('sources.csv'), color: sourceColors.csv },
        ai: { label: t('sources.ai'), color: sourceColors.ai },
        auto: { label: t('sources.auto'), color: sourceColors.auto },
      }) as Record<NormalizationSource, SourceConfig>,
    [t]
  )
}
