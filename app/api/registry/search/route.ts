/**
 * Registry Search API Proxy Route (Venus)
 *
 * Proxies KBO (Belgian Company Registry) search requests to the Titan backend API
 */

import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL =
	process.env.NEXT_PUBLIC_BACKEND_URL ||
	process.env.NEXT_PUBLIC_API_BASE_URL ||
	'https://api.upswitch.app';

export async function POST(request: NextRequest) {
	try {
		// Parse request body
		const body = await request.json();

		console.log('[Venus Registry API] Search request:', {
			company_name: body.company_name,
			country_code: body.country_code,
			limit: body.limit,
		});

		// Validate required fields
		if (!body.company_name || body.company_name.length < 2) {
			return NextResponse.json(
				{
					success: false,
					results: [],
					error: 'Company name must be at least 2 characters long',
				},
				{ status: 400 }
			);
		}

		// Forward request to Titan backend
		const backendResponse = await fetch(
			`${BACKEND_URL}/api/v1/registry/search`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: JSON.stringify({
					company_name: body.company_name,
					country_code: body.country_code || 'BE',
					limit: body.limit || 10,
				}),
			}
		);

		// Handle non-OK responses
		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error('[Venus Registry API] Backend error:', {
				status: backendResponse.status,
				statusText: backendResponse.statusText,
				error: errorText,
			});

			return NextResponse.json(
				{
					success: false,
					results: [],
					error: `Backend error: ${backendResponse.statusText}`,
				},
				{ status: backendResponse.status }
			);
		}

		// Parse and return backend response
		const data = await backendResponse.json();

		console.log('[Venus Registry API] Search successful:', {
			results_count: data.results?.length || 0,
			total_results: data.total_results,
		});

		return NextResponse.json(data);
	} catch (error) {
		console.error('[Venus Registry API] Error:', error);

		return NextResponse.json(
			{
				success: false,
				results: [],
				error:
					error instanceof Error ? error.message : 'Failed to search companies',
			},
			{ status: 500 }
		);
	}
}
