/**
 * Get Current User Route - Venus
 * 
 * Proxies to Titan API to get current user from HTTP-only cookies.
 * This ensures cookies are properly validated server-side.
 * 
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
	try {
		const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app';

		// Use Next.js cookies() helper to read cookies properly
		const cookieStore = await cookies();
		const accessToken = cookieStore.get('upswitch_access_token');
		const refreshToken = cookieStore.get('upswitch_refresh_token');
		
		// Also check request headers for cookies (in case cookies() helper doesn't catch them)
		const requestCookieHeader = request.headers.get('cookie') || '';
		
		// Build cookie header manually from cookie store
		const cookiePairs: string[] = [];
		cookieStore.getAll().forEach(cookie => {
			cookiePairs.push(`${cookie.name}=${cookie.value}`);
		});
		const cookieHeader = cookiePairs.join('; ');
		
		// Cookie state check (silent - only log in development)
		if (process.env.NODE_ENV === 'development') {
			console.log('[Venus /api/auth/me] Cookie state:', {
				hasAccessToken: !!accessToken,
				hasRefreshToken: !!refreshToken,
				totalCookies: cookiePairs.length,
			});
		}

		if (!accessToken && !refreshToken) {
			// Return 401 with isAuthenticated: false (not an error condition)
			return NextResponse.json(
				{ isAuthenticated: false },
				{ status: 401 }
			);
		}

		// Forward request to Titan API with cookies (silent)
		
		const response = await fetch(`${titanApiUrl}/api/v2/auth/me`, {
			method: 'GET',
			headers: {
				// Forward cookies from the request
				Cookie: cookieHeader,
			},
			// CRITICAL: Don't include credentials here - we're manually forwarding cookies
			// Including credentials would try to send cookies from Venus's domain, not Titan's
		});

		if (!response.ok) {
			// User not authenticated - this is a valid state, not an error
			return NextResponse.json(
				{ isAuthenticated: false },
				{ status: 401 }
			);
		}

		const data = await response.json();

		// Return with no-cache headers to ensure fresh auth state
		return NextResponse.json(data, {
			headers: {
				'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0',
			},
		});
	} catch (error) {
		console.error('[Venus /api/auth/me] Error:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
