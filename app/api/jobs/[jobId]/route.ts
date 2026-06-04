/**
 * Proxies job status reads to Titan (same-origin for the browser).
 * GET /api/jobs/:jobId → Titan GET /jobs/:jobId
 */

import { type NextRequest, NextResponse } from 'next/server'
import { hasTitanAccessCookie } from '@/utils/auth/cookieHeader'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const JOB_STATUS_TIMEOUT_MS = 15_000

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AuthUpstreamTimeoutError' ||
      error.name === 'TimeoutError' ||
      error.message.includes('timeout'))
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    if (!jobId) {
      return NextResponse.json({ success: false, error: 'Job ID is required' }, { status: 400 })
    }

    const cookieHeader = request.headers.get('cookie') || ''

    if (!hasTitanAccessCookie(cookieHeader)) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const titanUrl = `${getTitanApiUrl(request)}/jobs/${encodeURIComponent(jobId)}`

    const { response, json: body } = await fetchJsonWithTimeout(
      titanUrl,
      {
        method: 'GET',
        headers: {
          Cookie: cookieHeader,
        },
      },
      JOB_STATUS_TIMEOUT_MS
    )

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error:
            typeof body === 'object' && body && 'message' in body
              ? String((body as { message?: unknown }).message)
              : 'Failed to load job',
        },
        { status: response.status }
      )
    }

    return NextResponse.json(body)
  } catch (error) {
    console.error('[Jobs proxy] Error:', error instanceof Error ? error.message : error)

    return NextResponse.json(
      {
        success: false,
        error: isTimeoutError(error) ? 'Job status request timed out' : 'Job service unavailable',
      },
      { status: isTimeoutError(error) ? 504 : 502 }
    )
  }
}
