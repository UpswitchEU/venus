/**
 * PDF Generation Status Route Handler
 *
 * WORLD-CLASS: Polls for async PDF generation status.
 *
 * GET /api/valuations/pdf/status/:jobId - Check generation status
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

    const titanUrl = `${getTitanApiUrl(request)}/api/v2/valuations/pdf/status/${jobId}`

    const response = await fetch(titanUrl, {
      method: 'GET',
      headers: {
        Cookie: cookieHeader,
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({})) as {
        message?: string
        error?: string
        detail?: string
      }
      const errMsg =
        errBody.message ?? errBody.error ?? errBody.detail ?? 'Failed to check status'
      return NextResponse.json(
        {
          success: false,
          error: errMsg,
          ...(response.status === 402 && { upgradeRequired: true as const }),
        },
        { status: response.status }
      )
    }

    const data = await response.json()

    return NextResponse.json({
      success: true,
      status: data.status,
      pdfUrl: data.pdfUrl || null,
      progress: data.progress || 0,
      error: data.error || null,
    })
  } catch (error) {
    console.error('[PDF Status] Error:', error instanceof Error ? error.message : error)

    return NextResponse.json({ success: false, error: 'Failed to check status' }, { status: 500 })
  }
}
