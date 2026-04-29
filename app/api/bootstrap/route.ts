/**
 * Bootstrap API Route
 *
 * Proxies bootstrap requests to Titan API for unified session initialization.
 * This enables same-origin requests from Venus client to avoid CORS issues.
 *
 * BANK GRADE: Handles 401 errors by attempting token refresh and retry.
 * Uses getTitanApiUrl(request), fetchWithTimeout.
 *
 * @module api/bootstrap
 */

import { NextRequest, NextResponse } from 'next/server'
import { getBffCookieHeaderForTitan, getResponseSetCookieList } from '@/utils/bffAuthProxy'
import { fetchWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import { generalLogger } from '@/utils/logger'
import {
  CLIENT_CONTEXT_HEADERS,
  extractClientContextFromHeaders,
} from '../../../src/constants/headers'

const TIMEOUT_MS = 15_000 // 15s per request (includes potential token refresh)

/**
 * Attempt to refresh the access token and return new cookies
 */
async function tryRefreshToken(
  request: NextRequest
): Promise<{ success: boolean; newCookies: string[] }> {
  try {
    const titanApiUrl = getTitanApiUrl(request)
    const { cookieHeader, refreshTokenFromStore } = await getBffCookieHeaderForTitan(request)
    const refreshResponse = await fetchWithTimeout(`${titanApiUrl}/api/v2/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      credentials: 'include',
      body: JSON.stringify({ refreshToken: refreshTokenFromStore || undefined }),
    })

    if (!refreshResponse.ok) {
      generalLogger.warn('[Bootstrap Route] Token refresh failed', {
        status: refreshResponse.status,
      })
      return { success: false, newCookies: [] }
    }

    const newCookies = getResponseSetCookieList(refreshResponse)
    generalLogger.debug('[Bootstrap Route] Token refresh successful', {
      newCookiesCount: newCookies.length,
    })

    return { success: true, newCookies }
  } catch (error) {
    generalLogger.error('[Bootstrap Route] Token refresh error', {
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, newCookies: [] }
  }
}

/**
 * Build cookie header from original cookies + new cookies
 * New cookies override old ones with the same name
 */
function mergeCookies(originalCookieHeader: string, newCookies: string[]): string {
  // Parse original cookies into a map
  const cookieMap = new Map<string, string>()

  if (originalCookieHeader) {
    originalCookieHeader.split(';').forEach((cookie) => {
      const [name, ...rest] = cookie.trim().split('=')
      if (name) {
        cookieMap.set(name, rest.join('='))
      }
    })
  }

  // Parse and override with new cookies
  newCookies.forEach((setCookie) => {
    // Set-Cookie format: name=value; attributes...
    const [nameValue] = setCookie.split(';')
    const [name, ...rest] = nameValue.split('=')
    if (name) {
      cookieMap.set(name.trim(), rest.join('='))
    }
  })

  // Rebuild cookie header
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')
}

/**
 * POST /api/bootstrap
 *
 * Proxies bootstrap request to Titan API with cookies.
 * Handles 401 by attempting token refresh and retry.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

  try {
    // Get request body
    const body = await request.json().catch(() => ({}))

    // Forward cookies for authentication (merge request header + cookies() like Mercury BFF)
    let cookieHeader = (await getBffCookieHeaderForTitan(request)).cookieHeader

    // Get guest session ID and client context headers if present
    // ✅ CRITICAL: Using centralized header constants for consistency
    // Accepts both canonical (X-Client-User-Id) and legacy (X-Client-Context-User) formats
    const guestSessionId = request.headers.get('x-guest-session-id')

    // Extract client context using centralized utility
    const clientContext = extractClientContextFromHeaders((name: string) =>
      request.headers.get(name)
    )

    // DIAGNOSTIC: Log client context forwarding to trace propagation to Titan
    const hasClientContext = !!clientContext
    const clientContextKeys = clientContext ? Object.keys(clientContext) : []
    if (!hasClientContext && (body.clientToken || body.clientId)) {
      generalLogger.warn(
        '[Bootstrap Route] Client token/ID in body but no client context headers received',
        {
          hasClientToken: !!body.clientToken,
          hasClientId: !!body.clientId,
          note: 'Client context may not be in store when Venus built the request',
        }
      )
    }
    generalLogger.debug('[Bootstrap Route] Client context forwarding', {
      hasClientContext,
      clientContextKeys,
      hasCookies: !!cookieHeader,
    })

    // Forward correlation ID for trace flow Venus → Titan → ValuationIQ
    const correlationId =
      request.headers.get('x-correlation-id') || request.headers.get('x-request-id')

    // Build headers for Titan request
    const buildTitanHeaders = (cookies: string): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      }

      if (cookies) {
        headers['Cookie'] = cookies
      }

      if (guestSessionId) {
        headers['X-Guest-Session-Id'] = guestSessionId
      }

      if (correlationId) {
        headers['X-Correlation-ID'] = correlationId
      }

      // ✅ CRITICAL: Forward client context headers using canonical format
      if (clientContext) {
        if (clientContext.clientUserId) {
          headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientContext.clientUserId
        }
        headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = clientContext.accountantUserId
        if (clientContext.relationshipId) {
          headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = clientContext.relationshipId
        }
      }

      return headers
    }

    const titanApiUrl = getTitanApiUrl(request)

    // CRITICAL LOGGING: Log the exact reportId and client context to trace ID mismatch issues
    generalLogger.debug('[Bootstrap Route] Proxying to Titan', {
      correlationId: correlationId || undefined,
      url: `${titanApiUrl}/api/v2/valuations/bootstrap`,
      reportId: body.reportId?.substring(0, 30) || 'NONE',
      reportIdLength: body.reportId?.length || 0,
      reportIdType: typeof body.reportId,
      hasBody: !!body && Object.keys(body).length > 0,
      bodyKeys: Object.keys(body || {}),
      hasCookies: !!cookieHeader,
      hasGuestSessionId: !!guestSessionId,
      hasClientContext,
    })

    // Forward request to Titan
    let response = await fetch(`${titanApiUrl}/api/v2/valuations/bootstrap`, {
      method: 'POST',
      headers: buildTitanHeaders(cookieHeader),
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    // BANK GRADE: Handle 401 by attempting token refresh
    let allSetCookieHeaders: string[] = []

    if (response.status === 401) {
      generalLogger.debug('[Bootstrap Route] Got 401, attempting token refresh')

      const refreshResult = await tryRefreshToken(request)

      if (refreshResult.success && refreshResult.newCookies.length > 0) {
        // Store new cookies to forward to browser
        allSetCookieHeaders = refreshResult.newCookies

        // Merge new cookies with original cookies for retry request
        const mergedCookies = mergeCookies(cookieHeader, refreshResult.newCookies)

        generalLogger.debug('[Bootstrap Route] Retrying bootstrap with refreshed token')

        // Retry the bootstrap request with new cookies
        response = await fetch(`${titanApiUrl}/api/v2/valuations/bootstrap`, {
          method: 'POST',
          headers: buildTitanHeaders(mergedCookies),
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        // Add any new cookies from retry response
        const retryCookies = getResponseSetCookieList(response)
        allSetCookieHeaders.push(...retryCookies)
      } else {
        // RELOAD LOOP FIX: Refresh failed - return explicit 401 so client redirects to login once
        generalLogger.warn('[Bootstrap Route] Token refresh failed - returning 401')
        return NextResponse.json(
          {
            success: false,
            error: 'Session expired',
            message: 'Token refresh failed. Please log in again.',
          },
          { status: 401 }
        )
      }
    } else {
      // Get cookies from original response
      allSetCookieHeaders = getResponseSetCookieList(response)
    }

    // Get response data
    const data = await response.json()

    // Log response
    const durationMs = Date.now() - startTime
    generalLogger.debug('[Bootstrap Route] Response received', {
      status: response.status,
      success: data.success,
      durationMs,
      bootstrapDurationMs: data.bootstrapDurationMs,
    })

    // Create response
    const nextResponse = NextResponse.json(data, {
      status: response.status,
    })

    // Forward all set-cookie headers (including refresh cookies)
    for (const cookie of allSetCookieHeaders) {
      nextResponse.headers.append('Set-Cookie', cookie)
    }

    return nextResponse
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const durationMs = Date.now() - startTime

    if (error instanceof DOMException && error.name === 'AbortError') {
      generalLogger.error('[Bootstrap Route] Request timed out', { durationMs })
      return NextResponse.json(
        { success: false, error: 'Bootstrap request timed out', bootstrapDurationMs: durationMs },
        { status: 504 }
      )
    }

    generalLogger.error('[Bootstrap Route] Error', {
      error: errorMessage,
      durationMs,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to bootstrap session',
        details: errorMessage,
        bootstrapDurationMs: durationMs,
      },
      { status: 500 }
    )
  } finally {
    clearTimeout(timeout)
  }
}
