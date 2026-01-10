/**
 * Refresh Token Route - Venus
 * 
 * Proxies to Titan API to refresh access tokens using HTTP-only refresh cookies.
 * This ensures cookies are properly validated and set server-side.
 * 
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
	try {
		const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app';

		// Use Next.js cookies() helper to read cookies properly
		const cookieStore = await cookies();
		const refreshToken = cookieStore.get('upswitch_refresh_token');
		
		// Build cookie header manually from cookie store
		const cookiePairs: string[] = [];
		cookieStore.getAll().forEach(cookie => {
			cookiePairs.push(`${cookie.name}=${cookie.value}`);
		});
		const cookieHeader = cookiePairs.join('; ');
		
		console.log('[Venus /api/auth/refresh] Refreshing tokens:', {
			hasRefreshToken: !!refreshToken,
			cookieCount: cookiePairs.length,
		});

		if (!refreshToken) {
			// No refresh token available
			return NextResponse.json(
				{ error: 'No refresh token available' },
				{ status: 401 }
			);
		}

		// Forward request to Titan API with cookies
		const response = await fetch(`${titanApiUrl}/api/v2/auth/refresh`, {
			method: 'POST',
			headers: {
				Cookie: cookieHeader,
				'Content-Type': 'application/json',
			},
		});

		if (!response.ok) {
			console.log('[Venus /api/auth/refresh] Titan response not OK:', {
				status: response.status,
				statusText: response.statusText,
			});
			return NextResponse.json(
				{ error: 'Token refresh failed' },
				{ status: response.status }
			);
		}

		const data = await response.json();
		
		// Create response with wrapped data (match Mercury's format)
		const nextResponse = NextResponse.json({
			success: true,
			data: data,
			message: 'Token refreshed successfully',
		});
		
		// Forward any Set-Cookie headers from Titan to the client
		// Use getSetCookie() for proper multi-cookie handling (like Mercury)
		const setCookieHeaders = response.headers.getSetCookie();
		setCookieHeaders.forEach(cookie => {
			nextResponse.headers.append('Set-Cookie', cookie);
		});
		
		console.log('[Venus /api/auth/refresh] Refresh successful:', {
			setCookieCount: setCookieHeaders.length,
		});

		return nextResponse;
	} catch (error) {
		console.error('[Venus /api/auth/refresh] Error:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
