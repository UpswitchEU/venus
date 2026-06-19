import type { BusinessType } from '../../../services/businessTypesApi'
import { generalLogger } from '../../../utils/logger'

const VARIATION_ALIASES: Record<string, string[]> = {
  saas: ['saas', 'software as a service', 'software service'],
  restaurant: ['restaurant', 'cafe', 'bistro', 'dining'],
  'e-commerce': ['e-commerce', 'ecommerce', 'online store', 'online shop'],
  manufacturing: ['manufacturing', 'manufacturer', 'production'],
  consulting: ['consulting', 'consultant', 'advisory'],
  'tech startup': ['tech startup', 'startup', 'tech company'],
}

export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined
  const errorRecord = error as Record<string, unknown>
  if (typeof errorRecord.status === 'number') return errorRecord.status
  const response = errorRecord.response
  if (!response || typeof response !== 'object') return undefined
  const responseStatus = (response as Record<string, unknown>).status
  return typeof responseStatus === 'number' ? responseStatus : undefined
}

export function matchBusinessType(
  query: string,
  businessTypes: readonly BusinessType[]
): string | null {
  if (!query || businessTypes.length === 0) return null

  const queryLower = query.toLowerCase().trim()

  const exactMatch = businessTypes.find((bt) => bt.title.toLowerCase() === queryLower)
  if (exactMatch) {
    generalLogger.info('Matched business type (exact)', {
      query,
      matched: exactMatch.title,
      id: exactMatch.id,
    })
    return exactMatch.id
  }

  const keywordMatch = businessTypes.find((bt) =>
    bt.keywords?.some((keyword) => {
      const keywordLower = keyword.toLowerCase()
      return (
        keywordLower === queryLower ||
        queryLower.includes(keywordLower) ||
        keywordLower.includes(queryLower)
      )
    })
  )
  if (keywordMatch) {
    generalLogger.info('Matched business type (keyword)', {
      query,
      matched: keywordMatch.title,
      id: keywordMatch.id,
    })
    return keywordMatch.id
  }

  const partialMatch = businessTypes.find((bt) => {
    const titleLower = bt.title.toLowerCase()
    return titleLower.includes(queryLower) || queryLower.includes(titleLower)
  })
  if (partialMatch) {
    generalLogger.info('Matched business type (partial)', {
      query,
      matched: partialMatch.title,
      id: partialMatch.id,
    })
    return partialMatch.id
  }

  for (const [key, variants] of Object.entries(VARIATION_ALIASES)) {
    if (!variants.some((variant) => queryLower.includes(variant))) continue

    const variationMatch = businessTypes.find(
      (bt) =>
        bt.title.toLowerCase().includes(key) ||
        bt.keywords?.some((keyword) => keyword.toLowerCase().includes(key))
    )
    if (variationMatch) {
      generalLogger.info('Matched business type (variation)', {
        query,
        matched: variationMatch.title,
        id: variationMatch.id,
      })
      return variationMatch.id
    }
  }

  generalLogger.warn('No business type match found', { query })
  return null
}
