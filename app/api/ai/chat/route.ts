/**
 * AI Chat API Route
 * 
 * Proxies chat requests to Titan's Claude-powered AI endpoint.
 * Supports both regular and streaming responses.
 * 
 * Titan endpoints:
 * - POST /api/v2/ai/chat (regular)
 * - POST /api/v2/ai/stream (SSE streaming)
 * 
 * @module api/ai/chat
 */

import { NextRequest, NextResponse } from 'next/server';

const TITAN_API_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 
                      process.env.NEXT_PUBLIC_API_BASE_URL || 
                      'https://api.upswitch.app';

const TIMEOUT_MS = 30_000; // 30s — Claude can take 10-20s

/**
 * POST /api/ai/chat
 * 
 * Sends a chat message to Titan's AI service (Claude).
 * Returns AI response with optional field update suggestions.
 */
export async function POST(request: NextRequest) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body = await request.json();
    const cookieHeader = request.headers.get('cookie') || '';
    const stream = body.stream === true;

    // Choose Titan endpoint based on streaming preference
    const titanEndpoint = stream
      ? `${TITAN_API_URL}/api/v2/ai/stream`
      : `${TITAN_API_URL}/api/v2/ai/chat`;

    // Transform Venus format → Titan format
    // Titan expects: { messages: ChatMessage[], context: ValuationContext }
    const messages = [
      ...(body.history || []).map((msg: any) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content: body.message },
    ];

    const context = {
      sessionId: body.sessionId || '',
      companyName: body.companyName,
      industry: body.formData?.industry,
      countryCode: body.formData?.country_code || body.formData?.country,
      focusedField: body.fieldContext?.field,
      hasRevenue: !!(body.formData?.revenue),
      hasEbitda: !!(body.formData?.ebitda),
      hasOwnerSalary: body.normalizations?.some((n: any) => n.category === 'salary'),
      needsNormalization: body.normalizations?.some((n: any) => n.status === 'pending'),
    };

    const titanResponse = await fetch(titanEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': stream ? 'text/event-stream' : 'application/json',
        ...(cookieHeader && { 'Cookie': cookieHeader }),
      },
      body: JSON.stringify({ messages, context }),
      signal: controller.signal,
    });

    if (!titanResponse.ok) {
      const errorData = await titanResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errorData.message || 'AI service unavailable',
          fallback: true,
        },
        { status: titanResponse.status }
      );
    }

    // For streaming responses, pipe through
    if (stream && titanResponse.body) {
      return new Response(titanResponse.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // Regular JSON response
    const data = await titanResponse.json();
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'AI request timed out', fallback: true },
        { status: 504 }
      );
    }
    console.error('[AI Chat Route] Error:', error instanceof Error ? error.message : error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to connect to AI service',
        fallback: true,
      },
      { status: 503 }
    );
  } finally {
    clearTimeout(timeout);
  }
}
