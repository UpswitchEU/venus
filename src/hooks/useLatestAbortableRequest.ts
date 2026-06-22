import { useCallback, useEffect, useRef } from 'react'

export interface LatestAbortableRequestHandle<TContext> {
  context: TContext
  controller: AbortController
  isCurrent: () => boolean
  release: () => void
  signal: AbortSignal
  token: number
}

interface ActiveRequest<TContext> {
  context: TContext
  controller: AbortController | null
  token: number
}

export function useLatestAbortableRequest<TContext>() {
  const activeRequestRef = useRef<ActiveRequest<TContext> | null>(null)
  const latestTokenRef = useRef(0)

  const isCurrentRequest = useCallback(
    (token: number) => activeRequestRef.current?.token === token,
    []
  )

  const reserveRequest = useCallback((context: TContext) => {
    latestTokenRef.current += 1
    activeRequestRef.current?.controller?.abort()
    const token = latestTokenRef.current
    activeRequestRef.current = { context, controller: null, token }
    return token
  }, [])

  const cancelRequest = useCallback((token?: number) => {
    if (token !== undefined && activeRequestRef.current?.token !== token) return

    latestTokenRef.current += 1
    activeRequestRef.current?.controller?.abort()
    activeRequestRef.current = null
  }, [])

  const beginRequest = useCallback(
    (token: number): LatestAbortableRequestHandle<TContext> | null => {
      const activeRequest = activeRequestRef.current
      if (!activeRequest || activeRequest.token !== token) return null

      activeRequest.controller?.abort()
      const controller = new AbortController()
      activeRequestRef.current = {
        context: activeRequest.context,
        controller,
        token,
      }

      const isCurrent = () => isCurrentRequest(token)
      const release = () => {
        const currentRequest = activeRequestRef.current
        if (currentRequest?.token === token && currentRequest.controller === controller) {
          activeRequestRef.current = {
            context: currentRequest.context,
            controller: null,
            token,
          }
        }
      }

      return {
        context: activeRequest.context,
        controller,
        isCurrent,
        release,
        signal: controller.signal,
        token,
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
