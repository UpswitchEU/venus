'use client'

import { useTranslations } from 'next-intl'
import { useCallback, useMemo } from 'react'
import {
  applyGrootboekCountryOverrides,
  DEFAULT_LEDGER_ACCOUNTS,
  type LedgerAccount,
} from '../../constants/grootboek'
import { fuzzyMatch, PRESET_CONFIGS } from './UnifiedNormalizationHelpers'
import type {
  NormalizationPresetOption,
  SearchableLedgerAccount,
} from './UnifiedNormalizationTypes'

export function useUnifiedNormalizationLedgerOptions({
  ledgerAccounts,
  countryCode,
  searchQuery,
}: {
  ledgerAccounts: LedgerAccount[]
  countryCode?: string | null
  searchQuery: string
}) {
  const nh = useTranslations('normalizationHub')
  type NormalizationHubTranslationKey = Parameters<typeof nh>[0]

  const availableLedgers = useMemo(() => {
    const base = ledgerAccounts.length > 0 ? ledgerAccounts : DEFAULT_LEDGER_ACCOUNTS
    return applyGrootboekCountryOverrides(base, countryCode)
  }, [ledgerAccounts, countryCode])

  const normalizationPresets = useMemo<NormalizationPresetOption[]>(
    () =>
      PRESET_CONFIGS.map((config) => {
        const refAccount = availableLedgers.find((ledger) => ledger.code === config.ledgerCode)
        return {
          id: config.id,
          label: nh(config.labelKey as NormalizationHubTranslationKey),
          ledgerCode: config.ledgerCode,
          ledgerName:
            refAccount?.name ?? nh(config.ledgerNameKey as NormalizationHubTranslationKey),
          category: config.category,
          defaultType: config.defaultType,
          defaultValue: config.defaultValue,
          description: nh(config.descriptionKey as NormalizationHubTranslationKey),
          marketBenchmark: config.marketBenchmark,
        }
      }),
    [nh, availableLedgers]
  )

  const filteredLedgers = useMemo<SearchableLedgerAccount[]>(() => {
    const query = searchQuery.trim()
    if (!query) return availableLedgers.slice(0, 12)

    const results = availableLedgers
      .map((account) => {
        const codeMatch = fuzzyMatch(String(account.code ?? ''), query)
        const nameMatch = fuzzyMatch(String(account.name ?? ''), query)
        const categoryMatch = account.category
          ? fuzzyMatch(String(account.category ?? ''), query)
          : { matches: false, score: -1, indices: [] }
        const bestMatch = [codeMatch, nameMatch, categoryMatch].reduce((best, current) =>
          current.score > best.score ? current : best
        )

        return {
          account,
          matches: codeMatch.matches || nameMatch.matches || categoryMatch.matches,
          score: bestMatch.score,
          codeIndices: codeMatch.matches ? codeMatch.indices : [],
          nameIndices: nameMatch.matches ? nameMatch.indices : [],
        }
      })
      .filter((result) => result.matches)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)

    return results.map<SearchableLedgerAccount>((result) => ({
      ...result.account,
      _codeIndices: result.codeIndices,
      _nameIndices: result.nameIndices,
    }))
  }, [searchQuery, availableLedgers])

  const getLedgerDisplayName = useCallback(
    (ledgerCode?: string, ledgerName?: string) => {
      const fallbackName = ledgerName || ledgerCode || ''
      const [resolved] = applyGrootboekCountryOverrides(
        [{ code: ledgerCode || '', name: fallbackName }],
        countryCode
      )
      return resolved?.name || fallbackName
    },
    [countryCode]
  )

  return { availableLedgers, normalizationPresets, filteredLedgers, getLedgerDisplayName }
}
