import { type NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import {
  isTransientUpstreamStatus,
  transientUpstreamFailureBody,
} from './transientUpstreamResponse'

export const TITAN_REVIEW_PROXY_TIMEOUT_MS = 35_000

function extractUpstreamMessage(json: unknown, fallback: string): string {
  if (typeof json === 'object' && json && 'message' in json && typeof json.message === 'string') {
    return json.message
  }
  return fallback
}

function isUpstreamTimeout(error: unknown): boolean {
  if (error && typeof error === 'object' && 'name' in error) {
    const name = (error as { name?: unknown }).name
    if (name === 'AuthUpstreamTimeoutError') return true
  }
  return error instanceof Error && error.message.toLowerCase().includes('timeout')
}

export async function proxyTitanReviewJsonRoute(
  request: NextRequest,
  titanUrl: string,
  init: RequestInit,
  options: { defaultErrorMessage: string }
): Promise<NextResponse> {
  try {
    const { cookieHeader } = await getBffCookieHeaderForTitan(request)
    const { response, json } = await fetchJsonWithTimeout(
      titanUrl,
      {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(cookieHeader ? { Cookie: cookieHeader } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
        credentials: 'include',
      },
      TITAN_REVIEW_PROXY_TIMEOUT_MS
    )

    if (!response.ok) {
      if (isTransientUpstreamStatus(response.status)) {
        return NextResponse.json(transientUpstreamFailureBody(), { status: response.status })
      }
      return NextResponse.json(
        { success: false, message: extractUpstreamMessage(json, options.defaultErrorMessage) },
        { status: response.status }
      )
    }

    return NextResponse.json({ success: true, data: json })
  } catch (error) {
    if (isUpstreamTimeout(error)) {
      return NextResponse.json(transientUpstreamFailureBody(), { status: 504 })
    }
    return NextResponse.json(
      { success: false, message: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}
