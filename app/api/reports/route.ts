/**
 * Reports Route - Venus
 * 
 * Proxies to Titan API to get reports list.
 * Handles both authenticated and guest users.
 * 
 * Following Mercury's proven pattern for cross-subdomain authentication.
 */

import { cookies, headers } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
	try {
		const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://api.upswitch.app';
		
		// Get query parameters
		const searchParams = request.nextUrl.searchParams;
		const limit = searchParams.get('limit') || '20';
		const offset = searchParams.get('offset') || '0';
		
		// Build cookie header from request
		const cookieStore = await cookies();
		const cookiePairs: string[] = [];
		cookieStore.getAll().forEach(cookie => {
			cookiePairs.push(`${cookie.name}=${cookie.value}`);
		});
		const cookieHeader = cookiePairs.join('; ');
		
		// Get guest session ID from headers if present
		const requestHeaders = await headers();
		const guestSessionId = requestHeaders.get('x-guest-session-id');
		
		// Build headers for Titan request
		const titanHeaders: HeadersInit = {
			Cookie: cookieHeader,
		};
		
		// Forward guest session ID if present
		if (guestSessionId) {
			titanHeaders['x-guest-session-id'] = guestSessionId;
		}
		
		// Forward request to Titan API
		const response = await fetch(
			`${titanApiUrl}/api/v2/reports?limit=${limit}&offset=${offset}`,
			{
				method: 'GET',
				headers: titanHeaders,
			}
		);

		if (!response.ok) {
			console.error('[Venus /api/reports] Titan response not OK:', {
				status: response.status,
				statusText: response.statusText,
			});
			return NextResponse.json(
				{ error: 'Failed to fetch reports' },
				{ status: response.status }
			);
		}

		const data = await response.json();
		
		return NextResponse.json(data, {
			headers: {
				'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
				'Pragma': 'no-cache',
				'Expires': '0',
			},
		});
	} catch (error) {
		console.error('[Venus /api/reports] Error:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}
