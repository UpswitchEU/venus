/**
 * Business Type Display Utilities
 *
 * Helper functions for displaying business type information (icons, titles, etc.)
 * Adapted from upswitch-frontend for valuation-tester
 */

import { BUSINESS_TYPES_FALLBACK } from '../config/businessTypes'
import type { BusinessType } from '../services/businessTypesApi'
import { businessTypesCache } from '../services/cache/businessTypesCache'

interface BusinessTypeInfo {
  icon: string
  title: string
  description?: string
}

type BusinessTypeLabelSource = {
  id?: string
  name?: string
  title?: string
}

/** Human-readable label across design-system (`name`) and API (`title`) business types. */
export function resolveBusinessTypeLabel(
  source: BusinessTypeLabelSource | null | undefined,
  fallback = 'Business'
): string {
  if (!source) return fallback
  const label = source.name ?? source.title ?? source.id
  return label && label.trim().length > 0 ? label : fallback
}

function findFallbackType(businessTypeId: string) {
  return BUSINESS_TYPES_FALLBACK.find((bt) => bt.value === businessTypeId)
}

function extractEmoji(label: string): string | undefined {
  return label.match(/^(\p{Emoji}+)/u)?.[1]
}

function stripLeadingEmoji(label: string): string {
  return label.replace(/^(\p{Emoji}+)\s*/u, '').trim() || label
}

function titleFromId(businessTypeId: string): string {
  return businessTypeId
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

function getCachedBusinessType(businessTypeId: string): BusinessType | null {
  return businessTypesCache.getBusinessTypeById(businessTypeId)
}

/**
 * Get business type icon from business type ID
 * Falls back to generic icon if type not found
 */
export function getBusinessTypeIcon(businessTypeId: string | undefined): string {
  if (!businessTypeId) {
    return '🏢' // Default generic business icon
  }

  // Try to find in fallback first (synchronous)
  const fallbackType = findFallbackType(businessTypeId)
  if (fallbackType) {
    // Extract emoji from label if icon not directly available
    const emoji = extractEmoji(fallbackType.label)
    if (emoji) {
      return emoji
    }
  }

  const cacheData = getCachedBusinessType(businessTypeId)
  if (cacheData?.icon) {
    return cacheData.icon
  }

  return '🏢' // Default fallback
}

/**
 * Get business type title from business type ID
 * Falls back to the ID itself if type not found
 */
export function getBusinessTypeTitle(businessTypeId: string | undefined): string {
  if (!businessTypeId) {
    return 'Business'
  }

  // Try to find in fallback first (synchronous)
  const fallbackType = findFallbackType(businessTypeId)
  if (fallbackType) {
    // Remove emoji from label for title
    return stripLeadingEmoji(fallbackType.label)
  }

  const cacheData = getCachedBusinessType(businessTypeId)
  if (cacheData?.title) {
    return cacheData.title
  }

  // Fallback: format the ID nicely
  return titleFromId(businessTypeId)
}

/**
 * Get business type description from business type ID
 */
export function getBusinessTypeDescription(businessTypeId: string | undefined): string | undefined {
  if (!businessTypeId) {
    return undefined
  }

  const cacheData = getCachedBusinessType(businessTypeId)
  if (cacheData?.description) {
    return cacheData.description
  }

  return undefined
}

/**
 * Get full business type info from business type ID
 */
export function getBusinessTypeInfo(businessTypeId: string | undefined): BusinessTypeInfo {
  if (!businessTypeId) {
    return {
      icon: '🏢',
      title: 'Business',
      description: undefined,
    }
  }

  // Try to find in fallback first
  const fallbackType = findFallbackType(businessTypeId)

  let icon = '🏢'
  let title = titleFromId(businessTypeId)

  if (fallbackType) {
    // Extract emoji from label
    const emoji = extractEmoji(fallbackType.label)
    if (emoji) {
      icon = emoji
    }
    // Remove emoji from label for title
    title = stripLeadingEmoji(fallbackType.label)
  }

  const cacheData = getCachedBusinessType(businessTypeId)
  if (cacheData) {
    return {
      icon: cacheData.icon || icon,
      title: cacheData.title || title,
      description: cacheData.description,
    }
  }

  return {
    icon,
    title,
    description: undefined,
  }
}
