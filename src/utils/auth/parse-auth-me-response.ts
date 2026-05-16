export type AuthMeUserPayload = Record<string, unknown> & { id: string }

export function pickRawUserPayload(
  result: Record<string, unknown>
): Record<string, unknown> | null {
  const data = result.data
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    const dataRecord = data as Record<string, unknown>
    if (
      dataRecord.user &&
      typeof dataRecord.user === 'object' &&
      !Array.isArray(dataRecord.user)
    ) {
      return dataRecord.user as Record<string, unknown>
    }
    if (dataRecord.id != null || dataRecord.sub != null) return dataRecord
  }

  const user = result.user
  if (user && typeof user === 'object' && !Array.isArray(user)) {
    return user as Record<string, unknown>
  }

  if (result.id != null || result.sub != null) return result
  return null
}

export function coerceUserId(user: Record<string, unknown>): string | null {
  const raw = user.id ?? user.sub
  if (typeof raw === 'string' && raw.length > 0) return raw
  if (typeof raw === 'number' && Number.isFinite(raw)) return String(raw)
  return null
}

export function extractAuthMeUserPayload(result: unknown): AuthMeUserPayload | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null
  const rawUser = pickRawUserPayload(result as Record<string, unknown>)
  if (!rawUser) return null
  const id = coerceUserId(rawUser)
  if (!id) return null
  return { ...rawUser, id }
}
