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
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchArrayBufferWithTimeout, fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { buildPdfPaywall402JsonBody, type TitanPdfPaywallBody } from '@/utils/pdfPaywall402'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Multi-leg: Titan GET + optional POST generate + storage fetch (+ optional retry) */
export const maxDuration = 120

const TITAN_PDF_GET_MS = 10_000
const TITAN_PDF_POST_MS = 110_000
const STORAGE_FETCH_MS = 30_000
const ROUTE_RESPONSE_BUDGET_MS = 115_000

/** Titan + VIQ reject tiny PDFs; mirror so we never stream HTML/error bodies as PDF. */
const MIN_PDF_BYTES = 500

type PdfDownloadDeadline = {
  budgetMs: number
  startedAt: number
}

type JsonRecord = Record<string, unknown>

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

function bufferLooksLikePdf(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 5) return false
  const u = new Uint8Array(buffer, 0, 5)
  return u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46 // %PDF
}

function safePdfFilename(id: string): string {
  const safeId =
    id
      .replace(/[^a-zA-Z0-9._-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 96) || 'report'
  return `valuation-report-${safeId}-${Date.now()}.pdf`
}

function isDownloadTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AuthUpstreamTimeoutError' ||
    error.name === 'AbortError' ||
    error.message.toLowerCase().includes('timeout')
  )
}

function stringField(body: JsonRecord, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' && value ? value : null
}

function timeoutFor(deadline: PdfDownloadDeadline, requestedMs: number): number {
  const elapsedMs = Date.now() - deadline.startedAt
  const remainingMs = deadline.budgetMs - elapsedMs
  if (remainingMs <= 0) {
    throw new Error('PDF download timeout budget exhausted')
  }
  return Math.max(1, Math.min(requestedMs, remainingMs))
}

async function fetchPdfFromStorage(
  pdfUrl: string,
  deadline: PdfDownloadDeadline
): Promise<ArrayBuffer | null> {
  try {
    const { response: pdfResponse, arrayBuffer: buf } = await fetchArrayBufferWithTimeout(
      pdfUrl,
      { redirect: 'follow' },
      timeoutFor(deadline, STORAGE_FETCH_MS)
    )
    if (!pdfResponse.ok) return null
    if (!buf) return null
    if (buf.byteLength < MIN_PDF_BYTES || !bufferLooksLikePdf(buf)) return null
    return buf
  } catch (error) {
    if (isDownloadTimeout(error)) throw error
    return null
  }
}

