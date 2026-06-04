/**
 * Version History API Proxy
 *
 * Proxies version requests to Titan to avoid CORS when Venus (valuation.upswitch.app)
 * fetches from api.upswitch.app. Same-origin requests include cookies correctly.
 *
 * Titan: GET/POST /api/v2/valuations/sessions/:id/versions
 *
 * @module api/valuations/sessions/[id]/versions
 */

import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 10_000 // 10s

async function proxyToTitan(
  request: NextRequest,
  id: string,
  method: string,
  searchParams?: string
): Promise<NextResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const cookieHeader = request.headers.get('cookie') || ''
    const authHeader = request.headers.get('authorization') || ''
    const url = `${TITAN_API_URL}/api/v2/valuations/sessions/${encodeURIComponent(id)}/versions${searchParams ? `?${searchParams}` : ''}`

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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const searchParams = request.nextUrl.searchParams.toString()
  return proxyToTitan(request, id, 'GET', searchParams)
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return proxyToTitan(request, id, 'POST')
}
