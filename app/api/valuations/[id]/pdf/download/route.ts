/**
 * PDF Download Proxy Route
 *
 * Proxies PDF download to avoid CORS/403 when fetching Supabase storage URLs
 * directly from the browser. Server-side fetch has no CORS restrictions.
 *
 * GET /api/valuations/:id/pdf/download — Stream PDF to client
 *
 * **Important:** Matches Mercury `pdf/download` behaviour: if Titan has no `pdfUrl`
 * yet, we POST to Titan to generate synchronously, then stream storage. Without this,
 * users who click download while `pdf_generated` is still false only ever saw
 * "PDF not ready for download" even though generation would succeed.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Multi-leg: Titan GET + optional Titan POST (generate) + storage fetch */
export const maxDuration = 120

const TITAN_PDF_GET_MS = 10_000
const TITAN_PDF_POST_MS = 75_000
const STORAGE_FETCH_MS = 30_000

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

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanPdfUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf`

    // 1. Try existing PDF URL
    const titanResponse = await fetch(titanPdfUrl, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(TITAN_PDF_GET_MS),
    })

    if (!titanResponse.ok) {
      if (titanResponse.status === 402) {
        const errBody = await titanResponse.json().catch(() => ({}))
        return NextResponse.json(
          {
            success: false,
            error:
              errBody.message ||
              'PDF download requires a Starter plan or above.',
            upgradeRequired: true,
          },
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
        {
          success: false,
          error: errBody.message || errBody.error || 'Failed to get PDF URL',
        },
        { status: titanResponse.status }
      )
    }

    const lookup = await titanResponse.json().catch(() => ({}))
    let pdfUrl =
      typeof lookup?.pdfUrl === 'string' && lookup.pdfUrl.length > 0 ? lookup.pdfUrl : null

    // 2. Generate on demand (Mercury parity — critical for first-time download)
    if (!pdfUrl) {
      const postRes = await fetch(titanPdfUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookieHeader,
        },
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TITAN_PDF_POST_MS),
      })

      if (!postRes.ok) {
        if (postRes.status === 402) {
          const errBody = await postRes.json().catch(() => ({}))
          return NextResponse.json(
            {
              success: false,
              error:
                errBody.message ||
                'PDF download requires a Starter plan or above.',
              upgradeRequired: true,
            },
            { status: 402 }
          )
        }
        if (postRes.status === 401) {
          return NextResponse.json(
            { success: false, error: 'Authentication required' },
            { status: 401 }
          )
        }
        if (postRes.status === 404) {
          return NextResponse.json(
            { success: false, error: 'Report not found' },
            { status: 404 }
          )
        }
        const errBody = await postRes.json().catch(() => ({}))
        const msg =
          (typeof errBody.message === 'string' && errBody.message) ||
          (typeof errBody.error === 'string' && errBody.error) ||
          'Failed to generate PDF'
        return NextResponse.json({ success: false, error: msg }, { status: postRes.status })
      }

      const generated = await postRes.json().catch(() => ({}))
      pdfUrl =
        typeof generated?.pdfUrl === 'string' && generated.pdfUrl.length > 0
          ? generated.pdfUrl
          : null
    }

    if (!pdfUrl || typeof pdfUrl !== 'string') {
      return NextResponse.json(
        { success: false, error: 'PDF not ready for download' },
        { status: 404 }
      )
    }

    // 3. Fetch PDF from storage (server-side, no CORS)
    const pdfResponse = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(STORAGE_FETCH_MS),
    })

    if (!pdfResponse.ok) {
      console.error(
        '[PDF Download] Storage fetch failed:',
        pdfResponse.status,
        pdfUrl.substring(0, 80)
      )
      return NextResponse.json(
        { success: false, error: 'Failed to retrieve PDF from storage' },
        { status: 502 }
      )
    }

    const pdfBuffer = await pdfResponse.arrayBuffer()
    const contentType = pdfResponse.headers.get('content-type') || 'application/pdf'

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
