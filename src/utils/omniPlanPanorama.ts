import { PRIMARY_OMNI_METHOD_ORDER } from '@/constants/omniCalcMethods'
import type { ValuationMethodResult } from '@/types/valuation'

export interface MergePlanGatedOmniOptions {
  hideFiscalForNl: boolean
  getLabel: (methodKey: string) => string
}

/**
 * When the accountant plan restricts methods, show every primary omni row:
 * allowed methods keep engine data; locked methods are stripped (no numbers) and marked `plan_teaser`.
 * Missing locked primaries get placeholder rows so the panorama matches Starter/Pro breadth.
 */
export function mergePlanGatedOmniPanoramaResults(
  base: Record<string, ValuationMethodResult>,
  planAllowedMethodKeys: string[] | null,
  options: MergePlanGatedOmniOptions
): Record<string, ValuationMethodResult> {
  if (planAllowedMethodKeys == null) {
    return { ...base }
  }

  const allowed = new Set(planAllowedMethodKeys)
  const isAllowed = (k: string) => allowed.has(k)

  const out: Record<string, ValuationMethodResult> = {}

  for (const [key, method] of Object.entries(base)) {
    if (isAllowed(key)) {
      out[key] = method
    } else {
      out[key] = {
        ...method,
        value: null,
        multiple_used: null,
        wacc: null,
        available: false,
        plan_teaser: true,
        unavailable_reason: null,
        details: null,
      }
    }
  }

  const primaryKeys = PRIMARY_OMNI_METHOD_ORDER.filter((k) =>
    options.hideFiscalForNl ? k !== 'fiscal_4x' : true
  )

  for (const key of primaryKeys) {
    if (isAllowed(key)) continue
    if (out[key]) continue
    out[key] = {
      value: null,
      label: options.getLabel(key),
      available: false,
      plan_teaser: true,
      unavailable_reason: null,
    }
  }

  return out
}
