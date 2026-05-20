export type BusinessTypeCategoryLike =
  | string
  | {
      id?: unknown
      name?: unknown
      title?: unknown
    }
  | null
  | undefined

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

function isCategoryObject(
  value: unknown
): value is Exclude<BusinessTypeCategoryLike, string | null | undefined> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function formatBusinessTypeCategory(category: unknown, fallback = ''): string {
  if (typeof category === 'string') {
    return nonEmptyString(category) ?? fallback
  }

  if (isCategoryObject(category)) {
    return (
      nonEmptyString(category.name) ??
      nonEmptyString(category.title) ??
      nonEmptyString(category.id) ??
      fallback
    )
  }

  return fallback
}

export function businessTypeCategoryKey(
  category: BusinessTypeCategoryLike,
  fallback = 'Other'
): string {
  return formatBusinessTypeCategory(category, fallback)
}
