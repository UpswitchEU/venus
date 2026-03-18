/**
 * Normalization API Route (Optional Catch-all)
 *
 * Proxies all normalization requests to Titan's VenusNormalizationController.
 * Uses [[...path]] so POST /api/normalization (zero segments) matches.
 *
 * CRITICAL: Forwards client context headers (X-Client-User-Id, X-Accountant-User-Id,
 * X-Relationship-Id) for accountant-client workflows. Without these, Titan cannot
 * resolve sessions when an accountant is acting on behalf of a client.
 *
 * Titan endpoints:
 * - GET  /api/normalization/market-rates/:industry
 * - POST /api/normalization
 * - GET  /api/normalization/:sessionId/:year
 * - GET  /api/normalization/:sessionId
 * - DELETE /api/normalization/:sessionId/:year
 *
 * @module api/normalization
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  CLIENT_CONTEXT_HEADERS,
  extractClientContextFromHeaders,
} from '@/constants/headers'

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app'

const TIMEOUT_MS = 10_000 // 10s

/**
 * Build Titan URL from the catch-all path segments.
 * Avoids trailing slash when path is empty (POST /api/normalization).
 */
function buildTitanUrl(path: string[], searchParams: URLSearchParams): string {
  const pathStr = path.join('/')
  const qs = searchParams.toString()
  const base = `${TITAN_API_URL}/api/normalization`
  const pathPart = pathStr ? `/${pathStr}` : ''
  return `${base}${pathPart}${qs ? `?${qs}` : ''}`
}

/**
 * Build headers to forward to Titan, including client context for accountant-client flow
 */
function buildTitanHeaders(request: NextRequest): Record<string, string> {
  const cookieHeader = request.headers.get('cookie') || ''
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cookieHeader && { Cookie: cookieHeader }),
  }

  const clientContext = extractClientContextFromHeaders((name: string) =>
    request.headers.get(name)
  )
  if (clientContext) {
    headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientContext.clientUserId
    headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = clientContext.accountantUserId
    if (clientContext.relationshipId) {
      headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = clientContext.relationshipId
    }
  }

  const correlationId = request.headers.get('x-correlation-id') || request.headers.get('x-request-id')
  if (correlationId) {
    headers['X-Correlation-ID'] = correlationId
  }

  return headers
}

/**
 * Common proxy handler with timeout
 */
async function proxyToTitan(
  request: NextRequest,
  params: { path?: string[] },
  method: string
): Promise<NextResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const path = params.path ?? []
    const url = buildTitanUrl(path, request.nextUrl.searchParams)

    const fetchOptions: RequestInit = {
      method,
      headers: buildTitanHeaders(request),
      signal: controller.signal,
    }

    // Include body for POST/PUT/PATCH
    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const body = await request.json().catch(() => ({}))
      fetchOptions.body = JSON.stringify(body)
    }

    const titanResponse = await fetch(url, fetchOptions)

    // Handle 204 No Content
    if (titanResponse.status === 204) {
      return new NextResponse(null, { status: 204 })
    }

    const data = await titanResponse.json().catch(() => ({ success: false }))
    return NextResponse.json(data, { status: titanResponse.status })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Normalization request timed out' },
        { status: 504 }
      )
    }
    console.error(
      `[Normalization Route] ${method} error:`,
      error instanceof Error ? error.message : error
    )
    return NextResponse.json(
      { success: false, error: 'Normalization service unavailable' },
      { status: 503 }
    )
  } finally {
    clearTimeout(timeout)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxyToTitan(request, await params, 'GET')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxyToTitan(request, await params, 'POST')
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> }
) {
  return proxyToTitan(request, await params, 'DELETE')
}
