'use client'

/**
 * CSV Mapping Preview Component
 *
 * Shows the mapping of uploaded CSV columns to internal categories.
 * Allows accountants to review and adjust mappings before import.
 *
 * Features:
 * - Search bar for filtering general ledger accounts
 * - Mobile-responsive table with horizontal scroll
 * - Touch-friendly category toggle
 */

import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  ChevronRight,
  Edit2,
  Minus,
  Search,
  TrendingDown,
  TrendingUp,
  X,
} from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'
import { Badge } from '@/design-system/components/Badge'
import { AuroraButton as Button } from '@/design-system/components/Button'
import { GlassCard } from '@/design-system/components/GlassCard'
import { AuroraInput as Input } from '@/design-system/components/Input'
import { Body, Caption, Heading, Mono } from '@/design-system/components/Typography'
import { cn } from '@/design-system/utils'
import type { ParsedCSVData } from './CSVUploadCard'

// ─────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────

export interface MappedAccount {
  id: string
  code: string
  description: string
  category: 'revenue' | 'expense' | 'asset' | 'liability' | 'equity'
  values: Record<string, number>
  confidence: 'high' | 'medium' | 'low'
  isEdited?: boolean
}

export interface CSVMappingPreviewProps {
  parsedData: ParsedCSVData
  onConfirm: (mappedAccounts: MappedAccount[]) => void
  onBack: () => void
  className?: string
}

// ─────────────────────────────────────────
// MAPPING LOGIC
// ─────────────────────────────────────────

const categoryPatterns: Record<MappedAccount['category'], RegExp[]> = {
  revenue: [/omzet/i, /verkoop/i, /opbrengst/i, /8\d{3}/],
  expense: [/kost/i, /loon/i, /huur/i, /afschrijv/i, /6\d{3}/],
  asset: [/activ/i, /voorraad/i, /debiteur/i, /0\d{3}/, /1\d{3}/, /2\d{3}/, /3\d{3}/],
  liability: [/passiv/i, /crediteur/i, /schuld/i, /4\d{3}/],
  equity: [/eigen vermogen/i, /kapitaal/i, /5\d{3}/],
}

const detectCategory = (
  code: string,
  description: string
): { category: MappedAccount['category']; confidence: MappedAccount['confidence'] } => {
  const combined = `${code} ${description}`.toLowerCase()

  for (const [category, patterns] of Object.entries(categoryPatterns)) {
    for (const pattern of patterns) {
      if (pattern.test(combined)) {
        return {
          category: category as MappedAccount['category'],
          confidence: pattern.source.startsWith('\\d') ? 'high' : 'medium',
        }
      }
    }
  }

  return { category: 'expense', confidence: 'low' }
}

const mapCSVToAccounts = (data: ParsedCSVData): MappedAccount[] => {
  const codeIndex = data.headers.findIndex((h) => /rekening|code|nummer/i.test(h))
  const descIndex = data.headers.findIndex((h) => /omschrijving|naam|description/i.test(h))

  const yearIndices = data.headers
    .map((h, i) => ({ header: h, index: i }))
    .filter(({ header }) => /^20\d{2}$/.test(header))

  return data.rows.map((row, i) => {
    const code = row[codeIndex] || row[0] || ''
    const description = row[descIndex] || row[1] || ''
    const { category, confidence } = detectCategory(code, description)

    const values: Record<string, number> = {}
    yearIndices.forEach(({ header, index }) => {
      const value = parseFloat(row[index]?.replace(/[^\d.-]/g, '') || '0')
      values[header] = isNaN(value) ? 0 : value
    })

    return {
      id: `account-${i}`,
      code,
      description,
      category,
      values,
      confidence,
    }
  })
}

// ─────────────────────────────────────────
// HELPER COMPONENTS
// ─────────────────────────────────────────

const CategoryBadge = ({ category }: { category: MappedAccount['category'] }) => {
  const t = useTranslations('csvUpload')
  const variants = {
    revenue: 'primary' as const,
    expense: 'accent' as const,
    asset: 'neutral' as const,
    liability: 'neutral' as const,
    equity: 'neutral' as const,
  }

  return (
    <Badge variant={variants[category]} size="sm">
      {t(`categories.${category}`)}
    </Badge>
  )
}

const ConfidenceDot = ({ confidence }: { confidence: MappedAccount['confidence'] }) => {
  const t = useTranslations('csvUpload')
  const colors = {
    high: 'bg-success',
    medium: 'bg-warning',
    low: 'bg-secondary',
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-2 h-2 rounded-full', colors[confidence])} />
      <Caption className="text-foreground/40">{t(`confidence.${confidence}`)}</Caption>
    </div>
  )
}

