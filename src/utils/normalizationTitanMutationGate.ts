/**
 * Serialize all Venus → Titan normalization mutations (POST save / DELETE) for one
 * session/report id so they never overlap in-flight. Matches Titan's per-session advisory
 * lock and avoids starving the DB pool when multiple years delete/save concurrently.
 */

const tailByReportOrSessionKey = new Map<string, Promise<unknown>>()

/**
 * Runs `fn` when all prior normalization mutations for this id have settled.
 */
export async function runTitanNormalizationMutationExclusive<T>(
  reportOrSessionId: string | undefined | null,
  fn: () => Promise<T>
): Promise<T> {
  const key = typeof reportOrSessionId === 'string' ? reportOrSessionId.trim() : ''
  if (!key) {
    return fn()
  }

  const prev = tailByReportOrSessionKey.get(key) ?? Promise.resolve()
  const result = prev.then(() => fn())
  const tail = result.then(
    () => undefined,
    () => undefined
  )
  tail.finally(() => {
    if (tailByReportOrSessionKey.get(key) === tail) {
      tailByReportOrSessionKey.delete(key)
    }
  })
  tailByReportOrSessionKey.set(key, tail)
  return result
}
