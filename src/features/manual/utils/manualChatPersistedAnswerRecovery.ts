/**
 * Last-resort recovery for the staging "verbinding verbroken" failure mode.
 *
 * Titan runs the Claude turn on an INTERNAL AbortController (API timeout), not
 * the inbound request signal (see titan `claude.service.ts`). So when the SSE
 * stream and the `/chat` recovery both lose their connection ~100ms after open
 * (the staging client/edge disconnect), Titan still finishes the turn and
 * PERSISTS the assistant answer (`appendMessages`). The bytes never reached the
 * browser, but the answer exists in conversation history within a few seconds.
 *
 * This module polls that history for the just-persisted answer so the UI can
 * show it instead of a dead terminal error. Read-only: it never writes, charges
 * credits, or mutates server state.
 */

export interface PersistedHistoryMessage {
  role: string
  content: string
  created_at?: string
  tool_name?: string
  tool_result?: unknown
}

export interface PersistedAnswerRecovery {
  content: string
}

/**
 * Find the assistant answer for a specific user turn in persisted history.
 *
 * Targets the turn by user content (robust to client/server clock skew, and to
 * stale prior answers): locate the LAST user message matching `userContent`,
 * then return the latest non-empty assistant message that comes after it.
 * Returns null when the turn has not landed yet (keep polling) or produced no
 * visible text (let the caller fall back to the terminal error).
 */
export function extractRecoveredAnswerFromHistory(
  messages: readonly PersistedHistoryMessage[],
  userContent: string
): PersistedAnswerRecovery | null {
  const needle = userContent.trim()
  if (needle.length === 0) return null

  let lastUserTurnIndex = -1
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i]
    if (message.role === 'user' && typeof message.content === 'string') {
      if (message.content.trim() === needle) {
        lastUserTurnIndex = i
        break
      }
    }
  }
  if (lastUserTurnIndex === -1) return null

  for (let i = messages.length - 1; i > lastUserTurnIndex; i -= 1) {
    const message = messages[i]
    if (
      message.role === 'assistant' &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
    ) {
      return { content: message.content }
    }
  }
  return null
}

export interface PollHistoryForPersistedAnswerParams {
  /** Bound `aiChatService.loadHistory` — fetches conversation history by report/session key. */
  loadHistory: (reportId: string) => Promise<{ messages: PersistedHistoryMessage[] }>
  reportId: string
  userContent: string
  /** Aborts the poll loop when the turn is superseded or the surface unmounts. */
  isCancelled?: () => boolean
  /** Number of history fetches. Spans Claude's typical first-to-final latency. */
  attempts?: number
  /** Steady delay between fetches after the first. */
  delayMs?: number
  /** Snappy first delay — catches a fast answer in ~1s without a long wait. */
  firstDelayMs?: number
  /** Injectable for tests. */
  sleep?: (ms: number) => Promise<void>
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Poll conversation history until the persisted assistant answer for this turn
 * appears (or attempts run out). Returns the recovered answer or null. Never
 * throws — a failed fetch is treated as "not yet" and the loop continues.
 */
export async function pollHistoryForPersistedAnswer({
  loadHistory,
  reportId,
  userContent,
  isCancelled,
  attempts = 8,
  delayMs = 2500,
  firstDelayMs = 1200,
  sleep = defaultSleep,
}: PollHistoryForPersistedAnswerParams): Promise<PersistedAnswerRecovery | null> {
  if (!reportId || userContent.trim().length === 0) return null

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    // Snappy first poll, then a steady interval. Stops on the first hit, so the
    // common (recoverable) turn resolves in 2-3 polls; only genuine failures
    // walk the full window (~19s) before giving up.
    await sleep(attempt === 0 ? firstDelayMs : delayMs)
    if (isCancelled?.()) return null

    let messages: PersistedHistoryMessage[] = []
    try {
      const history = await loadHistory(reportId)
      messages = Array.isArray(history?.messages) ? history.messages : []
    } catch {
      messages = []
    }
    if (isCancelled?.()) return null

    const recovered = extractRecoveredAnswerFromHistory(messages, userContent)
    if (recovered) return recovered
  }

  return null
}
