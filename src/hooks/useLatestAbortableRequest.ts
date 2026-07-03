import { useCallback, useEffect, useRef } from 'react'

export interface LatestAbortableRequestHandle<TContext> {
  context: TContext
  controller: AbortController
  isCurrent: () => boolean
  release: () => void
  signal: AbortSignal
  requestId: number
}

interface ActiveRequest<TContext> {
  context: TContext
  controller: AbortController | null
  requestId: number
}

export function useLatestAbortableRequest<TContext>() {
  const activeRequestRef = useRef<ActiveRequest<TContext> | null>(null)
  const latestRequestIdRef = useRef(0)

  const isCurrentRequest = useCallback(
    (requestId: number) => activeRequestRef.current?.requestId === requestId,
    []
  )

  const reserveRequest = useCallback((context: TContext) => {
    latestRequestIdRef.current += 1
    activeRequestRef.current?.controller?.abort()
    const requestId = latestRequestIdRef.current
    activeRequestRef.current = { context, controller: null, requestId }
    return requestId
  }, [])

  const cancelRequest = useCallback((requestId?: number) => {
    if (requestId !== undefined && activeRequestRef.current?.requestId !== requestId) return

    latestRequestIdRef.current += 1
    activeRequestRef.current?.controller?.abort()
    activeRequestRef.current = null
  }, [])

  const beginRequest = useCallback(
    (requestId: number): LatestAbortableRequestHandle<TContext> | null => {
      const activeRequest = activeRequestRef.current
      if (!activeRequest || activeRequest.requestId !== requestId) return null

      activeRequest.controller?.abort()
      const controller = new AbortController()
      activeRequestRef.current = {
        context: activeRequest.context,
        controller,
        requestId,
      }

      const isCurrent = () => isCurrentRequest(requestId)
      const release = () => {
        const currentRequest = activeRequestRef.current
        if (currentRequest?.requestId === requestId && currentRequest.controller === controller) {
          activeRequestRef.current = {
            context: currentRequest.context,
            controller: null,
            requestId,
          }
        }
      }

      return {
        context: activeRequest.context,
        controller,
        isCurrent,
        release,
        requestId,
        signal: controller.signal,
      }
    },
    [isCurrentRequest]
  )

  useEffect(() => () => cancelRequest(), [cancelRequest])

  return {
    beginRequest,
    cancelRequest,
    isCurrentRequest,
    reserveRequest,
  }
}
