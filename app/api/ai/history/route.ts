/**
 * AI History API Route
 *
 * Proxies conversation history requests to Titan.
 * GET /api/ai/history?reportId=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/utils/fetchWithTimeout';

export const dynamic = 'force-dynamic';

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app';

export async function GET(request: NextRequest) {
  try {
    const reportId = request.nextUrl.searchParams.get('reportId');
    if (!reportId) {
      return NextResponse.json({ success: false, error: 'reportId is required' }, { status: 400 });
    }

    const cookieHeader = request.headers.get('cookie') || '';
    const hasAuth = cookieHeader.includes('upswitch_access_token=');

    if (!hasAuth) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 },
      );
    }

    const accessTokenMatch = cookieHeader.match(/upswitch_access_token=([^;]+)/);
    const accessToken = accessTokenMatch?.[1]?.trim();

    const titanResponse = await fetchWithTimeout(
      `${TITAN_API_URL}/api/v2/ai/conversations/${encodeURIComponent(reportId)}/history`,
      {
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken && { Authorization: `Bearer ${accessToken}` }),
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
      },
      10_000,
    );

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 },
      );
    }

    const data = await titanResponse.json().catch(() => ({ success: false, messages: [] }));
    return NextResponse.json(data);
  } catch (error) {
    console.error('[AI History Route] Error:', error instanceof Error ? error.message : error);
    const isTimeout = error instanceof Error && error.message.includes('timeout');
    return NextResponse.json(
      { success: true, conversationId: null, messages: [] },
      { status: isTimeout ? 504 : 200 },
    );
  }
}
