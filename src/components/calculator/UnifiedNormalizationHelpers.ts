import { createRandomToken } from '../../utils/secureRandom'
import type { NormalizationItem, NormalizationType } from './UnifiedNormalizationTypes'

// Fuzzy search helper - matches characters in order but not necessarily adjacent
export const fuzzyMatch = (
  text: string,
  query: string
): { matches: boolean; score: number; indices: number[] } => {
  const textLower = text.toLowerCase()
  const queryLower = query.toLowerCase().trim()

  if (!queryLower) return { matches: true, score: 0, indices: [] }

  // Exact match gets highest score
  if (textLower.includes(queryLower)) {
    const startIndex = textLower.indexOf(queryLower)
    return {
      matches: true,
      score: 100 - startIndex,
      indices: Array.from({ length: queryLower.length }, (_, i) => startIndex + i),
    }
  }

  // Fuzzy match: characters must appear in order
  let queryIndex = 0
  const indices: number[] = []

  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      indices.push(i)
      queryIndex++
    }
  }

  if (queryIndex === queryLower.length) {
    // Score based on how compact the match is (closer characters = higher score)
    const spread = indices[indices.length - 1] - indices[0]
    const score = 50 - spread + (indices[0] === 0 ? 20 : 0)
    return { matches: true, score, indices }
  }

  return { matches: false, score: -1, indices: [] }
}

/** Parse search query into custom ledger code and name. Supports "760 · Name" or plain "760" / "760123" */
export function parseCustomLedgerFromQuery(query: string): { code: string; name: string } {
  const trimmed = query.trim()
  const sep = trimmed.indexOf(' · ')
  if (sep >= 0) {
    const code = trimmed.slice(0, sep).trim()
    const name = trimmed.slice(sep + 3).trim()
    return { code: code || trimmed, name: name || code || trimmed }
  }
  // Extract leading digits as code if present
  const digitMatch = trimmed.match(/^(\d[\d.]*)/)
  const code = digitMatch ? digitMatch[1] : trimmed
  const name = trimmed
  return { code, name }
}

// Preset definitions with translation keys (resolved in component)
export const PRESET_CONFIGS: Array<{
  id: string
  labelKey: string
  ledgerCode: string
  ledgerNameKey: string
  category: NormalizationItem['category']
  defaultType: NormalizationType
  defaultValue: number
  descriptionKey: string
  marketBenchmark?: string
}> = [
  {
    id: 'owner-salary',
    labelKey: 'presetLabels.ownerSalary',
    ledgerCode: '620',
    ledgerNameKey: 'presetLedgerNames.directorCompensation',
    category: 'salary',
    defaultType: 'add',
    defaultValue: 60000,
    descriptionKey: 'presetDescriptions.ownerSalary',
    marketBenchmark: '€55K - €75K',
  },
  {
    id: 'family-salary',
    labelKey: 'presetLabels.familySalary',
    ledgerCode: '620',
    ledgerNameKey: 'presetLedgerNames.familyCompensation',
    category: 'salary',
    defaultType: 'add',
    defaultValue: 35000,
    descriptionKey: 'presetDescriptions.familySalary',
    marketBenchmark: '€25K - €40K',
  },
  {
    id: 'rent-office',
    labelKey: 'presetLabels.rent',
    ledgerCode: '610',
    ledgerNameKey: 'presetLedgerNames.rent',
    category: 'rent',
    defaultType: 'add',
    defaultValue: 24000,
    descriptionKey: 'presetDescriptions.rent',
    marketBenchmark: '€150 - €250/m²',
  },
  {
    id: 'vehicle-costs',
    labelKey: 'presetLabels.vehicle',
    ledgerCode: '614',
    ledgerNameKey: 'presetLedgerNames.vehicle',
    category: 'vehicle',
    defaultType: 'add',
    defaultValue: 18000,
    descriptionKey: 'presetDescriptions.vehicle',
    marketBenchmark: '€12K - €24K/jaar',
  },
  {
    id: 'one-time-legal',
    labelKey: 'presetLabels.oneTimeLegal',
    ledgerCode: '647',
    ledgerNameKey: 'presetLedgerNames.oneTime',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 25000,
    descriptionKey: 'presetDescriptions.oneTimeLegal',
  },
  {
    id: 'one-time-advisory',
    labelKey: 'presetLabels.oneTimeAdvisory',
    ledgerCode: '613',
    ledgerNameKey: 'presetLedgerNames.fees',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 15000,
    descriptionKey: 'presetDescriptions.oneTimeAdvisory',
  },
  {
    id: 'restructuring',
    labelKey: 'presetLabels.restructuring',
    ledgerCode: '644',
    ledgerNameKey: 'presetLedgerNames.restructuring',
    category: 'one-time',
    defaultType: 'add',
    defaultValue: 50000,
    descriptionKey: 'presetDescriptions.restructuring',
  },
  {
    id: 'depreciation',
    labelKey: 'presetLabels.depreciation',
    ledgerCode: '632',
    ledgerNameKey: 'presetLedgerNames.depreciation',
    category: 'depreciation',
    defaultType: 'add',
    defaultValue: 20000,
    descriptionKey: 'presetDescriptions.depreciation',
  },
  {
    id: 'personal-expenses',
    labelKey: 'presetLabels.personalExpenses',
    ledgerCode: '649',
    ledgerNameKey: 'presetLedgerNames.personal',
    category: 'personal',
    defaultType: 'add',
    defaultValue: 12000,
    descriptionKey: 'presetDescriptions.personalExpenses',
  },
  {
    id: 'asset-sale',
    labelKey: 'presetLabels.assetSale',
    ledgerCode: '741',
    ledgerNameKey: 'presetLedgerNames.assetGains',
    category: 'one-time',
    defaultType: 'subtract',
    defaultValue: 30000,
    descriptionKey: 'presetDescriptions.assetSale',
  },
]

export const generateId = () => createRandomToken(9)

/** Infer normalization category from Belgian MAR grootboek code range */
export function inferCategoryFromCode(code: string): NormalizationItem['category'] {
  const num = parseInt(code, 10)
  if (!Number.isFinite(num)) return 'other'
  if (num >= 620 && num <= 629) return 'salary'
  if (num === 610) return 'rent'
  if (num === 614) return 'vehicle'
  if (num >= 630 && num <= 636) return 'depreciation'
  if (num === 649) return 'personal'
  if (num >= 640 && num <= 648) return 'one-time'
  if (num === 660) return 'depreciation'
  return 'other'
}
