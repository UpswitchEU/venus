/**
 * Grootboek Reference Data Proxy
 *
 * Proxies Belgian MAR grootboek code requests to Titan's
 * ReferenceDataController. Public reference data — no auth required.
 *
 * @module api/reference/grootboek
 */

import { NextResponse } from 'next/server';

const TITAN_API_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  'https://api.upswitch.app';

const TIMEOUT_MS = 10_000;

/**
 * GET /api/reference/grootboek
 *
 * Returns Belgian grootboek codes for normalization UI.
 */
export async function GET() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const titanResponse = await fetch(
      `${TITAN_API_URL}/api/v2/reference-data/grootboek`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        next: { revalidate: 3600 },
      },
    );

    clearTimeout(timeout);

    if (!titanResponse.ok) {
      return NextResponse.json(
        { success: false, error: 'Grootboek reference data unavailable' },
        { status: titanResponse.status },
      );
    }

    const data = await titanResponse.json().catch(() => ({ success: false }));
    return NextResponse.json(data);
  } catch (error) {
    clearTimeout(timeout);

    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Request timeout' },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to fetch grootboek data' },
      { status: 502 },
    );
  }
}
