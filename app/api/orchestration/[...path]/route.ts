/**
 * Orchestration API Route (Catch-all)
 * 
 * Proxies all orchestration requests to Titan.
 * Used for gap analysis, next-action suggestions, field validation, and report generation.
 * 
 * Titan endpoints:
 * - POST /api/v2/orchestration/gap-analysis
 * - POST /api/v2/orchestration/:sessionId/next-action
 * - POST /api/v2/orchestration/:sessionId/message
 * - POST /api/v2/orchestration/:sessionId/stream
 * - GET  /api/v2/orchestration/:sessionId/suggestion
 * - POST /api/v2/orchestration/validate
 * - POST /api/v2/orchestration/calculate
 * - POST /api/v2/orchestration/generate-report
 * - POST /api/v2/orchestration/:sessionId/focus
 * - GET  /api/v2/orchestration/:sessionId/state
 * 
 * @module api/orchestration
 */

import { NextRequest, NextResponse } from 'next/server';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

function buildTitanUrl(path: string[], searchParams: URLSearchParams): string {
  const pathStr = path.join('/');
  const qs = searchParams.toString();
  return `${TITAN_API_URL}/api/v2/orchestration/${pathStr}${qs ? `?${qs}` : ''}`;
}

async function proxyToTitan(
  request: NextRequest,
  params: { path: string[] },
  method: string
): Promise<NextResponse> {
  try {
    const cookieHeader = request.headers.get('cookie') || '';
    const url = buildTitanUrl(params.path, request.nextUrl.searchParams);

    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
    };

    if (['POST', 'PUT', 'PATCH'].includes(method)) {
      const body = await request.json().catch(() => ({}));
      fetchOptions.body = JSON.stringify(body);
    }

    const titanResponse = await fetch(url, fetchOptions);

    // Handle streaming responses
    if (titanResponse.headers.get('content-type')?.includes('text/event-stream') && titanResponse.body) {
      return new NextResponse(titanResponse.body as any, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    if (titanResponse.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const data = await titanResponse.json().catch(() => ({ success: false }));
    return NextResponse.json(data, { status: titanResponse.status });
  } catch (error) {
    console.error(`[Orchestration Route] ${method} error:`, error instanceof Error ? error.message : error);
    return NextResponse.json(
      { success: false, error: 'Orchestration service unavailable' },
      { status: 503 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToTitan(request, await params, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  return proxyToTitan(request, await params, 'POST');
}
