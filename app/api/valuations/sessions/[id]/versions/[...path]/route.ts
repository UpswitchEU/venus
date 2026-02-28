/**
 * Version History API Proxy (sub-routes)
 *
 * Proxies version sub-route requests to Titan:
 * - GET /versions/:versionNumber
 * - GET /versions/compare?v1=&v2=
 * - POST /versions/:versionNumber/restore
 *
 * @module api/valuations/sessions/[id]/versions/[...path]
 */

import { NextRequest, NextResponse } from 'next/server'

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 10_000 // 10s

async function proxyToTitan(
  request: NextRequest,
  id: string,
  pathSegments: string[],
  method: string,
  searchParams?: string
): Promise<NextResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const authHeader = request.headers.get('authorization') || ''
    const pathStr = pathSegments.length > 0 ? '/' + pathSegments.join('/') : ''
    const url = `${TITAN_API_URL}/api/v2/valuations/sessions/${id}/versions${pathStr}${searchParams ? `?${searchParams}` : ''}`

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...(authHeader && { Authorization: authHeader }),
      },
      signal: controller.signal,
    }

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const body = await request.json().catch(() => ({}))
      fetchOptions.body = JSON.stringify(body)
    }

    const titanResponse = await fetch(url, fetchOptions)

    if (titanResponse.status === 204) {
      return new NextResponse(null, { status: 204 })
    }

    const data = await titanResponse.json().catch(() => ({ success: false }))
    return NextResponse.json(data, { status: titanResponse.status })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Version request timed out' },
        { status: 504 }
      )
    }
    console.error(
      `[Versions Proxy] ${method} error:`,
      error instanceof Error ? error.message : error
    )
    return NextResponse.json(
      { success: false, error: 'Version service unavailable' },
      { status: 503 }
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: pathSegments } = await params
  const searchParams = request.nextUrl.searchParams.toString()
  return proxyToTitan(request, id, pathSegments || [], 'GET', searchParams)
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; path: string[] }> }
) {
  const { id, path: pathSegments } = await params
  const searchParams = request.nextUrl.searchParams.toString()
  return proxyToTitan(request, id, pathSegments || [], 'POST', searchParams)
}
