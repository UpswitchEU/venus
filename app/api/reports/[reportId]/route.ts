import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Force dynamic rendering - this route uses cookies() which is dynamic
export const dynamic = 'force-dynamic';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { reportId: string } }
) {
  try {
    const titanApiUrl = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'https://api.upswitch.app';
    const { reportId } = params;

    if (!reportId) {
      return NextResponse.json(
        { success: false, message: 'Report ID is required' },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const cookiePairs: string[] = [];
    cookieStore.getAll().forEach(cookie => {
      cookiePairs.push(`${cookie.name}=${cookie.value}`);
    });
    const cookieHeader = cookiePairs.join('; ');

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      Cookie: cookieHeader,
    };

    const guestSessionId = request.headers.get('x-guest-session-id');
    if (guestSessionId) {
      (headers as Record<string, string>)['x-guest-session-id'] = guestSessionId;
    }

    const response = await fetch(`${titanApiUrl}/api/v2/valuations/reports/${reportId}`, {
      method: 'DELETE',
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: 'Failed to delete report' }));
      return NextResponse.json(
        {
          success: false,
          message: errorData.message || 'Failed to delete report',
        },
        { status: response.status }
      );
    }

    const data = await response.json().catch(() => ({ success: true }));
    return NextResponse.json(data);
  } catch (error) {
    console.error('[Venus /api/reports/[reportId]] Error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
