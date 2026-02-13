/**
 * Bootstrap API Route
 * 
 * Proxies bootstrap requests to Titan API for unified session initialization.
 * This enables same-origin requests from Venus client to avoid CORS issues.
 * 
 * BANK GRADE: Handles 401 errors by attempting token refresh and retry.
 * This prevents race conditions where bootstrap fires before token refresh completes.
 * 
 * @module api/bootstrap
 */

import { NextRequest, NextResponse } from 'next/server';
import { 
  CLIENT_CONTEXT_HEADERS, 
  extractClientContextFromHeaders,
} from '../../../src/constants/headers';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

/**
 * Attempt to refresh the access token and return new cookies
 */
async function tryRefreshToken(cookieHeader: string): Promise<{ success: boolean; newCookies: string[] }> {
  try {
    const refreshResponse = await fetch(`${TITAN_API_URL}/api/v2/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookieHeader,
      },
    });

    if (!refreshResponse.ok) {
      console.log('[Bootstrap Route] Token refresh failed', {
        status: refreshResponse.status,
      });
      return { success: false, newCookies: [] };
    }

    const newCookies = refreshResponse.headers.getSetCookie();
    console.log('[Bootstrap Route] Token refresh successful', {
      newCookiesCount: newCookies.length,
    });

    return { success: true, newCookies };
  } catch (error) {
    console.error('[Bootstrap Route] Token refresh error', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { success: false, newCookies: [] };
  }
}

/**
 * Build cookie header from original cookies + new cookies
 * New cookies override old ones with the same name
 */
function mergeCookies(originalCookieHeader: string, newCookies: string[]): string {
  // Parse original cookies into a map
  const cookieMap = new Map<string, string>();
  
  if (originalCookieHeader) {
    originalCookieHeader.split(';').forEach(cookie => {
      const [name, ...rest] = cookie.trim().split('=');
      if (name) {
        cookieMap.set(name, rest.join('='));
      }
    });
  }

  // Parse and override with new cookies
  newCookies.forEach(setCookie => {
    // Set-Cookie format: name=value; attributes...
    const [nameValue] = setCookie.split(';');
    const [name, ...rest] = nameValue.split('=');
    if (name) {
      cookieMap.set(name.trim(), rest.join('='));
    }
  });

  // Rebuild cookie header
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

/**
 * POST /api/bootstrap
 * 
 * Proxies bootstrap request to Titan API with cookies.
 * Handles 401 by attempting token refresh and retry.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    // Get request body
    const body = await request.json().catch(() => ({}));

    // Forward cookies for authentication
    let cookieHeader = request.headers.get('cookie') || '';

    // Get guest session ID and client context headers if present
    // ✅ CRITICAL: Using centralized header constants for consistency
    // Accepts both canonical (X-Client-User-Id) and legacy (X-Client-Context-User) formats
    const guestSessionId = request.headers.get('x-guest-session-id');
    
    // Extract client context using centralized utility
    const clientContext = extractClientContextFromHeaders(
      (name: string) => request.headers.get(name)
    );

    // Build headers for Titan request
    const buildTitanHeaders = (cookies: string): Record<string, string> => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      };

      if (cookies) {
        headers['Cookie'] = cookies;
      }

      if (guestSessionId) {
        headers['X-Guest-Session-Id'] = guestSessionId;
      }

      // ✅ CRITICAL: Forward client context headers using canonical format
      if (clientContext) {
        headers[CLIENT_CONTEXT_HEADERS.CLIENT_USER_ID] = clientContext.clientUserId;
        headers[CLIENT_CONTEXT_HEADERS.ACCOUNTANT_USER_ID] = clientContext.accountantUserId;
        if (clientContext.relationshipId) {
          headers[CLIENT_CONTEXT_HEADERS.RELATIONSHIP_ID] = clientContext.relationshipId;
        }
      }

      return headers;
    };

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
    let response = await fetch(`${TITAN_API_URL}/api/v2/valuations/bootstrap`, {
      method: 'POST',
      headers: buildTitanHeaders(cookieHeader),
      body: JSON.stringify(body),
    });

    // BANK GRADE: Handle 401 by attempting token refresh
    let allSetCookieHeaders: string[] = [];
    
    if (response.status === 401) {
      console.log('[Bootstrap Route] Got 401, attempting token refresh');
      
      const refreshResult = await tryRefreshToken(cookieHeader);
      
      if (refreshResult.success && refreshResult.newCookies.length > 0) {
        // Store new cookies to forward to browser
        allSetCookieHeaders = refreshResult.newCookies;
        
        // Merge new cookies with original cookies for retry request
        const mergedCookies = mergeCookies(cookieHeader, refreshResult.newCookies);
        
        console.log('[Bootstrap Route] Retrying bootstrap with refreshed token');
        
        // Retry the bootstrap request with new cookies
        response = await fetch(`${TITAN_API_URL}/api/v2/valuations/bootstrap`, {
          method: 'POST',
          headers: buildTitanHeaders(mergedCookies),
          body: JSON.stringify(body),
        });
        
        // Add any new cookies from retry response
        const retryCookies = response.headers.getSetCookie();
        allSetCookieHeaders.push(...retryCookies);
      }
    } else {
      // Get cookies from original response
      allSetCookieHeaders = response.headers.getSetCookie();
    }

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
    
    // Create response
    const nextResponse = NextResponse.json(data, {
      status: response.status,
    });

    // Forward all set-cookie headers (including refresh cookies)
    for (const cookie of allSetCookieHeaders) {
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
