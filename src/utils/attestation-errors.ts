export function resolveAttestationErrorDescription(
  message: string | undefined,
  notFinalizedMessage: string
): string | undefined {
  if (!message) return undefined
  const normalized = message.toLowerCase()
  if (
    normalized.includes('not finalized') ||
    normalized.includes('only completed reports can be attested')
  ) {
    return notFinalizedMessage
  }
  return message
}
