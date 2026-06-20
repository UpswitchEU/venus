/** Let the BFF return its structured 504 before the browser gives up. */
export const PDF_DOWNLOAD_FETCH_MS = 125_000
export const PDF_STATUS_FETCH_MS = 10_000
export const PDF_STATUS_POLL_INTERVAL_MS = 2_000
export const PDF_STATUS_POLL_MAX_BACKOFF_MS = 16_000
export const PDF_STATUS_MAX_POLL_MS = 5 * 60_000

export type TimeoutAbortHandle = {
  signal: AbortSignal
  abort: () => void
  cleanup: () => void
  didTimeout: () => boolean
}

export type PdfAccessErrorBody = {
  action?: unknown
  code?: unknown
  inviteAdvisorRequired?: unknown
  required_tier?: unknown
  upgradeRequired?: unknown
}

export function createTimeoutAbortHandle(
  timeoutMs: number,
  incomingSignal?: AbortSignal
): TimeoutAbortHandle {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)
  const abortFromIncomingSignal = () => controller.abort(incomingSignal?.reason)

  if (incomingSignal) {
    if (incomingSignal.aborted) {
      abortFromIncomingSignal()
    } else {
      incomingSignal.addEventListener('abort', abortFromIncomingSignal, { once: true })
    }
  }

  return {
    signal: controller.signal,
    abort: () => controller.abort(),
    cleanup: () => {
      clearTimeout(timeoutId)
      incomingSignal?.removeEventListener('abort', abortFromIncomingSignal)
    },
    didTimeout: () => timedOut,
  }
}

export async function blobStartsWithPdfMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 8) return false
  const headBlob = blob.slice(0, 5)
  let headBuffer: ArrayBuffer
  if (typeof headBlob.arrayBuffer === 'function') {
    headBuffer = await headBlob.arrayBuffer()
  } else if (typeof headBlob.text === 'function') {
    headBuffer = new TextEncoder().encode(await headBlob.text()).buffer
  } else {
    headBuffer = await new Response(headBlob).arrayBuffer()
  }
  const head = new Uint8Array(headBuffer)
  return head[0] === 0x25 && head[1] === 0x50 && head[2] === 0x44 && head[3] === 0x46
}

export function buildPdfAccessErrorContext(errBody: PdfAccessErrorBody): Record<string, unknown> {
  const code = typeof errBody.code === 'string' ? errBody.code : undefined
  const inviteAdvisorRequired =
    errBody.inviteAdvisorRequired === true || code === 'INVITE_ADVISOR_REQUIRED'
  return {
    upgradeRequired: inviteAdvisorRequired ? false : true,
    inviteAdvisorRequired,
    ...(code ? { code } : {}),
    ...(typeof errBody.action === 'string' ? { action: errBody.action } : {}),
    ...(typeof errBody.required_tier === 'string' ? { required_tier: errBody.required_tier } : {}),
  }
}

export function derivePdfPollProgress(pollCount: number): number {
  return Math.min(30 + Math.max(0, pollCount), 90)
}

export function derivePdfPollDelay(consecutiveTransientErrors: number): number {
  const retryCount = Math.max(1, consecutiveTransientErrors)
  return Math.min(
    PDF_STATUS_POLL_INTERVAL_MS * 2 ** (retryCount - 1),
    PDF_STATUS_POLL_MAX_BACKOFF_MS
  )
}
