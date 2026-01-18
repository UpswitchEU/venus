/**
 * Bootstrap API Route
 * 
 * Proxies bootstrap requests to Titan API for unified session initialization.
 * This enables same-origin requests from Venus client to avoid CORS issues.
 * 
 * @module api/bootstrap
 */

import { NextRequest, NextResponse } from 'next/server';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

/**
 * POST /api/bootstrap
 * 
 * Proxies bootstrap request to Titan API with cookies.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get request body
    const body = await request.json().catch(() => ({}));

    // Forward cookies for authentication
    const cookieHeader = request.headers.get('cookie') || '';

    // Get guest session ID from header if present
    const guestSessionId = request.headers.get('x-guest-session-id');
    const clientUserId = request.headers.get('x-client-user-id');
    const accountantUserId = request.headers.get('x-accountant-user-id');

    // Build headers for Titan request
    const titanHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (cookieHeader) {
      titanHeaders['Cookie'] = cookieHeader;
    }

    if (guestSessionId) {
      titanHeaders['X-Guest-Session-Id'] = guestSessionId;
    }

    if (clientUserId) {
      titanHeaders['X-Client-User-Id'] = clientUserId;
    }

    if (accountantUserId) {
      titanHeaders['X-Accountant-User-Id'] = accountantUserId;
    }

    // CRITICAL LOGGING: Log the exact reportId to trace ID mismatch issues
    console.log('[Bootstrap Route] Proxying to Titan', {
      url: `${TITAN_API_URL}/api/v2/valuations/bootstrap`,
      reportId: body.reportId?.substring(0, 30) || 'NONE',
      reportIdLength: body.reportId?.length || 0,
      reportIdType: typeof body.reportId,
      hasBody: !!body && Object.keys(body).length > 0,
      bodyKeys: Object.keys(body || {}),
      hasCookies: !!cookieHeader,
      hasGuestSessionId: !!guestSessionId,
    });

    // Forward request to Titan
    const response = await fetch(`${TITAN_API_URL}/api/v2/valuations/bootstrap`, {
      method: 'POST',
      headers: titanHeaders,
      body: JSON.stringify(body),
    });

    // Get response data
    const data = await response.json();

    // Log response
    const durationMs = Date.now() - startTime;
    console.log('[Bootstrap Route] Response received', {
      status: response.status,
      success: data.success,
      durationMs,
      bootstrapDurationMs: data.bootstrapDurationMs,
    });

    // Forward cookies from Titan response
    const setCookieHeaders = response.headers.getSetCookie();
    
    // Create response
    const nextResponse = NextResponse.json(data, {
      status: response.status,
    });

    // Forward any set-cookie headers
    for (const cookie of setCookieHeaders) {
      nextResponse.headers.append('Set-Cookie', cookie);
    }

    return nextResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    console.error('[Bootstrap Route] Error', {
      error: errorMessage,
      durationMs,
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to bootstrap session',
        details: errorMessage,
        bootstrapDurationMs: durationMs,
      },
      { status: 500 }
    );
  }
}
