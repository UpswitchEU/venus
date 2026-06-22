import type { BuyerReadyRoomPayload } from './types'

interface RoomResponse {
  success: boolean
  data?: BuyerReadyRoomPayload
  error?: string
}

export async function fetchBuyerReadyRoom(
  entityId: string,
  signal?: AbortSignal
): Promise<BuyerReadyRoomPayload> {
  const response = await fetch(`/api/buyer-ready/room/${encodeURIComponent(entityId)}`, {
    credentials: 'include',
    cache: 'no-store',
    signal,
  })
  const json = (await response.json().catch(() => null)) as RoomResponse | null
  if (!response.ok || !json?.success || !json.data) {
    throw new Error(json?.error ?? `Buyer-ready room failed (${response.status})`)
  }
  return json.data
}
