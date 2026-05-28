import type { ValuationResponse } from '@/types/valuation'

function asStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return items.length > 0 ? items : undefined
}

function validationWarningMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item
      if (item && typeof item === 'object' && typeof (item as { message?: string }).message === 'string') {
        return (item as { message: string }).message
      }
      return null
    })
    .filter((message): message is string => !!message && message.length > 0)
}

/** Titan nests ValuationIQ fields under `details`; prefer top-level when present. */
export function resolveAcademicValidationIssues(
  result:
    | Pick<ValuationResponse, 'academic_validation_issues' | 'details' | 'validation_warnings'>
    | null
    | undefined,
): string[] | undefined {
  if (!result) return undefined

  const academic =
    asStringList(result.academic_validation_issues) ??
    asStringList(result.details?.academic_validation_issues)
  if (academic?.length) return academic

  const fromWarnings = [
    ...validationWarningMessages(result.validation_warnings),
    ...validationWarningMessages(result.details?.validation_warnings),
  ].filter((item, index, list) => list.indexOf(item) === index)

  return fromWarnings.length > 0 ? fromWarnings : undefined
}

/** Hoist nested academic issues so UI + session restore see a stable shape. */
export function normalizeValuationResultEnvelope<T extends ValuationResponse>(result: T): T {
  const issues = resolveAcademicValidationIssues(result)
  if (!issues) return result

  const details =
    result.details && typeof result.details === 'object' && !Array.isArray(result.details)
      ? { ...(result.details as Record<string, unknown>) }
      : {}

  return {
    ...result,
    academic_validation_issues: issues,
    details: {
      ...details,
      academic_validation_issues: issues,
    },
  }
}
