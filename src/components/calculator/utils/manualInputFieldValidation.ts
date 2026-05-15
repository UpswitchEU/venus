import type { ManualValuationFormData } from '../../../types/valuation'

type ManualInputValidationTranslator = (
  key: string,
  values?: Record<string, string | number>
) => string

export interface ManualInputFieldValidation {
  errors: Record<string, string>
  hasErrors: boolean
  warnings: Record<string, string>
}

export function buildManualInputFieldValidation(
  formData: ManualValuationFormData,
  translate: ManualInputValidationTranslator,
  currentYear = new Date().getFullYear()
): ManualInputFieldValidation {
  const warnings: Record<string, string> = {}
  const errors: Record<string, string> = {}

  for (const yearFinancials of formData.yearlyFinancials) {
    if (Number.isFinite(yearFinancials.revenue) && yearFinancials.revenue > 1_000_000_000) {
      warnings[`revenue-${yearFinancials.year}`] = translate('validation.revenueOver1B')
    }
    if (
      formData.dcf_input_mode === 'fcff_only' &&
      yearFinancials.isForecast &&
      (typeof yearFinancials.free_cash_flow !== 'number' ||
        !Number.isFinite(yearFinancials.free_cash_flow))
    ) {
      errors[`fcff-${yearFinancials.year}`] = translate('validation.fcffRequired')
    }
    if (yearFinancials.ebitda !== 0) {
      if (yearFinancials.ebitda < -100_000_000) {
        errors[`ebitda-${yearFinancials.year}`] = translate('validation.ebitdaBelow100M')
      } else if (yearFinancials.ebitda > 500_000_000) {
        errors[`ebitda-${yearFinancials.year}`] = translate('validation.ebitdaAbove500M')
      }
      if (Number.isFinite(yearFinancials.revenue) && yearFinancials.revenue !== 0) {
        const margin = (yearFinancials.ebitda / yearFinancials.revenue) * 100
        if (margin < -50) {
          warnings[`margin-${yearFinancials.year}`] = translate('validation.marginLow', {
            margin: margin.toFixed(0),
          })
        } else if (margin > 80) {
          warnings[`margin-${yearFinancials.year}`] = translate('validation.marginHigh', {
            margin: margin.toFixed(0),
          })
        }
      }
    }
  }

  if (formData.ownerManagers < 0) errors.ownerManagers = translate('validation.minZero')

  if (formData.ownerManagers > 0 && formData.fteEmployees === undefined) {
    errors.fteEmployees = translate('validation.fteRequired')
  } else if (formData.fteEmployees !== undefined) {
    if (formData.fteEmployees < 0) errors.fteEmployees = translate('validation.minZero')
    else if (formData.fteEmployees > 10000) {
      warnings.fteEmployees = translate('validation.fteOver10k')
    }
  }

  if (
    formData.yearFounded &&
    (Number(formData.yearFounded) < 1800 || Number(formData.yearFounded) > currentYear)
  ) {
    errors.yearFounded = translate('validation.yearRange', { year: currentYear })
  }

  return { warnings, errors, hasErrors: Object.keys(errors).length > 0 }
}
