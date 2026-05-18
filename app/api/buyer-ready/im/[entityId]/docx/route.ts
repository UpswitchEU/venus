import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const ENTITY_ID_PATTERN = /^[a-zA-Z0-9_-]+$/

type RouteContext = {
  params: Promise<{ entityId: string }>
}

function accessTokenFromCookie(cookieHeader: string): string | null {
  const match = cookieHeader.match(/(?:^|;\s*)upswitch_access_token=([^;]+)/)
  return match?.[1]?.trim() || null
}

function hasAuthCookie(cookieHeader: string): boolean {
  return (
    cookieHeader.includes('upswitch_access_token=') ||
    cookieHeader.includes('upswitch_refresh_token=')
  )
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { entityId } = await context.params

  if (!entityId || !ENTITY_ID_PATTERN.test(entityId)) {
    return NextResponse.json(
      { success: false, error: 'Invalid buyer-ready IM entity ID' },
      { status: 400 }
    )
  }

  const { cookieHeader } = await getBffCookieHeaderForTitan(request)

  if (!hasAuthCookie(cookieHeader)) {
    return NextResponse.json(
      { success: false, error: 'Authentication required' },
      { status: 401 }
    )
  }

  try {
    const accessToken = accessTokenFromCookie(cookieHeader)
    const titanApiUrl = getTitanApiUrl(request)
    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v1/buyer-ready/im/${encodeURIComponent(entityId)}/docx`,
      {
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        credentials: 'include',
      },
      20_000
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        success: false,
        error: 'Buyer-ready IM DOCX export failed',
      }))
      return NextResponse.json(error, { status: response.status })
    }

    const body = await response.arrayBuffer()
    const contentType =
      response.headers.get('content-type') ??
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const contentDisposition =
      response.headers.get('content-disposition') ?? 'attachment; filename="buyer-ready-im.docx"'

    return new NextResponse(body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': contentDisposition,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (error) {
    console.error('[Venus /api/buyer-ready/im/:entityId/docx]', {
      entityId: entityId.substring(0, 20),
      error: error instanceof Error ? error.message : String(error),
    })
    const isTimeout = error instanceof Error && error.name === 'AuthUpstreamTimeoutError'
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'Buyer-ready IM DOCX request timed out' : 'Buyer-ready IM unavailable',
      },
      { status: isTimeout ? 504 : 503 }
    )
  }
}
