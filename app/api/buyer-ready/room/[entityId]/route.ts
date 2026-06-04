import { type NextRequest, NextResponse } from 'next/server'
import { extractBuyerReadinessFromPackageResponse } from '@/features/buyer-ready/readiness-room/readiness-room-model'
import type {
  BuyerReadyImSnapshot,
  BuyerReadyRoomPayload,
  BuyerReadyVaultDoc,
  BuyerReadyWcTaxDto,
  ReadinessCaseDto,
} from '@/features/buyer-ready/readiness-room/types'
import { getTitanAccessTokenFromCookieHeader, hasTitanAuthCookie } from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const ENTITY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type RouteContext = {
  params: Promise<{ entityId: string }>
}

interface TitanJsonResult<T> {
  data: T | null
  ok: boolean
  status: number
  label: string
}

function jsonHeaders(cookieHeader: string): HeadersInit {
  const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
  return {
    'Content-Type': 'application/json',
    Cookie: cookieHeader,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

async function fetchTitanJson<T>(
  request: NextRequest,
  cookieHeader: string,
  path: string,
  label: string,
  timeoutMs = 10_000
): Promise<TitanJsonResult<T>> {
  const titanApiUrl = getTitanApiUrl(request)
  const { response, json } = await fetchJsonWithTimeout(
    `${titanApiUrl}${path}`,
    {
      method: 'GET',
      headers: jsonHeaders(cookieHeader),
      credentials: 'include',
    },
    timeoutMs
  )
  return {
    data: json as T | null,
    ok: response.ok,
    status: response.status,
    label,
  }
}

function extractData<T>(value: unknown): T | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  return (record.data ?? null) as T | null
}

function failureLabel(result: TitanJsonResult<unknown>): string | null {
  return result.ok ? null : `${result.label}:${result.status}`
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params

  if (!entityId || !ENTITY_ID_PATTERN.test(entityId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid buyer-ready room entity ID' },
      { status: 400 }
    )
  }

  const { cookieHeader } = await getBffCookieHeaderForTitan(request)

  if (!hasTitanAuthCookie(cookieHeader)) {
    return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })
  }

  try {
    const encoded = encodeURIComponent(entityId)
    const packageResult = await fetchTitanJson<unknown>(
      request,
      cookieHeader,
      `/api/v2/valuations/reports/${encoded}/package`,
      'package',
      10_000
    )

    if (!packageResult.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            packageResult.status === 404 ? 'Buyer-ready package not found' : 'Package fetch failed',
        },
        { status: packageResult.status }
      )
    }

    const [imResult, wcTaxResult, vaultResult, readinessCaseResult] = await Promise.all([
      fetchTitanJson<unknown>(
        request,
        cookieHeader,
        `/api/v1/buyer-ready/im/${encoded}`,
        'im',
        12_000
      ),
      fetchTitanJson<unknown>(
        request,
        cookieHeader,
        `/api/v1/buyer-ready/wc-tax/${encoded}`,
        'wc_tax',
        12_000
      ),
      fetchTitanJson<unknown>(
        request,
        cookieHeader,
        `/api/v1/buyer-ready/vault/${encoded}/docs`,
        'vault_docs',
        12_000
      ),
      UUID_PATTERN.test(entityId)
        ? fetchTitanJson<unknown>(
            request,
            cookieHeader,
            `/api/v1/readiness-cases?entityId=${encoded}&limit=5`,
            'readiness_case',
            12_000
          )
        : Promise.resolve({
            data: null,
            ok: true,
            status: 204,
            label: 'readiness_case',
          } satisfies TitanJsonResult<unknown>),
    ])

    const packageData = extractData<BuyerReadyRoomPayload['package']>(packageResult.data)
    const buyerReadiness =
      extractBuyerReadinessFromPackageResponse(packageResult.data) ??
      packageData?.buyerReadiness ??
      null
    const readinessCases = extractData<ReadinessCaseDto[]>(readinessCaseResult.data) ?? []
    const payload: BuyerReadyRoomPayload = {
      entityId,
      generatedAt: new Date().toISOString(),
      package: packageData,
      readinessCase: readinessCases[0] ?? null,
      buyerReadiness,
      im: extractData<BuyerReadyImSnapshot>(imResult.data),
      wcTax: extractData<BuyerReadyWcTaxDto>(wcTaxResult.data),
      vaultDocs: extractData<BuyerReadyVaultDoc[]>(vaultResult.data) ?? [],
      partialFailures: [imResult, wcTaxResult, vaultResult, readinessCaseResult]
        .map(failureLabel)
        .filter((value): value is string => Boolean(value)),
    }

    return NextResponse.json(
      { success: true, data: payload },
      { headers: { 'Cache-Control': 'private, max-age=30' } }
    )
  } catch (error) {
    console.error('[Venus /api/buyer-ready/room/:entityId]', {
      entityId: entityId.substring(0, 20),
      error: error instanceof Error ? error.message : String(error),
    })
    const isTimeout = error instanceof Error && error.name === 'AuthUpstreamTimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Buyer-ready room request timed out' : 'Buyer-ready room unavailable',
      },
      { status: isTimeout ? 504 : 503 }
    )
  }
}
