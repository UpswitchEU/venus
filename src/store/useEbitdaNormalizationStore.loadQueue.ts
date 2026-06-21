const sessionLoadQueue = new Map<string, Promise<void>>()

export async function enqueueEbitdaNormalizationLoad(
  sessionId: string,
  run: () => Promise<void>
): Promise<void> {
  const prev = sessionLoadQueue.get(sessionId) ?? Promise.resolve()
  const next = prev.then(run, run)
  sessionLoadQueue.set(sessionId, next)

  try {
    await next
  } finally {
    if (sessionLoadQueue.get(sessionId) === next) {
      sessionLoadQueue.delete(sessionId)
    }
  }
}

export function resetEbitdaNormalizationLoadQueueForTests(): void {
  sessionLoadQueue.clear()
}
