/**
 * Fiscal reference (4× EBITDA) — mirrors `omni_calc_coordinator` fiscal_4x branch.
 * Equity line uses (book equity + fiscal anchor) × ownership multiplier.
 * Multiplier is derived from `shares_for_sale` (0–100) like the comprehensive orchestrator
 * when Step 8 is not applied; manual flow normalizes shares to 100% → multiplier 1.
 */

import { ownershipMultiplierFromSharesForSale } from './ownershipMultiplier'

export const FISCAL_EBITDA_MULTIPLIER = 4

/** Matches how EBITDA is sourced in the preview — aligns with headline weighted normalized vs single-year reported. */
export type FiscalPreviewEbitdaSource =
  | 'weighted_normalized_historical'
  | 'reported_latest_complete_year'

export type Fiscal4xPreviewInputs = {
  countryCode: string
  ebitda: number | undefined
  /** Disclosure only — parity with annex / engine sustainable EBITDA semantics. */
  ebitdaSource?: FiscalPreviewEbitdaSource
  bookEquity: number | null
  /**
   * Percentage of equity stake being valued (0–100). Manual product defaults to 100.
   * If omitted, ownership multiplier defaults to 1 (full equity).
   */
  sharesForSale?: number | null
  /**
   * Override when you already computed the engine multiplier (e.g. future Step 8 parity).
   * When set, `sharesForSale` is ignored.
   */
  ownershipMultiplierOverride?: number | null
}

export type Fiscal4xUnavailableReason =
  | 'non_be'
  | 'non_statutory_ebitda'
  | 'non_positive_ebitda'
  | 'missing_ebitda'
  | 'missing_book_equity'

export type Fiscal4xPreviewMetrics = {
  available: boolean
  unavailableReason?: Fiscal4xUnavailableReason
  /** EBITDA input used for 4× (mirrors annex when weighted path is chosen upstream). */
  ebitdaForAnchor: number | null
  ebitdaSource: FiscalPreviewEbitdaSource | null
  fiscalAnchor: number | null
  impliedFiscalEquity: number | null
  bookEquityUsed: number | null
  /** Applied (book + anchor) × this, same semantics as omni `ownership_multiplier`. */
  ownershipMultiplierApplied: number | null
}

function normCountry(code: string): string {
  return code.trim().toUpperCase().slice(0, 2)
}

export function computeFiscal4xPreview(input: Fiscal4xPreviewInputs): Fiscal4xPreviewMetrics {
  const {
    countryCode,
    ebitda,
    ebitdaSource = 'reported_latest_complete_year',
    bookEquity,
    sharesForSale,
    ownershipMultiplierOverride,
  } = input

  const ownershipMultiplier =
    ownershipMultiplierOverride != null && Number.isFinite(ownershipMultiplierOverride)
      ? Math.max(0, ownershipMultiplierOverride)
      : ownershipMultiplierFromSharesForSale(sharesForSale)

  const baseNull: Omit<Fiscal4xPreviewMetrics, 'available'> = {
    ebitdaForAnchor: null,
    ebitdaSource: null,
    fiscalAnchor: null,
    impliedFiscalEquity: null,
    bookEquityUsed: null,
    ownershipMultiplierApplied: ownershipMultiplier,
  }

  if (normCountry(countryCode) !== 'BE') {
    return { available: false, unavailableReason: 'non_be', ...baseNull }
  }

  if (ebitdaSource === 'weighted_normalized_historical') {
    return {
      available: false,
      unavailableReason: 'non_statutory_ebitda',
      ...baseNull,
    }
  }

  if (ebitda == null || !Number.isFinite(ebitda)) {
    return { available: false, unavailableReason: 'missing_ebitda', ...baseNull }
  }

  if (ebitda <= 0) {
    return {
      available: false,
      unavailableReason: 'non_positive_ebitda',
      ebitdaForAnchor: ebitda,
      ebitdaSource,
      fiscalAnchor: null,
      impliedFiscalEquity: null,
      bookEquityUsed: null,
      ownershipMultiplierApplied: ownershipMultiplier,
    }
  }

  const fiscalAnchor = Math.round(ebitda * FISCAL_EBITDA_MULTIPLIER * 100) / 100

  if (bookEquity == null || !Number.isFinite(bookEquity)) {
    return {
      available: false,
      unavailableReason: 'missing_book_equity',
      ebitdaForAnchor: ebitda,
      ebitdaSource,
      fiscalAnchor,
      impliedFiscalEquity: null,
      bookEquityUsed: null,
      ownershipMultiplierApplied: ownershipMultiplier,
    }
  }

  const impliedFiscalEquity = Math.max((bookEquity + fiscalAnchor) * ownershipMultiplier, 0)

  return {
    available: true,
    ebitdaForAnchor: ebitda,
    ebitdaSource,
    fiscalAnchor,
    impliedFiscalEquity: Math.round(impliedFiscalEquity * 100) / 100,
    bookEquityUsed: bookEquity,
    ownershipMultiplierApplied: ownershipMultiplier,
  }
}
