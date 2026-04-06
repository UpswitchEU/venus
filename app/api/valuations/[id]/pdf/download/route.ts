/**
 * PDF Download Proxy Route
 *
 * Proxies PDF download to avoid CORS/403 when fetching Supabase storage URLs
 * directly from the browser. Server-side fetch has no CORS restrictions.
 *
 * GET /api/valuations/:id/pdf/download - Stream PDF to client
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'Report ID is required' },
        { status: 400 }
      )
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = cookieHeader.includes('upswitch_access_token=')

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    // 1. Get pdfUrl from Titan
    const TITAN_API_URL = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${id}/pdf`

    const titanResponse = await fetch(titanUrl, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(10000),
    })

    if (!titanResponse.ok) {
      if (titanResponse.status === 402) {
        const errBody = await titanResponse.json().catch(() => ({}))
        return NextResponse.json(
          { success: false, error: errBody.message || 'PDF download requires a Starter plan or above.', upgradeRequired: true },
          { status: 402 }
        )
      }
      if (titanResponse.status === 404) {
        return NextResponse.json(
          { success: false, error: 'PDF not found for this report' },
          { status: 404 }
        )
      }
      const errBody = await titanResponse.json().catch(() => ({}))
      return NextResponse.json(
        { success: false, error: errBody.message || errBody.error || 'Failed to get PDF URL' },
        { status: titanResponse.status }
      )
    }

    const data = await titanResponse.json()
    const pdfUrl = data?.pdfUrl

    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'PDF not ready for download' },
        { status: 404 }
      )
    }

    // 2. Fetch PDF from storage (server-side, no CORS)
    const pdfResponse = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(30000),
    })

    if (!pdfResponse.ok) {
      console.error('[PDF Download] Storage fetch failed:', pdfResponse.status, pdfUrl.substring(0, 80))
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve PDF from storage' },
        { status: 502 }
      )
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const contentType = pdfResponse.headers.get('content-type') || 'application/pdf'

    // 3. Stream PDF to client with download headers
    const filename = `valuation-report-${id}.pdf`
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    })
  } catch (error) {
    const isTimeout =
      (error as { name?: string })?.name === 'AbortError' ||
      (error instanceof Error && error.message?.includes('timeout'))
    console.error('[PDF Download] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json(
      {
        success: false,
        error: isTimeout ? 'PDF download timed out. Please try again.' : 'PDF download failed',
      },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
