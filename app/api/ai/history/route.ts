/**
 * AI History API Route
 *
 * Proxies conversation history requests to Titan.
 * GET /api/ai/history?reportId=xxx
 */

import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

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

    const cookieStore = await cookies();
    const authCookie = cookieStore.get('sb-access-token') || cookieStore.get('accessToken');
    const cookieHeader = request.headers.get('cookie') || '';

    if (!authCookie) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 },
      );
    }

    const titanResponse = await fetch(
      `${TITAN_API_URL}/api/v2/ai/conversations/${encodeURIComponent(reportId)}/history`,
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authCookie.value}`,
          ...(cookieHeader && { Cookie: cookieHeader }),
        },
      },
    );

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: true, conversationId: null, messages: [] },
        { status: 200 },
      );
    }

    const data = await titanResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('[AI History Route] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: true, conversationId: null, messages: [] },
      { status: 200 },
    );
  }
}
