/**
 * PDF Generation Status Route Handler
 *
 * WORLD-CLASS: Polls for async PDF generation status.
 *
 * GET /api/valuations/pdf/status/:jobId - Check generation status
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
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const TITAN_PDF_STATUS_MS = 10_000
const pdfStatusLogger = createContextLogger('PdfStatusRoute')
type JsonRecord = Record<string, unknown>

function pdfStatusJson(body: Record<string, unknown>, status: number): NextResponse {
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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    if (!jobId) {
      return pdfStatusJson({ success: false, error: 'Job ID is required' }, 400)
    }

    const { cookieHeader } = await getBffCookieHeaderForTitan(request)

    if (!hasTitanAccessCookie(cookieHeader)) {
      return pdfStatusJson({ success: false, error: 'Authentication required' }, 401)
    }

    const titanUrl = `${getTitanApiUrl(request)}/api/v2/valuations/pdf/status/${encodeURIComponent(jobId)}`

    const { response, json: responseBody } = await fetchJsonWithTimeout<JsonRecord>(
      titanUrl,
      {
        method: 'GET',
        headers: titanAuthHeaders(cookieHeader, getTitanClientContextHeaders(request)),
        credentials: 'include',
      },
      TITAN_PDF_STATUS_MS
    )

    if (!response.ok) {
      const errBody = responseBody ?? {}
      const errMsg =
        (typeof errBody.message === 'string' && errBody.message) ||
        (typeof errBody.error === 'string' && errBody.error) ||
        (typeof errBody.detail === 'string' && errBody.detail) ||
        'Failed to check status'
      const errorBody =
        response.status === 402
          ? buildPdfPaywall402JsonBody(errBody as TitanPdfPaywallBody, errMsg)
          : { success: false, error: errMsg }
      return pdfStatusJson(errorBody, response.status)
    }

    const data = responseBody ?? {}

    return pdfStatusJson(
      {
        success: true,
        status: data.status,
        pdfUrl: data.pdfUrl || null,
        progress: data.progress || 0,
        error: data.error || null,
      },
      200
    )
  } catch (error) {
    if (isUpstreamTimeout(error)) {
      pdfStatusLogger.warn('Titan PDF status request timed out', {
        error: error instanceof Error ? error.message : String(error),
      })
      return pdfStatusJson(
        { success: false, error: 'PDF status check timed out. Please try again.' },
        504
      )
    }

    pdfStatusLogger.error(
      'PDF status check failed',
      { error: error instanceof Error ? error.message : String(error) },
      error instanceof Error ? error : undefined
    )
    return pdfStatusJson({ success: false, error: 'Failed to check status' }, 500)
  }
}
