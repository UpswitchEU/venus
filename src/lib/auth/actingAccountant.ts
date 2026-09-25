/**
 * The advisor a client-context request acts as: always the signed-in user.
 *
 * Titan refuses a client context whose accountant is anyone but the signed-in user
 * (header ids are data, never authority). Bootstrap can still name the relationship's
 * owning advisor for a colleague's client, and a persisted context can outlive a
 * sign-in, so every X-Accountant-User-Id header resolves through here.
 *
 * The auth store supplies the signed-in user. It imports the client-context store,
 * so it registers the accessor instead of being imported by its readers.
 */
let signedInUserIdResolver: (() => string | null | undefined) | null = null

export function registerSignedInUserIdResolver(
  resolver: (() => string | null | undefined) | null
): void {
  signedInUserIdResolver = resolver
}

/** The signed-in user's id, else the id the context named (before sign-in resolves). */
export function actingAccountantUserId(namedAccountantId: string): string {
  return signedInUserIdResolver?.()?.trim() || namedAccountantId
}
