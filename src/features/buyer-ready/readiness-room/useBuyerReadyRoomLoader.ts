'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BuyerReadyRoomPayload } from './types'

export type BuyerReadyRoomFetcher = (
  entityId: string,
  signal?: AbortSignal
) => Promise<BuyerReadyRoomPayload>

interface BuyerReadyRoomLoaderState {
  payload: BuyerReadyRoomPayload | null
  error: string | null
  loading: boolean
}

export function getBuyerReadyRoomErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Buyer-ready room failed'
}

export function useBuyerReadyRoomLoader(
  entityId: string,
  fetcher: BuyerReadyRoomFetcher
): BuyerReadyRoomLoaderState & { reload: (signal?: AbortSignal) => Promise<void> } {
  const requestVersionRef = useRef(0)
  const [state, setState] = useState<BuyerReadyRoomLoaderState>({
    payload: null,
    error: null,
    loading: true,
  })

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const requestVersion = requestVersionRef.current + 1
      requestVersionRef.current = requestVersion
      const isCurrentRequest = () =>
        requestVersionRef.current === requestVersion && signal?.aborted !== true

      setState((current) => ({ ...current, error: null, loading: true }))

      try {
        const payload = await fetcher(entityId, signal)
        if (!isCurrentRequest()) return
        setState({ payload, error: null, loading: false })
      } catch (error) {
        if (!isCurrentRequest()) return
        setState({ payload: null, error: getBuyerReadyRoomErrorMessage(error), loading: false })
      }
    },
    [entityId, fetcher]
  )

  useEffect(() => {
    const controller = new AbortController()
    void reload(controller.signal)
    return () => {
      requestVersionRef.current += 1
      controller.abort()
    }
  }, [reload])

  return { ...state, reload }
}
