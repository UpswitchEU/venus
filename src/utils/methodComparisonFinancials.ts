import type { ValuationMethodResult } from '@/types/valuation'
import { FinancialDecimal as Decimal } from './financialDecimal'
import { parseFinancialTransportNumber } from './financialTransport'

export function resolveMethodCurrency(
  method: ValuationMethodResult,
  reportCurrency?: string | null
): string | null {
  const raw = method.currency ?? method.details?.currency ?? reportCurrency
  if (typeof raw !== 'string') return null
  const currency = raw.trim().toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

export function resolveMethodValueBasis(
  method: ValuationMethodResult
): 'equity_value' | 'enterprise_value' | null {
  const basis = method.value_basis !== undefined ? method.value_basis : method.details?.value_basis
  // The legacy method-map contract defines its unqualified value as equity.
  if (basis === undefined) return 'equity_value'
  return basis === 'equity_value' || basis === 'enterprise_value' ? basis : null
}

export function methodComparisonDelta(
  method: ValuationMethodResult,
  baseline: ValuationMethodResult | null | undefined,
  reportCurrency?: string | null
): { amount: number; percent: number | null } | null {
  if (!method.available || method.plan_teaser || !baseline?.available || baseline.plan_teaser)
    return null
  const value = parseFinancialTransportNumber(method.value)
  const base = parseFinancialTransportNumber(baseline.value)
  const currency = resolveMethodCurrency(method, reportCurrency)
  const basis = resolveMethodValueBasis(method)
  if (
    value === undefined ||
    base === undefined ||
    currency === null ||
    basis === null ||
    currency !== resolveMethodCurrency(baseline, reportCurrency) ||
    basis !== resolveMethodValueBasis(baseline)
  )
    return null
  const difference = new Decimal(value).minus(base)
  const amount = difference.toNumber()
  const percent = base > 0 ? difference.div(base).times(100).toNumber() : null
  return Number.isFinite(amount)
    ? { amount, percent: percent !== null && Number.isFinite(percent) ? percent : null }
    : null
}

export function formatMethodAmount(amount: number, currency: string | null, locale = 'en'): string {
  return new Intl.NumberFormat(locale, {
    ...(currency ? { style: 'currency', currency } : {}),
    notation: 'compact',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(amount)
}
