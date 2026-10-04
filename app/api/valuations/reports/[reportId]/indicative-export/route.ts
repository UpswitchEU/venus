import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getTitanAccessTokenFromCookieHeader } from '@/utils/auth/cookieHeader'
import { getBffCookieHeaderForTitan } from '@/utils/bffAuthProxy'
import { fetchJsonWithTimeout } from '@/utils/fetchWithTimeout'
import { getTitanApiUrl } from '@/utils/getTitanApiUrl'
import {
  parseIndicativeExportRequest,
  reportRecord,
  savedIndicativeExportRequest,
} from '@/utils/indicativeReportExport'
import { getTitanClientContextHeaders } from '@/utils/titanClientContextHeaders'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120
const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await params
    if (!reportId || !/^[a-zA-Z0-9_-]+$/.test(reportId))
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400, headers: noStore })
    let options
    try {
      options = parseIndicativeExportRequest(await request.json())
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid request' },
        { status: 400, headers: noStore }
      )
    }
    const cookies = await getBffCookieHeaderForTitan(request)
    if (!cookies.cookieHeader || cookies.duplicateAuthCookies?.length)
      return NextResponse.json(
        { error: 'Conflicting authentication cookies' },
        { status: 401, headers: noStore }
      )
    const upstream = await fetchJsonWithTimeout<Record<string, unknown>>(
      `${getTitanApiUrl(request)}/api/v2/valuations/reports/${encodeURIComponent(reportId)}/indicative-export`,
      {
        method: 'POST',
        headers: {
          Cookie: cookies.cookieHeader,
          'Content-Type': 'application/json',
          ...getTitanClientContextHeaders(request),
          ...(getTitanAccessTokenFromCookieHeader(cookies.cookieHeader)
            ? {
                Authorization: `Bearer ${getTitanAccessTokenFromCookieHeader(cookies.cookieHeader)}`,
              }
            : {}),
        },
        credentials: 'include',
        body: JSON.stringify(options),
        cache: 'no-store',
        signal: request.signal,
      },
      110_000
    )
    const response = upstream.response
    const body = upstream.json
    if (!response.ok)
      return NextResponse.json(body ?? { error: 'Report export unavailable' }, {
        status: response.status,
        headers: noStore,
      })
    const exported = reportRecord(body)
    const manifest = reportRecord(exported.report_manifest)
    if (
      manifest.valuation_run_hash !== options.expected_run_hash ||
      manifest.report_id !== reportId ||
      manifest.report_scope !== 'automated_indicative' ||
      manifest.reviewer_requirement !== 'none'
    )
      throw new Error('Export belongs to another saved run or scope')
    if (options.include_pdf) {
      if (typeof exported.pdf_base64 !== 'string') throw new Error('Requested PDF missing')
      const pdf = Buffer.from(exported.pdf_base64, 'base64')
      const digests = Array.isArray(manifest.artifact_digests) ? manifest.artifact_digests : []
      const matches = digests.map(reportRecord).filter((item) => item.artifact === 'pdf')
      if (
        pdf.length < 500 ||
        pdf.toString('base64') !== exported.pdf_base64 ||
        pdf.subarray(0, 5).toString() !== '%PDF-' ||
        matches.length !== 1 ||
        matches[0]?.sha256 !== createHash('sha256').update(pdf).digest('hex') ||
        matches[0]?.bytes !== pdf.length
      )
        throw new Error('PDF bytes do not match their saved artifact commitment')
    }
    return NextResponse.json(exported, { headers: noStore })
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'))
    return NextResponse.json(
      {
        error: timeout
          ? 'Report export timed out. Please try again.'
          : 'Report export could not be verified.',
      },
      { status: timeout ? 504 : 502, headers: noStore }
    )
  }
}

/** Resolve only the current persisted identity, never a session/browser timestamp. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reportId: string }> }
) {
  try {
    const { reportId } = await params
    if (!reportId || !/^[a-zA-Z0-9_-]+$/.test(reportId))
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400, headers: noStore })
    const language = request.nextUrl.searchParams.get('language') ?? ''
    const cookies = await getBffCookieHeaderForTitan(request)
    if (!cookies.cookieHeader || cookies.duplicateAuthCookies?.length)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: noStore }
      )
    const token = getTitanAccessTokenFromCookieHeader(cookies.cookieHeader)
    const upstream = await fetchJsonWithTimeout<Record<string, unknown>>(
      `${getTitanApiUrl(request)}/api/v2/valuations/reports/${encodeURIComponent(reportId)}`,
      {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
        signal: request.signal,
        headers: {
          Cookie: cookies.cookieHeader,
          ...getTitanClientContextHeaders(request),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      },
      10_000
    )
    if (!upstream.response.ok)
      return NextResponse.json(upstream.json ?? { error: 'Saved report unavailable' }, {
        status: upstream.response.status,
        headers: noStore,
      })
    const identity = savedIndicativeExportRequest(upstream.json, language)
    if (!identity)
      return NextResponse.json(
        { error: 'Saved report is not an indicative V2 run. Reload before exporting.' },
        { status: 409, headers: noStore }
      )
    return NextResponse.json(identity, { headers: noStore })
  } catch {
    return NextResponse.json(
      { error: 'Saved report identity is incomplete. Reload before exporting.' },
      { status: 422, headers: noStore }
    )
  }
}
