'use client'

import { useLocale } from 'next-intl'
import { useMemo } from 'react'
import { createManualPreviewFormatters, getBelgianNumberLocale } from './manualPreviewFormatters'

/**
 * Stable `Intl.NumberFormat` instances for manual derived-metric cards (SaaS, SDE, revenue, NAV, fiscal).
 * Use this instead of duplicating `en-BE` / `nl-BE` + fraction rules in components.
 */
export function useManualPreviewFormatters() {
  const locale = useLocale()
  return useMemo(() => createManualPreviewFormatters(getBelgianNumberLocale(locale)), [locale])
}