const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('nl-BE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// ─────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────

export function CSVMappingPreview({
  parsedData,
  onConfirm,
  onBack,
  className,
}: CSVMappingPreviewProps) {
  const t = useTranslations('normalizationHub')
  const locale = useLocale() as 'nl' | 'en'
  const currencyLocale = locale === 'en' ? 'en-BE' : 'nl-BE'
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat(currencyLocale, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  const [mappedAccounts, setMappedAccounts] = useState<MappedAccount[]>(() =>
    mapCSVToAccounts(parsedData)
  )
  const [searchQuery, setSearchQuery] = useState('')

  // Filter accounts based on search query (code or description)
  const filteredAccounts = useMemo(() => {
    if (!searchQuery.trim()) return mappedAccounts
    const query = searchQuery.toLowerCase()
    return mappedAccounts.filter(
      (account) =>
        account.code.toLowerCase().includes(query) ||
        account.description.toLowerCase().includes(query)
    )
  }, [mappedAccounts, searchQuery])

  // Summary stats (based on all accounts, not filtered)
  const revenueTotal = mappedAccounts
    .filter((a) => a.category === 'revenue')
    .reduce(
      (sum, a) =>
        sum + Object.values(a.values).reduce((s, v) => s + v, 0) / Object.keys(a.values).length,
      0
    )

  const expenseTotal = mappedAccounts
    .filter((a) => a.category === 'expense')
    .reduce(
      (sum, a) =>
        sum + Object.values(a.values).reduce((s, v) => s + v, 0) / Object.keys(a.values).length,
      0
    )

  const lowConfidenceCount = mappedAccounts.filter((a) => a.confidence === 'low').length

  const handleConfirm = () => {
    onConfirm(mappedAccounts)
  }

  const handleClearSearch = () => {
    setSearchQuery('')
  }

  const toggleCategory = (id: string) => {
    const categories: MappedAccount['category'][] = [
      'revenue',
      'expense',
      'asset',
      'liability',
      'equity',
    ]
    setMappedAccounts((prev) =>
      prev.map((a) => {
        if (a.id !== id) return a
        const currentIndex = categories.indexOf(a.category)
        const nextIndex = (currentIndex + 1) % categories.length
        return { ...a, category: categories[nextIndex], isEdited: true, confidence: 'high' }
      })
    )
  }

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <Heading level={2} className="text-xl mb-1">
              {t('reviewMapping')}
            </Heading>
            <Caption className="text-foreground/50">{t('reviewMappingDesc')}</Caption>
          </div>
          <Badge variant="primary" size="sm">
            {parsedData.detectedType === 'yuki'
              ? 'Yuki'
              : parsedData.detectedType === 'exact'
                ? 'Exact'
                : parsedData.detectedType === 'odoo'
                  ? 'Odoo'
                  : 'CSV'}{' '}
            {t('export')}
          </Badge>
        </div>

        {/* Summary Cards - Responsive grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <div className="p-3 md:p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.06]">
            <Caption className="text-foreground/40 mb-1 text-[10px] md:text-xs">
              {t('accounts')}
            </Caption>
            <Mono className="text-lg md:text-2xl font-bold">{mappedAccounts.length}</Mono>
          </div>
          <div className="p-3 md:p-4 rounded-xl bg-primary/5 border border-primary/20">
            <Caption className="text-foreground/40 mb-1 text-[10px] md:text-xs">
              {t('avgRevenue')}
            </Caption>
            <Mono className="text-lg md:text-2xl font-bold text-primary">
              {formatCurrency(revenueTotal)}
            </Mono>
          </div>
          <div className="p-3 md:p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.06]">
            <Caption className="text-foreground/40 mb-1 text-[10px] md:text-xs">
              {t('avgCosts')}
            </Caption>
            <Mono className="text-lg md:text-2xl font-bold">{formatCurrency(expenseTotal)}</Mono>
          </div>
          <div className="p-3 md:p-4 rounded-xl bg-foreground/[0.02] border border-foreground/[0.06]">
            <Caption className="text-foreground/40 mb-1 text-[10px] md:text-xs">
              {t('fiscalYears')}
            </Caption>
            <Mono className="text-lg md:text-2xl font-bold">{parsedData.fiscalYears.length}</Mono>
          </div>
        </div>

        {/* Low Confidence Warning */}
        {lowConfidenceCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-warning/10 border border-warning/20"
          >
            <AlertCircle className="w-4 h-4 text-warning shrink-0" />
            <Body size="sm" className="text-foreground/70">
              {t('lowConfidenceWarning', { count: lowConfidenceCount })}
            </Body>
          </motion.div>
        )}
      </GlassCard>

      {/* Mapping Table */}
      <GlassCard className="overflow-hidden">
        {/* Table Header with Search */}
        <div className="px-4 md:px-6 py-4 border-b border-foreground/[0.06]">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <Heading level={3} className="text-base">
              {t('ledgerMapping')}
            </Heading>

            {/* Search Bar - Cofounder requested feature */}
            <div className="w-full sm:w-72">
              <Input
                size="sm"
                placeholder={t('searchCodeOrDescription')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                leftIcon={<Search className="w-4 h-4" />}
                clearable
                onClear={handleClearSearch}
              />
            </div>
          </div>

          {/* Search results count */}
          {searchQuery && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-3 flex items-center gap-2"
            >
              <Caption className="text-foreground/50">
                {t('accountsCountOf', {
                  filtered: filteredAccounts.length,
                  total: mappedAccounts.length,
                })}
              </Caption>
              {filteredAccounts.length === 0 && (
                <button
                  onClick={handleClearSearch}
                  className="text-xs text-primary hover:underline"
                >
                  {t('clearFilter')}
                </button>
              )}
            </motion.div>
          )}
        </div>

        {/* Table with horizontal scroll on mobile */}
        <div className="overflow-x-auto scrollbar-hide">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="border-b border-foreground/[0.06]">
                <th className="px-4 md:px-6 py-3 text-left text-[10px] md:text-xs font-medium text-foreground/40 uppercase tracking-wider w-20 md:w-24">
                  {t('code')}
                </th>
                <th className="px-4 md:px-6 py-3 text-left text-[10px] md:text-xs font-medium text-foreground/40 uppercase tracking-wider">
                  {t('description')}
                </th>
                <th className="px-4 md:px-6 py-3 text-left text-[10px] md:text-xs font-medium text-foreground/40 uppercase tracking-wider w-28 md:w-32">
                  {t('category')}
                </th>
                <th className="px-4 md:px-6 py-3 text-left text-[10px] md:text-xs font-medium text-foreground/40 uppercase tracking-wider w-24 md:w-28 hidden sm:table-cell">
                  {t('confidence')}
                </th>
                {parsedData.fiscalYears.slice(0, 3).map((year) => (
                  <th
                    key={year}
                    className="px-4 md:px-6 py-3 text-right text-[10px] md:text-xs font-medium text-foreground/40 uppercase tracking-wider w-24 md:w-28"
                  >
                    {year}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/[0.04]">
              <AnimatePresence>
                {filteredAccounts.map((account) => (
                  <motion.tr
                    key={account.id}
                    layout
                    className={cn(
                      'hover:bg-foreground/[0.02] transition-colors',
                      account.isEdited && 'bg-primary/5'
                    )}
                  >
                    <td className="px-4 md:px-6 py-3">
                      <Mono size="sm" className="text-foreground/70">
                        {account.code}
                      </Mono>
                    </td>
                    <td className="px-4 md:px-6 py-3">
                      <Body
                        size="sm"
                        className="text-foreground/70 truncate max-w-[120px] md:max-w-xs"
                      >
                        {account.description}
                      </Body>
                    </td>
                    <td className="px-4 md:px-6 py-3">
                      {/* Touch-friendly category toggle */}
                      <button
                        onClick={() => toggleCategory(account.id)}
                        className="group flex items-center gap-1.5 min-h-[44px] min-w-[44px] -my-2"
                      >
                        <CategoryBadge category={account.category} />
                        <Edit2 className="w-3 h-3 text-foreground/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </td>
                    <td className="px-4 md:px-6 py-3 hidden sm:table-cell">
                      <ConfidenceDot confidence={account.confidence} />
                    </td>
                    {parsedData.fiscalYears.slice(0, 3).map((year) => (
                      <td key={year} className="px-4 md:px-6 py-3 text-right">
                        <Mono
                          size="sm"
                          className={cn(
                            'text-xs md:text-sm',
                            account.category === 'revenue' ? 'text-primary' : 'text-foreground/70'
                          )}
                        >
                          {formatCurrency(account.values[year] || 0)}
                        </Mono>
                      </td>
                    ))}
                  </motion.tr>
                ))}
              </AnimatePresence>

              {/* Empty search state */}
              {filteredAccounts.length === 0 && searchQuery && (
                <tr>
                  <td
                    colSpan={4 + parsedData.fiscalYears.slice(0, 3).length}
                    className="px-6 py-12 text-center"
                  >
                    <div className="text-foreground/40">
                      <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">{t('noAccountsForQuery', { query: searchQuery })}</p>
                      <button
                        onClick={handleClearSearch}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        {t('showAllAccounts')}
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* Actions - Mobile-friendly layout */}
      <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack} className="w-full sm:w-auto">
          ← {t('back')}
        </Button>
        <Button variant="primary" onClick={handleConfirm} className="w-full sm:w-auto">
          <Check className="w-4 h-4 mr-2" />
          {t('confirmMapping')}
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default CSVMappingPreview
