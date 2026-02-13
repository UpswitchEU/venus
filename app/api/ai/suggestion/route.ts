/**
 * AI Suggestion API Route
 * 
 * Proxies field-specific AI suggestion requests to Titan.
 * Used for contextual help when users click the help icon on form fields.
 * 
 * @module api/ai/suggestion
 */

import { NextRequest, NextResponse } from 'next/server';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

const TIMEOUT_MS = 15_000; // 15s

/**
 * POST /api/ai/suggestion
 * 
 * Gets AI-powered suggestion for a specific field.
 */
export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = await request.json();
    const cookieHeader = request.headers.get('cookie') || '';

    const titanResponse = await fetch(`${TITAN_API_URL}/api/v2/ai/generate-question`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Suggestion service unavailable' },
        { status: titanResponse.status }
      );
    }

    const data = await titanResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Suggestion request timed out' },
        { status: 504 }
      );
    }
    console.error('[AI Suggestion Route] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Failed to get suggestion' },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
