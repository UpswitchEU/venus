/**
 * PDF Generation Route Handler
 *
 * WORLD-CLASS: Triggers PDF generation via Titan API.
 * Supports both sync (small reports) and async (large reports) generation.
 *
 * POST /api/valuations/:id/pdf - Trigger PDF generation
 * GET /api/valuations/:id/pdf - Get existing PDF or check status
 *
 * **Embedded preview (e.g. Mercury iframe → Venus on `preview.valuation.upswitch.app`):** the browser may
 * omit auth cookies from the raw `Cookie` header. This route merges Next's server cookie store before
 * proxying to Titan, matching the newer BFF routes.
 */

import { type NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { buildPdfPaywall402JsonBody } from '@/utils/pdfPaywall402'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TITAN_PDF_GENERATE_MS = 110_000
const TITAN_PDF_STATUS_MS = 10_000

function titanAuthHeaders(
  cookieHeader: string,
  extra: Record<string, string> = {}
): Record<string, string> {
  const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)
  return {
    ...extra,
    Cookie: cookieHeader,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
  }
}

/**
 * Trigger PDF generation
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: 'Report ID is required' }, { status: 400 })
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf/async`

    const response = await fetch(titanUrl, {
      method: 'POST',
      headers: titanAuthHeaders(cookieHeader, { 'Content-Type': 'application/json' }),
      credentials: 'include',
      signal: AbortSignal.timeout(TITAN_PDF_GENERATE_MS),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const errMsg = errBody.message ?? errBody.error ?? errBody.detail ?? 'PDF generation failed'
      console.error('[PDF] Titan API error:', response.status, errBody)
      const paywallBody =
        response.status === 402
          ? buildPdfPaywall402JsonBody(
              errBody as { code?: string; message?: string; error?: string },
              typeof errMsg === 'string' ? errMsg : String(errMsg)
            )
          : {
              success: false,
              error: typeof errMsg === 'string' ? errMsg : String(errMsg),
            }
      return NextResponse.json(paywallBody, { status: response.status })
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      ...data,
    })
  } catch (error) {
    console.error('[PDF] Error:', error instanceof Error ? error.message : error)

    return NextResponse.json({ success: false, error: 'PDF generation failed' }, { status: 500 })
  }
}

/**
 * Get existing PDF URL
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: 'Report ID is required' }, { status: 400 })
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const TITAN_API_URL_GET = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL_GET}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf`

    const response = await fetch(titanUrl, {
      method: 'GET',
      headers: titanAuthHeaders(cookieHeader),
      credentials: 'include',
      signal: AbortSignal.timeout(TITAN_PDF_STATUS_MS),
    })

    if (!response.ok) {
      if (response.status === 402) {
        const errBody = await response.json().catch(() => ({}))
        return NextResponse.json(buildPdfPaywall402JsonBody(errBody), { status: 402 })
      }
      if (response.status === 404) {
        return NextResponse.json({
          success: true,
          status: 'none',
          pdfUrl: null,
        })
      }

      const error = await response.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: error.message || 'Failed to check PDF status' },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: data.pdfUrl ? 'ready' : 'none',
      pdfUrl: data.pdfUrl || null,
    })
  } catch (error) {
    console.error('[PDF] Error:', error instanceof Error ? error.message : error)

    return NextResponse.json(
      { success: false, error: 'Failed to check PDF status' },
      { status: 500 }
    )
  }
}
