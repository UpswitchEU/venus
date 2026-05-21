export function resolveReturnedConversationIdUpdate(
  currentConversationId: string | null | undefined,
  returnedConversationId: string | null | undefined
): string | null {
  const next = typeof returnedConversationId === 'string' ? returnedConversationId.trim() : ''
  if (!next) return null

  const current = typeof currentConversationId === 'string' ? currentConversationId.trim() : ''
  return next === current ? null : next
}
