/**
 * Registry Search API Proxy Route (Venus)
 *
 * Proxies KBO (Belgian Company Registry) search requests to the Titan backend API.
 * Uses canonical /api/v2/registry/search (same as Mercury), with v1 fallback on 404.
 * Includes 10s timeout to prevent hanging requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTitanApiUrl } from '@/utils/getTitanApiUrl';

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();

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

		const titanUrl = getTitanApiUrl(request);
		const payload = {
			company_name: body.company_name,
			country_code: body.country_code || 'BE',
			limit: body.limit || 10,
		};

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 10000);

		const fetchOptions = {
			method: 'POST' as const,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify(payload),
			signal: controller.signal,
		};

		let backendResponse: Response;
		try {
			backendResponse = await fetch(`${titanUrl}/api/v2/registry/search`, fetchOptions);
		} catch (fetchError) {
			clearTimeout(timeout);
			const isTimeout =
				fetchError instanceof Error && fetchError.name === 'AbortError';
			const errorMsg = isTimeout
				? 'Backend request timed out after 10s'
				: `Cannot reach backend at ${titanUrl}`;

			console.error('[Venus Registry API] Connection error:', {
				backendUrl: titanUrl,
				error: fetchError instanceof Error ? fetchError.message : String(fetchError),
				isTimeout,
			});

			return NextResponse.json(
				{ success: false, results: [], error: errorMsg },
				{ status: 503 }
			);
		}

		// 404 fallback: try v1 endpoint (defensive, same as Mercury)
		if (backendResponse.status === 404) {
			clearTimeout(timeout);
			try {
				const fallbackController = new AbortController();
				const fallbackTimeout = setTimeout(() => fallbackController.abort(), 10000);
				const fallbackRes = await fetch(`${titanUrl}/api/v1/registry/search`, {
					...fetchOptions,
					signal: fallbackController.signal,
				});
				clearTimeout(fallbackTimeout);
				if (fallbackRes.ok) {
					const data = await fallbackRes.json();
					return NextResponse.json(data);
				}
			} catch {
				// Ignore fallback errors
			}
		} else {
			clearTimeout(timeout);
		}

		if (!backendResponse.ok) {
			const errorText = await backendResponse.text();
			console.error('[Venus Registry API] Backend error:', {
				status: backendResponse.status,
				statusText: backendResponse.statusText,
				error: errorText,
			});

			const userMessage =
				backendResponse.status === 503
					? 'Registry service temporarily unavailable. Please try again later.'
					: `Backend error: ${backendResponse.status} ${backendResponse.statusText}`;

			return NextResponse.json(
				{ success: false, results: [], error: userMessage },
				{ status: backendResponse.status }
			);
		}

		const data = await backendResponse.json();
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
