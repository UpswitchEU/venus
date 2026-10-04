import { createHash } from 'node:crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { getTitanAccessTokenFromCookieHeader } from './auth/cookieHeader'
import { getBffCookieHeaderForTitan } from './bffAuthProxy'
import { fetchJsonWithTimeout } from './fetchWithTimeout'
import { getTitanApiUrl } from './getTitanApiUrl'
import { reportRecord } from './indicativeReportExport'
import { parsePartialExportRequest } from './partialReportExport'
import { getTitanClientContextHeaders } from './titanClientContextHeaders'

const noStore = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' }

export async function proxyPartialReport(
  request: NextRequest,
  reportId: string,
  endpoint: 'partial-calculation' | 'partial-export'
) {
  try {
    if (!reportId || !/^[a-zA-Z0-9_-]+$/.test(reportId))
      return NextResponse.json({ error: 'Invalid report ID' }, { status: 400, headers: noStore })
    let options: Record<string, unknown> | undefined
    if (request.method === 'POST') {
      try {
        const body = await request.json()
        options =
          endpoint === 'partial-export' ? parsePartialExportRequest(body) : reportRecord(body)
        if (
          endpoint === 'partial-calculation' &&
          (!Object.keys(reportRecord(options.input)).length ||
            Object.keys(options).some(
              (key) => !['input', 'expected_updated_at', 'expected_revision_sha256'].includes(key)
            ))
        )
          throw new Error('Exact input and saved revision required')
      } catch {
        return NextResponse.json(
          { error: 'Invalid partial assessment request' },
          { status: 400, headers: noStore }
        )
      }
    }
    const cookies = await getBffCookieHeaderForTitan(request)
    if (!cookies.cookieHeader || cookies.duplicateAuthCookies?.length)
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401, headers: noStore }
      )
    const upstream = await fetchJsonWithTimeout<Record<string, unknown>>(
      `${getTitanApiUrl(request)}/api/v2/valuations/reports/${encodeURIComponent(reportId)}/${endpoint}`,
      {
        method: request.method,
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
        body: options ? JSON.stringify(options) : undefined,
        cache: 'no-store',
        signal: request.signal,
      },
      110_000
    )
    const body = upstream.json
    if (!upstream.response.ok)
      return NextResponse.json(body ?? { error: 'Partial assessment unavailable' }, {
        status: upstream.response.status,
        headers: noStore,
      })
    if (endpoint === 'partial-export') {
      const exported = reportRecord(body)
      const manifest = reportRecord(exported.report_manifest)
      const assessment = reportRecord(exported.partial_valuation)
      if (
        manifest.schema_version !== 'partial_report_manifest.v1' ||
        manifest.report_id !== reportId ||
        manifest.content_sha256 !== options?.expected_content_sha256 ||
        assessment.content_sha256 !== manifest.content_sha256 ||
        manifest.assessment_id !== assessment.assessment_id ||
        manifest.evidence_revision_id !== assessment.evidence_revision_id ||
        manifest.language !== options?.language ||
        manifest.reviewer_requirement !== 'none' ||
        manifest.private_save_allowed !== true ||
        manifest.certification_claim !== false ||
        typeof exported.html_report !== 'string'
      )
        throw new Error('Partial report identity mismatch')
      const html = Buffer.from(exported.html_report, 'utf8')
      if (
        manifest.html_bytes !== html.length ||
        manifest.html_sha256 !== createHash('sha256').update(html).digest('hex')
      )
        throw new Error('Partial report HTML commitment mismatch')
      if (options?.include_pdf) {
        if (typeof exported.pdf_base64 !== 'string') throw new Error('Requested PDF missing')
        const pdf = Buffer.from(exported.pdf_base64, 'base64')
        if (
          pdf.length < 500 ||
          pdf.toString('base64') !== exported.pdf_base64 ||
          pdf.subarray(0, 5).toString() !== '%PDF-' ||
          manifest.pdf_bytes !== pdf.length ||
          manifest.pdf_sha256 !== createHash('sha256').update(pdf).digest('hex')
        )
          throw new Error('Partial report PDF commitment mismatch')
      } else if (
        exported.pdf_base64 !== null ||
        manifest.pdf_bytes !== null ||
        manifest.pdf_sha256 !== null
      )
        throw new Error('Unrequested PDF returned')
    }
    return NextResponse.json(body, { headers: noStore })
  } catch (error) {
    const timeout =
      error instanceof Error &&
      (error.name === 'AbortError' || error.message.toLowerCase().includes('timeout'))
    return NextResponse.json(
      {
        error: timeout
          ? 'Partial report timed out. Please try again.'
          : 'Partial report could not be verified.',
      },
      { status: timeout ? 504 : 502, headers: noStore }
    )
  }
}
