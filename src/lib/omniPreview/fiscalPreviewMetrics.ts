/**
 * Fiscal reference (4× EBITDA) — mirrors `omni_calc_coordinator` fiscal_4x branch.
 * Equity line uses (book equity + fiscal anchor) × ownership multiplier.
 * Multiplier is derived from `shares_for_sale` (0–100) like the comprehensive orchestrator
 * when Step 8 is not applied; manual flow normalizes shares to 100% → multiplier 1.
 */

import { ownershipMultiplierFromSharesForSale } from './ownershipMultiplier'

export const FISCAL_EBITDA_MULTIPLIER = 4

export type Fiscal4xPreviewInputs = {
  countryCode: string
  ebitda: number | undefined
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
  | 'non_positive_ebitda'
  | 'missing_ebitda'
  | 'missing_book_equity'

export type Fiscal4xPreviewMetrics = {
  available: boolean
  unavailableReason?: Fiscal4xUnavailableReason
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
  const { countryCode, ebitda, bookEquity, sharesForSale, ownershipMultiplierOverride } = input

  const ownershipMultiplier =
    ownershipMultiplierOverride != null && Number.isFinite(ownershipMultiplierOverride)
      ? Math.max(0, ownershipMultiplierOverride)
      : ownershipMultiplierFromSharesForSale(sharesForSale)

  const baseNull: Omit<Fiscal4xPreviewMetrics, 'available'> = {
    fiscalAnchor: null,
    impliedFiscalEquity: null,
    bookEquityUsed: null,
    ownershipMultiplierApplied: ownershipMultiplier,
  }

  if (normCountry(countryCode) !== 'BE') {
    return { available: false, unavailableReason: 'non_be', ...baseNull }
  }

  if (ebitda == null || !Number.isFinite(ebitda)) {
    return { available: false, unavailableReason: 'missing_ebitda', ...baseNull }
  }

  if (ebitda <= 0) {
    return { available: false, unavailableReason: 'non_positive_ebitda', ...baseNull }
  }

  const fiscalAnchor = Math.round(ebitda * FISCAL_EBITDA_MULTIPLIER * 100) / 100

  if (bookEquity == null || !Number.isFinite(bookEquity)) {
    return {
      available: false,
      unavailableReason: 'missing_book_equity',
      fiscalAnchor,
      impliedFiscalEquity: null,
      bookEquityUsed: null,
      ownershipMultiplierApplied: ownershipMultiplier,
    }
  }

  const impliedFiscalEquity = Math.max(
    (bookEquity + fiscalAnchor) * ownershipMultiplier,
    0
  )

  return {
    available: true,
    fiscalAnchor,
    impliedFiscalEquity: Math.round(impliedFiscalEquity * 100) / 100,
    bookEquityUsed: bookEquity,
    ownershipMultiplierApplied: ownershipMultiplier,
  }
}
