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
 *
 * **Storage resilience:** Signed URLs can expire or return 403 while Titan still
 * advertises `pdf_url`. If the first fetch fails or the body is not a PDF, we run
 * one synchronous regenerate (POST) and retry fetch once.
 *
 * **Freshness & caching:** Titan only returns a persisted `pdfUrl` when
 * `metadata.pdf_render_fingerprint` matches the live valuation snapshot and
 * timestamps are coherent (`getCoherentPersistedPdfUrl`). Responses use
 * `Cache-Control: private, no-store` so browsers and shared caches cannot serve
 * an older PDF after you recalculate.
 */

import { type NextRequest, NextResponse } from 'next/server'
import { hasTitanAccessCookie } from '@/utils/auth/cookieHeader'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Multi-leg: Titan GET + optional POST generate + storage fetch (+ optional retry) */
export const maxDuration = 120

const TITAN_PDF_GET_MS = 10_000
const TITAN_PDF_POST_MS = 75_000
const STORAGE_FETCH_MS = 30_000

/** Titan + VIQ reject tiny PDFs; mirror so we never stream HTML/error bodies as PDF. */
const MIN_PDF_BYTES = 500

/** Never cache PDF bytes or JSON errors — avoids stale files after recalculation (CDN/browser). */
function pdfDownloadNoStoreHeaders(base: Record<string, string> = {}): Record<string, string> {
  return {
    'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    Vary: 'Cookie',
    ...base,
  }
}

function pdfErrorJson(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: pdfDownloadNoStoreHeaders() })
}

function bufferLooksLikePdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false
  const u = new Uint8Array(buffer, 0, 5)
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 // %PDF
}

async function fetchPdfFromStorage(pdfUrl: string): Promise<ArrayBuffer | null> {
  try {
    const pdfResponse = await fetch(pdfUrl, {
      signal: AbortSignal.timeout(STORAGE_FETCH_MS),
      redirect: 'follow',
    })
    if (!pdfResponse.ok) return null
    const buf = await pdfResponse.arrayBuffer()
    if (buf.byteLength < MIN_PDF_BYTES || !bufferLooksLikePdf(buf)) return null
    return buf
  } catch {
    return null
  }
}

async function titanLookupPdfUrl(
  titanPdfUrl: string,
  cookieHeader: string
): Promise<{ pdfUrl: string | null; errorResponse: NextResponse | null }> {
  const titanResponse = await fetch(titanPdfUrl, {
    method: 'GET',
    headers: { Cookie: cookieHeader },
    signal: AbortSignal.timeout(TITAN_PDF_GET_MS),
  })

  if (!titanResponse.ok) {
    if (titanResponse.status === 402) {
      const errBody = await titanResponse.json().catch(() => ({}))
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson(
          {
            success: false,
            error: errBody.message || 'PDF download requires a Starter plan or above.',
            upgradeRequired: true,
          },
          402
        ),
      }
    }
    if (titanResponse.status === 404) {
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson(
          { success: false, error: 'PDF not found for this report' },
          404
        ),
      }
    }
    const errBody = await titanResponse.json().catch(() => ({}))
    return {
      pdfUrl: null,
      errorResponse: pdfErrorJson(
        {
          success: false,
          error: errBody.message || errBody.error || 'Failed to get PDF URL',
        },
        titanResponse.status
      ),
    }
  }

  const lookup = await titanResponse.json().catch(() => ({}))
  const pdfUrl =
    typeof lookup?.pdfUrl === 'string' && lookup.pdfUrl.length > 0 ? lookup.pdfUrl : null
  return { pdfUrl, errorResponse: null }
}

async function titanGeneratePdf(
  titanPdfUrl: string,
  cookieHeader: string
): Promise<{ pdfUrl: string | null; errorResponse: NextResponse | null }> {
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
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson(
          {
            success: false,
            error: errBody.message || 'PDF download requires a Starter plan or above.',
            upgradeRequired: true,
          },
          402
        ),
      }
    }
    if (postRes.status === 401) {
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson({ success: false, error: 'Authentication required' }, 401),
      }
    }
    if (postRes.status === 404) {
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson({ success: false, error: 'Report not found' }, 404),
      }
    }
    const errBody = await postRes.json().catch(() => ({}))
    const msg =
      (typeof errBody.message === 'string' && errBody.message) ||
      (typeof errBody.error === 'string' && errBody.error) ||
      'Failed to generate PDF'
    return {
      pdfUrl: null,
      errorResponse: pdfErrorJson({ success: false, error: msg }, postRes.status),
    }
  }

  const generated = await postRes.json().catch(() => ({}))
  const pdfUrl =
    typeof generated?.pdfUrl === 'string' && generated.pdfUrl.length > 0 ? generated.pdfUrl : null

  return { pdfUrl, errorResponse: null }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return pdfErrorJson({ success: false, error: 'Report ID is required' }, 400)
    }

    const cookieHeader = request.headers.get('cookie') || ''
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return pdfErrorJson({ success: false, error: 'Authentication required' }, 401)
    }

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanPdfUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf`

    const lookupResult = await titanLookupPdfUrl(titanPdfUrl, cookieHeader)
    if (lookupResult.errorResponse) return lookupResult.errorResponse

    let pdfUrl = lookupResult.pdfUrl
    let pdfBuffer = pdfUrl ? await fetchPdfFromStorage(pdfUrl) : null

    // No URL yet, or stored file missing / expired / not a PDF — regenerate once.
    if (!pdfBuffer) {
      const gen = await titanGeneratePdf(titanPdfUrl, cookieHeader)
      if (gen.errorResponse) return gen.errorResponse
      pdfUrl = gen.pdfUrl
      pdfBuffer = pdfUrl ? await fetchPdfFromStorage(pdfUrl) : null
    }

    if (!pdfBuffer || !pdfUrl) {
      return pdfErrorJson(
        {
          success: false,
          error:
            'Could not retrieve the PDF file. If this persists, try exporting again after the report finishes saving.',
        },
        502
      )
    }

    const filename = `valuation-report-${id}-${Date.now()}.pdf`
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: pdfDownloadNoStoreHeaders({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      }),
    })
  } catch (error) {
    const isTimeout =
      (error as { name?: string })?.name === 'AbortError' ||
      (error instanceof Error && error.message?.includes('timeout'))
    console.error('[PDF Download] Error:', error instanceof Error ? error.message : error)
    return pdfErrorJson(
      {
        success: false,
        error: isTimeout ? 'PDF download timed out. Please try again.' : 'PDF download failed',
      },
      isTimeout ? 504 : 500
    )
  }
}
