export function deepEqual(objA: unknown, objB: unknown): boolean {
  if (Object.is(objA, objB)) {
    return true
  }

  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false
  }

  const recordA = objA as Record<string, unknown>
  const recordB = objB as Record<string, unknown>
  const keysA = Object.keys(recordA)
  const keysB = Object.keys(recordB)

  if (keysA.length !== keysB.length) {
    return false
  }

  for (const key of keysA) {
    if (!(key in recordB) || !deepEqual(recordA[key], recordB[key])) {
      return false
    }
  }

  return true
}
