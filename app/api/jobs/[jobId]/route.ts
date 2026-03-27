/**
 * Proxies job status reads to Titan (same-origin for the browser).
 * GET /api/jobs/:jobId → Titan GET /jobs/:jobId
 */

import { type NextRequest, NextResponse } from 'next/server'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'

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
    const accessTokenMatch = cookieHeader.match(/upswitch_access_token=([^;]+)/)

    if (!accessTokenMatch) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const titanUrl = `${getTitanApiUrl(request)}/jobs/${jobId}`

    const response = await fetch(titanUrl, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(15_000),
    })

    const body = await response.json().catch(() => ({}))

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

    return NextResponse.json({ success: false, error: 'Failed to load job' }, { status: 500 })
  }
}
