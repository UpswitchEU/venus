/**
 * useBusinessTypeMatching Hook
 *
 * Single Responsibility: Business type matching logic
 * Extracted from ValuationForm to follow SRP
 *
 * @module hooks/useBusinessTypeMatching
 */

import { useCallback } from 'react'
import type { BusinessTypeOption } from '../config/businessTypes'
import { generalLogger } from '../utils/logger'

/**
 * Hook for matching business type queries to business type options
 *
 * Handles exact matches, category matches, partial matches, and common variations
 */
export const useBusinessTypeMatching = () => {
  const matchBusinessType = useCallback(
    (query: string, businessTypes: BusinessTypeOption[]): string | null => {
      if (!query || !businessTypes || businessTypes.length === 0) return null

      const queryLower = query.toLowerCase().trim()

      // 1. Exact match on label (case-insensitive)
      const exactMatch = businessTypes.find((bt) => bt.label.toLowerCase() === queryLower)
      if (exactMatch) {
        generalLogger.info('Matched business type (exact)', {
          query,
          matched: exactMatch.label,
          value: exactMatch.value,
        })
        return exactMatch.value
      }

      // 2. Match on category (category may be string or object from API)
      const safeCatLower = (bt: { category?: unknown }) => {
        const raw =
          typeof bt.category === 'string'
            ? bt.category
            : ((bt.category as Record<string, unknown>)?.name ??
              (bt.category as Record<string, unknown>)?.title ??
              '')
        return String(raw).toLowerCase()
      }
      const categoryMatch = businessTypes.find((bt) => {
        const catLower = safeCatLower(bt)
        return catLower && (catLower.includes(queryLower) || queryLower.includes(catLower))
      })
      if (categoryMatch) {
        generalLogger.info('Matched business type (category)', {
          query,
          matched: categoryMatch.label,
          value: categoryMatch.value,
        })
        return categoryMatch.value
      }

      // 3. Partial match on label (contains)
      const partialMatch = businessTypes.find(
        (bt) =>
          bt.label.toLowerCase().includes(queryLower) || queryLower.includes(bt.label.toLowerCase())
      )
      if (partialMatch) {
        generalLogger.info('Matched business type (partial)', {
          query,
          matched: partialMatch.label,
          value: partialMatch.value,
        })
        return partialMatch.value
      }

      // 4. Common variations mapping
      const variations: Record<string, string[]> = {
        saas: ['saas', 'software as a service', 'software service'],
        restaurant: ['restaurant', 'cafe', 'bistro', 'dining'],
        'e-commerce': ['e-commerce', 'ecommerce', 'online store', 'online shop'],
        manufacturing: ['manufacturing', 'manufacturer', 'production'],
        consulting: ['consulting', 'consultant', 'advisory'],
        'tech startup': ['tech startup', 'startup', 'tech company'],
      }

      for (const [key, variants] of Object.entries(variations)) {
        if (variants.some((v) => queryLower.includes(v))) {
          const variationMatch = businessTypes.find(
            (bt) => bt.label.toLowerCase().includes(key) || bt.value.toLowerCase().includes(key)
          )
          if (variationMatch) {
            generalLogger.info('Matched business type (variation)', {
              query,
              matched: variationMatch.label,
              value: variationMatch.value,
            })
            return variationMatch.value
          }
        }
      }

      generalLogger.warn('No business type match found', { query })
      return null
    },
    []
  )

  return { matchBusinessType }
}
