/**
 * AI Suggestion API Route
 *
 * Proxies field-specific AI suggestion requests to Titan.
 * Used for contextual help when users click the help icon on form fields.
 *
 * @module api/ai/suggestion
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  getTitanAccessTokenFromCookieHeader,
  hasTitanAccessCookie,
} from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 45

const TIMEOUT_MS = 15_000 // 15s

/**
 * POST /api/ai/suggestion
 *
 * Gets AI-powered suggestion for a specific field.
 */
export async function POST(request: NextRequest) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    const body = await request.json()
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const hasAuth = hasTitanAccessCookie(cookieHeader)

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, error: 'Authentication required' },
        { status: 401 }
      )
    }

    const accessToken = getTitanAccessTokenFromCookieHeader(cookieHeader)

    const titanResponse = await fetch(`${getTitanApiUrl(request)}/api/v2/ai/generate-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
        ...getTitanClientContextHeaders(request),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Suggestion service unavailable' },
        { status: titanResponse.status }
      )
    }

    const data = await titanResponse.json().catch(() => ({ success: false }))
    return NextResponse.json(data)
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Suggestion request timed out' },
        { status: 504 }
      )
    }
    console.error('[AI Suggestion Route] Error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ success: false, error: 'Failed to get suggestion' }, { status: 503 })
  } finally {
    clearTimeout(timeout)
  }
}
