/**
 * Pure Intl helpers for manual calculator preview cards (SSR-safe — no `window`).
 */

import type { BelgianLocaleTag } from './previewConstants'
import { PREVIEW_DECIMALS } from './previewConstants'

/** Maps next-intl locale (`en`, `nl`, …) to Belgian number formatting. */
export function getBelgianNumberLocale(locale: string): BelgianLocaleTag {
  return locale === 'fr' ? 'fr-BE' : locale === 'en' ? 'en-BE' : 'nl-BE'
}

export function createManualMetricFormatter(
  localeTag: BelgianLocaleTag,
  maximumFractionDigits: number,
  minimumFractionDigits = 0
): Intl.NumberFormat {
  return new Intl.NumberFormat(localeTag, {
    maximumFractionDigits,
    minimumFractionDigits,
  })
}

export function createManualCurrencyFormatter(localeTag: BelgianLocaleTag): Intl.NumberFormat {
  return new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: PREVIEW_DECIMALS.currency,
    maximumFractionDigits: PREVIEW_DECIMALS.currency,
  })
}

/**
 * EUR with `notation: 'compact'` when |value| ≥ 1e6 — same rules as DCF sensitivity matrix EV cells.
 */
export function formatEurCompactBelgian(localeTag: BelgianLocaleTag, value: number): string {
  return new Intl.NumberFormat(localeTag, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: PREVIEW_DECIMALS.currency,
    maximumFractionDigits: PREVIEW_DECIMALS.currency,
    notation: Math.abs(value) >= 1_000_000 ? 'compact' : 'standard',
  }).format(value)
}

/** Pre-built metric formatters for each preview band (reuse across components). */
export function createManualPreviewFormatters(localeTag: BelgianLocaleTag) {
  return {
    localeTag,
    saasMetric: createManualMetricFormatter(localeTag, PREVIEW_DECIMALS.saasMetric),
    sdeMultiple: createManualMetricFormatter(localeTag, PREVIEW_DECIMALS.sdeMultiple),
    ratio: createManualMetricFormatter(localeTag, PREVIEW_DECIMALS.ratio),
    currency: createManualCurrencyFormatter(localeTag),
    formatEurCompact: (value: number) => formatEurCompactBelgian(localeTag, value),
  }
}

export type ManualPreviewFormatters = ReturnType<typeof createManualPreviewFormatters>
