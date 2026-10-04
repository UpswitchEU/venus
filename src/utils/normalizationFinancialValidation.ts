import type { NormalizationItem } from '../components/calculator/UnifiedNormalizationTypes'
import { ValidationError } from '../types/errors'
import { getNormalizationAmountForBase } from './normalizationMath'

/** Admission to a priced annual bridge; a corrupt amount is never a zero adjustment. */
export function validatedNormalizationAmount(item: NormalizationItem, reported: number): number {
  const field = `normalizations.${item.id}`
  if (!Number.isFinite(reported)) {
    throw new ValidationError(
      'Enter reported EBITDA before applying this normalization.',
      field,
      reported
    )
  }
  const input =
    item.type === 'add_percent' || item.type === 'subtract_percent' || item.type === 'absolute'
      ? item.value
      : item.adjustment
  if (!Number.isFinite(input)) {
    throw new ValidationError('Enter a valid normalization amount.', field, input)
  }
  const amount = getNormalizationAmountForBase(item, reported)
  if (!Number.isFinite(amount)) {
    throw new ValidationError('The normalization amount exceeds the supported range.', field, input)
  }
  return amount
}
