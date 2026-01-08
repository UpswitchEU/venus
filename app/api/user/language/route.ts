/**
 * Language Preference API Route
 * 
 * Proxies language preference updates to Titan API
 */

import { NextRequest, NextResponse } from 'next/server';

/**
 * Update user language preference
 * PUT /api/user/language
 */
export async function PUT(request: NextRequest) {
	try {
		// Get access token from cookie
		const accessToken = request.cookies.get('upswitch_access_token')?.value;

		if (!accessToken) {
			return NextResponse.json(
				{ error: 'Unauthorized' },
				{ status: 401 }
			);
		}

		// Parse request body
		const body = await request.json();
		const { language } = body;

		// Validate language
		if (!language || !['en', 'nl'].includes(language)) {
			return NextResponse.json(
				{ error: 'Invalid language. Must be "en" or "nl"' },
				{ status: 400 }
			);
		}

		// Get backend URL from environment
		const backendUrl = process.env.VITE_BACKEND_URL || process.env.VITE_API_BASE_URL || 'https://api.upswitch.app';
		
		// Forward request to Titan API
		const titanApiUrl = `${backendUrl}/api/v2/users/language`;
		
		const response = await fetch(titanApiUrl, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${accessToken}`,
			},
			body: JSON.stringify({ language }),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({ message: 'Failed to update language preference' }));
			return NextResponse.json(
				{ error: error.message || 'Failed to update language preference' },
				{ status: response.status }
			);
		}

		const data = await response.json();

		return NextResponse.json(data, { status: 200 });
	} catch (error) {
		console.error('Error updating language preference:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
}



