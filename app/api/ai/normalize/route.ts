/**
 * AI Normalization Analysis Route
 * 
 * Proxies normalization analysis requests to Titan's orchestration endpoint.
 * Used when CSV data is imported and needs AI-powered normalization suggestions.
 * 
 * @module api/ai/normalize
 */

import { NextRequest, NextResponse } from 'next/server';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

const TIMEOUT_MS = 15_000; // 15s

/**
 * POST /api/ai/normalize
 * 
 * Analyzes financial data and suggests normalizations.
 */
export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = await request.json();
    const cookieHeader = request.headers.get('cookie') || '';
    const hasAuth = cookieHeader.includes('upswitch_access_token=');

    if (!hasAuth) {
      return NextResponse.json(
        { success: false, suggestions: [], error: 'Authentication required' },
        { status: 401 },
      );
    }

    const accessTokenMatch = cookieHeader.match(/upswitch_access_token=([^;]+)/);
    const accessToken = accessTokenMatch?.[1]?.trim();

    const titanResponse = await fetch(`${TITAN_API_URL}/api/v2/orchestration/gap-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
        ...(cookieHeader && { Cookie: cookieHeader }),
      },
      body: JSON.stringify({
        sessionId: body.sessionId,
        financialData: body.financialData,
        source: body.source,
        companyName: body.companyName,
        industry: body.industry,
      }),
      signal: controller.signal,
    });

    if (!titanResponse.ok) {
      // Return empty suggestions on failure (non-blocking)
      return NextResponse.json({
        success: true,
        suggestions: [],
        message: 'Analysis service temporarily unavailable',
      });
    }

    const data = await titanResponse.json().catch(() => ({ success: false }));
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[AI Normalize Route] Request timed out after 15s');
    } else {
      console.error('[AI Normalize Route] Error:', error instanceof Error ? error.message : error);
    }
    return NextResponse.json({
      success: true,
      suggestions: [],
      message: 'Analysis service temporarily unavailable',
    });
  } finally {
    clearTimeout(timeout);
  }
}