async function titanLookupPdfUrl(
  titanPdfUrl: string,
  cookieHeader: string,
  deadline: PdfDownloadDeadline,
  clientContextHeaders: Record<string, string>
): Promise<{ pdfUrl: string | null; errorResponse: NextResponse | null }> {
  let titanResponse: Response
  let body: JsonRecord | null
  try {
    const result = await fetchJsonWithTimeout<JsonRecord>(
      titanPdfUrl,
      {
        method: 'GET',
        headers: titanAuthHeaders(cookieHeader, clientContextHeaders),
        credentials: 'include',
      },
      timeoutFor(deadline, TITAN_PDF_GET_MS)
    )
    titanResponse = result.response
    body = result.json
  } catch (error) {
    if (isDownloadTimeout(error)) throw error
    console.warn('[PDF Download] Titan PDF lookup failed; attempting regeneration fallback', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { pdfUrl: null, errorResponse: null }
  }

  if (!titanResponse.ok) {
    const errBody = body ?? {}
    if (titanResponse.status === 402) {
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson(
          buildPdfPaywall402JsonBody(errBody as TitanPdfPaywallBody),
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
    if (titanResponse.status >= 500) {
      console.warn(
        '[PDF Download] Titan PDF lookup returned 5xx; attempting regeneration fallback',
        {
          status: titanResponse.status,
        }
      )
      return { pdfUrl: null, errorResponse: null }
    }
    const errMsg =
      stringField(errBody, 'message') || stringField(errBody, 'error') || 'Failed to get PDF URL'
    return {
      pdfUrl: null,
      errorResponse: pdfErrorJson(
        {
          success: false,
          error: errMsg,
        },
        titanResponse.status
      ),
    }
  }

  const lookup = body ?? {}
  const pdfUrl =
    typeof lookup?.pdfUrl === 'string' && lookup.pdfUrl.length > 0 ? lookup.pdfUrl : null
  return { pdfUrl, errorResponse: null }
}

async function titanGeneratePdf(
  titanPdfUrl: string,
  cookieHeader: string,
  deadline: PdfDownloadDeadline,
  clientContextHeaders: Record<string, string>
): Promise<{ pdfUrl: string | null; errorResponse: NextResponse | null }> {
  const { response: postRes, json: body } = await fetchJsonWithTimeout<JsonRecord>(
    titanPdfUrl,
    {
      method: 'POST',
      headers: titanAuthHeaders(cookieHeader, {
        'Content-Type': 'application/json',
        ...clientContextHeaders,
      }),
      credentials: 'include',
      body: JSON.stringify({}),
    },
    timeoutFor(deadline, TITAN_PDF_POST_MS)
  )

  if (!postRes.ok) {
    const errBody = body ?? {}
    if (postRes.status === 402) {
      return {
        pdfUrl: null,
        errorResponse: pdfErrorJson(
          buildPdfPaywall402JsonBody(errBody as TitanPdfPaywallBody),
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
    const msg =
      stringField(errBody, 'message') || stringField(errBody, 'error') || 'Failed to generate PDF'
    return {
      pdfUrl: null,
      errorResponse: pdfErrorJson({ success: false, error: msg }, postRes.status),
    }
  }

  const generated = body ?? {}
  const pdfUrl =
    typeof generated?.pdfUrl === 'string' && generated.pdfUrl.length > 0 ? generated.pdfUrl : null

  return { pdfUrl, errorResponse: null }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const deadline: PdfDownloadDeadline = {
      startedAt: Date.now(),
      budgetMs: ROUTE_RESPONSE_BUDGET_MS,
    }
    const { id } = await params

    if (!id) {
      return pdfErrorJson({ success: false, error: 'Report ID is required' }, 400)
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return pdfErrorJson({ success: false, error: 'Authentication required' }, 401)
    }

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanPdfUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf`
    const clientContextHeaders = getTitanClientContextHeaders(request)

    const lookupResult = await titanLookupPdfUrl(
      titanPdfUrl,
      cookieHeader,
      deadline,
      clientContextHeaders
    )
    if (lookupResult.errorResponse) return lookupResult.errorResponse

    let pdfUrl = lookupResult.pdfUrl
    let pdfBuffer = pdfUrl ? await fetchPdfFromStorage(pdfUrl, deadline) : null

    // No URL yet, or stored file missing / expired / not a PDF — regenerate once.
    if (!pdfBuffer) {
      const gen = await titanGeneratePdf(titanPdfUrl, cookieHeader, deadline, clientContextHeaders)
      if (gen.errorResponse) return gen.errorResponse
      pdfUrl = gen.pdfUrl
      pdfBuffer = pdfUrl ? await fetchPdfFromStorage(pdfUrl, deadline) : null
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

    const filename = safePdfFilename(id)
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: pdfDownloadNoStoreHeaders({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      }),
    })
  } catch (error) {
    const isTimeout = isDownloadTimeout(error)
    if (isTimeout) {
      console.warn('[PDF Download] Timed out:', error instanceof Error ? error.message : error)
    } else {
      console.error('[PDF Download] Error:', error instanceof Error ? error.message : error)
    }
    return pdfErrorJson(
      {
        success: false,
        error: isTimeout ? 'PDF download timed out. Please try again.' : 'PDF download failed',
      },
      isTimeout ? 504 : 500
    )
  }
}
