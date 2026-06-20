interface ManagedRequestLifecycleOptions {
  externalSignal?: AbortSignal
  onTimeout: () => void
  timeoutMs: number
}

export interface ManagedRequestLifecycle {
  cleanup: () => void
  controller: AbortController
  signal: AbortSignal
  timeoutId: ReturnType<typeof setTimeout>
}

function abortController(controller: AbortController, reason?: unknown): void {
  if (controller.signal.aborted) {
    return
  }

  try {
    controller.abort(reason)
  } catch {
    controller.abort()
  }
}

function getAbortReason(signal: AbortSignal): unknown {
  return 'reason' in signal ? signal.reason : undefined
}

export function createManagedRequestLifecycle({
  externalSignal,
  onTimeout,
  timeoutMs,
}: ManagedRequestLifecycleOptions): ManagedRequestLifecycle {
  const controller = new AbortController()
  let removeExternalAbortListener: (() => void) | undefined

  if (externalSignal) {
    const forwardExternalAbort = () => {
      abortController(controller, getAbortReason(externalSignal))
    }

    if (externalSignal.aborted) {
      forwardExternalAbort()
    } else {
      externalSignal.addEventListener('abort', forwardExternalAbort, { once: true })
      removeExternalAbortListener = () => {
        externalSignal.removeEventListener('abort', forwardExternalAbort)
      }
    }
  }

  const timeoutId = setTimeout(() => {
    onTimeout()
    abortController(controller)
  }, timeoutMs)

  return {
    cleanup: () => {
      clearTimeout(timeoutId)
      removeExternalAbortListener?.()
    },
    controller,
    signal: controller.signal,
    timeoutId,
  }
}
