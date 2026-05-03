import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

export async function DELETE(request: NextRequest, { params }: { params: { reportId: string } }) {
  try {
    const titanApiUrl =
      process.env.NEXT_PUBLIC_API_BASE_URL ||
      process.env.NEXT_PUBLIC_BACKEND_URL ||
      'https://api.upswitch.app'
    const { reportId } = params

    if (!reportId) {
      return NextResponse.json(
        { success: false, message: 'Report ID is required' },
        { status: 400 }
      )
    }

    // CRITICAL: Prioritize request headers for cookies (works in iframe context)
    // HTTP-only cookies set for .upswitch.app domain are sent in request headers
    const requestCookieHeader = request.headers.get('cookie') || ''

    // Also try cookies() helper as fallback
    const cookieStore = await cookies()
    const cookiePairs: string[] = []
    cookieStore.getAll().forEach((cookie) => {
      cookiePairs.push(`${cookie.name}=${cookie.value}`)
    })
    const cookieStoreHeader = cookiePairs.join('; ')

    // Use request headers first (contains all cookies sent by browser), fallback to cookie store
    const cookieHeader = requestCookieHeader || cookieStoreHeader

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    }

    const guestSessionId = request.headers.get('x-guest-session-id')
    if (guestSessionId) {
      ;(headers as Record<string, string>)['x-guest-session-id'] = guestSessionId
    }

    const response = await fetchWithTimeout(
      `${titanApiUrl}/api/v2/valuations/reports/${reportId}`,
      {
        method: 'DELETE',
        headers,
        credentials: 'include',
      },
      10_000
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to delete report' }))
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || 'Failed to delete report',
        },
        { status: response.status }
      )
    }

    const data = await response.json().catch(() => ({ success: true }))
    return NextResponse.json(data)
  } catch (error) {
    console.error('[Venus /api/reports/[reportId]] Error:', error)
    const isTimeout = error instanceof Error && error.message.includes('timeout')
    return NextResponse.json(
      { error: isTimeout ? 'Request timed out' : 'Internal server error' },
      { status: isTimeout ? 504 : 500 }
    )
  }
}
