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
 * not send `upswitch_access_token` as a first-party cookie (third-party / SameSite), so POST can return
 * **401**. Fixing that requires infra (BFF, short-lived token, or cookie scope alignment), not only UI.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

/**
 * Trigger PDF generation
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json({ success: false, error: 'Report ID is required' }, { status: 400 })
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = cookieHeader.includes('upswitch_access_token=')

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${id}/pdf`

    const response = await fetch(titanUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(75000),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}))
      const errMsg = errBody.message ?? errBody.error ?? errBody.detail ?? 'PDF generation failed'
      console.error('[PDF] Titan API error:', response.status, errBody)
      return NextResponse.json(
        { success: false, error: typeof errMsg === 'string' ? errMsg : String(errMsg) },
        { status: response.status }
      )
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

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = cookieHeader.includes('upswitch_access_token=')

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const TITAN_API_URL_GET = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL_GET}/api/v2/valuations/reports/${id}/pdf`

    const response = await fetch(titanUrl, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
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
