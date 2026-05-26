import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { forwardAgentToolActionHeaders } from './agentActionProxy'

const PROVIDERS = {
  yuki: {
    listPath: '/integrations/accounting/yuki/administrations',
    syncPath: '/integrations/accounting/yuki/sync-async',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      administration_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
  exact: {
    listPath: '/integrations/accounting/exact/administrations',
    syncPath: '/integrations/accounting/exact/sync-async',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      administration_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
  silverfin: {
    listPath: '/integrations/accounting/silverfin/companies',
    syncPath: '/integrations/accounting/silverfin/sync-async',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      administration_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
  bizzcontrol: {
    listPath: '/integrations/accounting/bizzcontrol/companies',
    syncPath: '/integrations/accounting/bizzcontrol/sync-async',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      administration_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
  octopus: {
    listPath: '/integrations/accounting/octopus/companies',
    syncPath: '/integrations/accounting/octopus/sync-async',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      administration_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
  xero: {
    listPath: '/integrations/accounting/xero/companies',
    syncPath: '/integrations/accounting/sync-all',
    syncBody: (administrationIds: string[], chainToBulk: boolean) => ({
      xero_ids: administrationIds,
      chain_to_bulk: chainToBulk,
    }),
  },
} as const

export type AccountingSyncProvider = keyof typeof PROVIDERS

function isAccountingSyncProvider(provider: string): provider is AccountingSyncProvider {
  return provider in PROVIDERS
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function titanMessage(payload: unknown, fallback: string): string {
  const record = recordValue(payload)
  const message = record?.message
  if (typeof message === 'string' && message.trim()) return message.trim()
  if (Array.isArray(message)) {
    const joined = message.filter((item): item is string => typeof item === 'string').join(', ')
    if (joined.trim()) return joined.trim()
  }
  const error = record?.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  return fallback
}

function extractAdministrationIds(payload: unknown): string[] {
  const administrations = recordValue(payload)?.administrations
  if (!Array.isArray(administrations)) return []

  const ids = new Set<string>()
  for (const raw of administrations) {
    const id = recordValue(raw)?.administration_id
    if (typeof id === 'string' && id.trim()) ids.add(id.trim())
  }
  return [...ids]
}

function stableJson(value: unknown): string {
  if (value === null || typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(String(value))
}

function resolveIdempotencyKey(
  request: Pick<Request, 'headers'>,
  operation: string,
  body: unknown
) {
  const incoming = request.headers.get('x-idempotency-key')?.trim()
  if (incoming) return incoming
  const digest = createHash('sha256')
    .update(`${operation}\n${stableJson(body)}`)
    .digest('hex')
  return `proxy:${operation}:${digest.slice(0, 24)}`
}

export async function proxyProviderAccountingSyncToTitan(request: NextRequest, provider: string) {
  if (!isAccountingSyncProvider(provider)) {
    return NextResponse.json(
      {
        success: false,
        message: `Unsupported provider: ${provider}`,
      },
      { status: 400 }
    )
  }

  const { cookieHeader } = await getBffCookieHeaderForTitan(request)
  if (!hasTitanAccessCookie(cookieHeader)) {
    return NextResponse.json(
      { success: false, message: 'Authentication required' },
      { status: 401 }
    )
  }

  const incoming = (await request.json().catch(() => ({}))) as { chain_to_bulk?: unknown }
  const chainToBulk = incoming.chain_to_bulk === true
  const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
  const authHeaders = {
    Cookie: cookieHeader,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
  const config = PROVIDERS[provider]
  const titanBase = getTitanApiUrl(request)

  const listResponse = await fetchWithTimeout(
    `${titanBase}${config.listPath}`,
    {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
      },
      credentials: 'include',
    },
    15_000
  )
  const listPayload: unknown = await listResponse.json().catch(() => null)
  if (!listResponse.ok) {
    return NextResponse.json(
      {
        success: false,
        message: titanMessage(listPayload, 'Failed to fetch provider administrations'),
        data: listPayload,
      },
      { status: listResponse.status }
    )
  }

  const administrationIds = extractAdministrationIds(listPayload)
  if (administrationIds.length === 0) {
    return NextResponse.json(
      {
        success: false,
        message: 'No linked administrations found for this provider.',
      },
      { status: 409 }
    )
  }

  const body = config.syncBody(administrationIds, chainToBulk)
  const syncResponse = await fetchWithTimeout(
    `${titanBase}${config.syncPath}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders,
        'X-Idempotency-Key': resolveIdempotencyKey(
          request,
          `accounting/${provider}/sync-provider`,
          body
        ),
        ...forwardAgentToolActionHeaders(request),
      },
      credentials: 'include',
      body: JSON.stringify(body),
    },
    15_000
  )
  const syncPayload: unknown = await syncResponse.json().catch(() => null)
  if (!syncResponse.ok) {
    return NextResponse.json(
      {
        success: false,
        message: titanMessage(syncPayload, 'Failed to enqueue provider sync'),
        data: syncPayload,
      },
      { status: syncResponse.status }
    )
  }

  return NextResponse.json(
    {
      success: true,
      provider,
      administration_count: administrationIds.length,
      data: syncPayload,
    },
    { status: 202 }
  )
}
