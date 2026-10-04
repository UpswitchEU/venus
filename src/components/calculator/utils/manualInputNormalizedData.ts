import type { ManualValuationFormData, YearlyFinancials } from '../../../types/valuation'
import { FinancialDecimal as Decimal } from '../../../utils/financialDecimal'
import { normalizeImportedLedgerReviewStatuses } from '../../../utils/importedLedgerNormalization'
import { getNormalizationAmountForBase } from '../../../utils/normalizationMath'
import { getAnnualFictiveRentDeductionForDisplay } from '../../../utils/realEstateCarveOutDisplay'
import { isCompleteYearlyFinancial } from '../../../utils/yearlyFinancials'
import type { NormalizationItem } from '../UnifiedNormalizationModal'

export type ManualInputNormalizedYear = YearlyFinancials & {
  fictiveRentDeduction: number
  normalizationCount: number
  normalizedEbitda: number
  totalAdjustment: number
}

export interface ManualInputNormalizedData {
  annualFictiveRentDeduction: number
  averageNormalizedEbitda: number
  totalYearsWithData: number
  years: ManualInputNormalizedYear[]
}

export interface BuildManualInputNormalizedDataParams {
  estimatedMarketRent: ManualValuationFormData['estimated_market_rent']
  excludeRealEstate: ManualValuationFormData['exclude_real_estate']
  normalizationItems: NormalizationItem[]
  yearlyFinancials: YearlyFinancials[]
}

export function buildManualInputNormalizedData({
  estimatedMarketRent,
  excludeRealEstate,
  normalizationItems,
  yearlyFinancials,
}: BuildManualInputNormalizedDataParams): ManualInputNormalizedData {
  const reportedByYear = Object.fromEntries(
    yearlyFinancials.flatMap((year) =>
      typeof year.ebitda === 'number' && Number.isFinite(year.ebitda)
        ? [[Number(year.year), year.ebitda]]
        : []
    )
  )
  const acceptedItems = normalizeImportedLedgerReviewStatuses(
    normalizationItems,
    reportedByYear
  ).filter((n) => n.status === 'accepted')
  const annualFictiveRentDeduction = getAnnualFictiveRentDeductionForDisplay(
    excludeRealEstate,
    estimatedMarketRent
  )

  const years = yearlyFinancials.map((yf) => {
    const yearNum = Number(yf.year)
    const yearNorms = acceptedItems.filter((n) => {
      if (n.applyAllYears) return true
      if (n.applyYears && n.applyYears.length > 0) return n.applyYears.includes(yearNum)
      return n.year === yearNum
    })
    const rawEbitda = Number(yf.ebitda)
    const yearEbitda = Number.isFinite(rawEbitda) ? rawEbitda : 0
    const totalAdjustment = yearNorms
      .reduce((sum, n) => sum.plus(getNormalizationAmountForBase(n, yearEbitda)), new Decimal(0))
      .toNumber()
    const safeTotalAdj = Number.isFinite(totalAdjustment) ? totalAdjustment : 0
    const normalizedEbitda = new Decimal(yearEbitda)
      .plus(safeTotalAdj)
      .minus(annualFictiveRentDeduction)
      .toNumber()
    return {
      ...yf,
      normalizedEbitda,
      totalAdjustment: safeTotalAdj,
      normalizationCount: yearNorms.length,
      fictiveRentDeduction: annualFictiveRentDeduction,
    }
  })

  const validYears = years
    .filter(
      (y) => !y.isForecast && y.year != null && Number(y.year) >= 2000 && Number(y.year) <= 2100
    )
    .sort((a, b) => Number(a.year) - Number(b.year))
  const completeHistoricalYears = validYears.filter((y) => isCompleteYearlyFinancial(y))
  let weightedSum = new Decimal(0)
  let totalWeight = 0
  completeHistoricalYears.forEach((y, index) => {
    const weight = index + 1
    const norm = Number.isFinite(y.normalizedEbitda) ? y.normalizedEbitda : 0
    weightedSum = weightedSum.plus(new Decimal(norm).mul(weight))
    totalWeight += weight
  })

  return {
    years,
    averageNormalizedEbitda: totalWeight > 0 ? weightedSum.div(totalWeight).toNumber() : 0,
    totalYearsWithData: completeHistoricalYears.length,
    annualFictiveRentDeduction,
  }
}
