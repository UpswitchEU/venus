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
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { createContextLogger } from '@/utils/logger'
import { buildPdfPaywall402JsonBody, type TitanPdfPaywallBody } from '@/utils/pdfPaywall402'
import { isPdfTransientUpstreamStatus } from '@/utils/pdfTransientUpstream'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const TITAN_PDF_GENERATE_MS = 110_000
const TITAN_PDF_STATUS_MS = 10_000
const pdfLogger = createContextLogger('PdfRoute')
type JsonRecord = Record<string, unknown>

function stringField(body: JsonRecord, key: string): string | null {
  const value = body[key]
  return typeof value === 'string' && value ? value : null
}

function pdfJson(body: Record<string, unknown>, status: number): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
      Vary: 'Cookie',
    },
  })
}

function isUpstreamTimeout(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  return (
    error.name === 'AuthUpstreamTimeoutError' ||
    error.name === 'AbortError' ||
    error.message.toLowerCase().includes('timeout')
  )
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

/**
 * Trigger PDF generation
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return pdfJson({ success: false, error: 'Report ID is required' }, 400)
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return pdfJson({ success: false, error: 'Authentication required' }, 401)
    }

    const TITAN_API_URL = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf/async`

    const { response, json: body } = await fetchJsonWithTimeout<JsonRecord>(
      titanUrl,
      {
        method: 'POST',
        headers: titanAuthHeaders(cookieHeader, {
          'Content-Type': 'application/json',
          ...getTitanClientContextHeaders(request),
        }),
        credentials: 'include',
      },
      TITAN_PDF_GENERATE_MS
    )

    if (!response.ok) {
      const errBody = body ?? {}
      const errMsg =
        stringField(errBody, 'message') ||
        stringField(errBody, 'error') ||
        stringField(errBody, 'detail') ||
        'PDF generation failed'
      if (isPdfTransientUpstreamStatus(response.status)) {
        pdfLogger.warn('Titan PDF API returned a transient status', {
          status: response.status,
          body: errBody,
        })
      } else if (response.status !== 402) {
        pdfLogger.error('Titan PDF API returned an error', {
          status: response.status,
          body: errBody,
        })
      }
      const paywallBody =
        response.status === 402
          ? buildPdfPaywall402JsonBody(errBody as TitanPdfPaywallBody, errMsg)
          : {
              success: false,
              error: errMsg,
            }
      return pdfJson(paywallBody, response.status)
    }

    const data = body ?? {}

    return pdfJson(
      {
        success: true,
        ...data,
      },
      200
    )
  } catch (error) {
    if (isUpstreamTimeout(error)) {
      pdfLogger.warn('Titan PDF generation timed out', {
        error: error instanceof Error ? error.message : String(error),
      })
      return pdfJson({ success: false, error: 'PDF generation timed out. Please try again.' }, 504)
    }

    pdfLogger.error(
      'PDF generation failed',
      { error: error instanceof Error ? error.message : String(error) },
      error instanceof Error ? error : undefined
    )
    return pdfJson({ success: false, error: 'PDF generation failed' }, 500)
  }
}

/**
 * Get existing PDF URL
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params

    if (!id) {
      return pdfJson({ success: false, error: 'Report ID is required' }, 400)
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return pdfJson({ success: false, error: 'Authentication required' }, 401)
    }

    const TITAN_API_URL_GET = getTitanApiUrl(request)
    const titanUrl = `${TITAN_API_URL_GET}/api/v2/valuations/reports/${encodeURIComponent(id)}/pdf`

    const { response, json: body } = await fetchJsonWithTimeout<JsonRecord>(
      titanUrl,
      {
        method: 'GET',
        headers: titanAuthHeaders(cookieHeader, getTitanClientContextHeaders(request)),
        credentials: 'include',
      },
      TITAN_PDF_STATUS_MS
    )

    if (!response.ok) {
      if (response.status === 402) {
        const errBody = body ?? {}
        return pdfJson(buildPdfPaywall402JsonBody(errBody), 402)
      }
      if (response.status === 404) {
        return pdfJson(
          {
            success: true,
            status: 'none',
            pdfUrl: null,
          },
          200
        )
      }

      const error = body ?? {}
      return pdfJson(
        {
          success: false,
          error: stringField(error, 'message') || 'Failed to check PDF status',
        },
        response.status
      )
    }

    const data = body ?? {}

    return pdfJson(
      {
        success: true,
        status: data.pdfUrl ? 'ready' : 'none',
        pdfUrl: data.pdfUrl || null,
      },
      200
    )
  } catch (error) {
    if (isUpstreamTimeout(error)) {
      pdfLogger.warn('Titan PDF status lookup timed out', {
        error: error instanceof Error ? error.message : String(error),
      })
      return pdfJson(
        { success: false, error: 'PDF status check timed out. Please try again.' },
        504
      )
    }

    pdfLogger.error(
      'PDF status lookup failed',
      { error: error instanceof Error ? error.message : String(error) },
      error instanceof Error ? error : undefined
    )
    return pdfJson({ success: false, error: 'Failed to check PDF status' }, 500)
  }
}
