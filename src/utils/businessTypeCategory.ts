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

export function businessTypeCategoryStrings(category: unknown, fallback = ''): string[] {
  const values: string[] = []
  const push = (value: unknown) => {
    const stringValue = nonEmptyString(value)
    if (stringValue && !values.includes(stringValue)) values.push(stringValue)
  }

  if (typeof category === 'string') {
    push(category)
  } else if (isCategoryObject(category)) {
    push(category.name)
    push(category.title)
    push(category.id)
  }

  push(fallback)
  return values
}

export function formatBusinessTypeCategory(category: unknown, fallback = ''): string {
  return businessTypeCategoryStrings(category, fallback)[0] ?? fallback
}

export function businessTypeCategoryKey(
  category: BusinessTypeCategoryLike,
  fallback = 'Other'
): string {
  return formatBusinessTypeCategory(category, fallback)
}
