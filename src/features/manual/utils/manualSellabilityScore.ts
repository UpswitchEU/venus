import { useClientContext } from '../../../stores/clientContext'
import { extractErrorMessage, parseSellabilityScoreResponse } from './tool-card-response-parsers'

export type ManualSellabilityScoreResult =
  | {
      kind: 'scored'
      score: number
      band: string
      confidence?: string
    }
  | { kind: 'computed' }

export type ManualSellabilityFetch = (
  input: string,
  init: {
    method: 'POST'
    headers: Record<string, string>
    credentials: 'include'
    body: string
  }
) => Promise<{
  ok: boolean
  status: number
  json: () => Promise<unknown>
}>

export async function runManualSellabilityScore(
  fetchImpl: ManualSellabilityFetch = fetch
): Promise<ManualSellabilityScoreResult> {
  const resp = await fetchImpl('/api/sellability/score', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...useClientContext.getState().getContextHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({}),
  })
  const json: unknown = await resp.json().catch(() => ({}))
  if (!resp.ok || (json as { success?: boolean })?.success === false) {
    throw new Error(extractErrorMessage(json, resp.status))
  }

  const parsed = parseSellabilityScoreResponse(json)
  return parsed
    ? {
        kind: 'scored',
        score: parsed.score,
        band: parsed.band,
        confidence: parsed.confidence,
      }
    : { kind: 'computed' }
}
