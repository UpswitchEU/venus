import { normalizeBusinessTypeId } from '@/utils/businessTypeIdAliases'
import { getApiUrl } from '@/utils/getMercuryUrl'
import type { BusinessType } from './businessTypesApi'

const API_URL = getApiUrl()

/** Load full business-type metadata (preferences, industry) for KBO enrichment. */
export async function fetchBusinessTypeById(
  businessTypeId: string,
  signal?: AbortSignal
): Promise<BusinessType | null> {
  try {
    const canonicalBusinessTypeId = normalizeBusinessTypeId(businessTypeId) ?? businessTypeId
    const response = await fetch(`${API_URL}/api/v2/business-types/${canonicalBusinessTypeId}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal,
    })
    if (!response.ok) return null
    const data = await response.json()
    const bt = data.data ?? data
    if (!bt?.id) return null
    return bt as BusinessType
  } catch {
    return null
  }
}
