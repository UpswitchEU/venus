import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), cookies: vi.fn() }))
vi.mock('@/utils/getTitanApiUrl', () => ({ getTitanApiUrl: () => 'https://api.example' }))
vi.mock('@/utils/bffAuthProxy', () => ({ getBffCookieHeaderForTitan: () => mocks.cookies() }))
vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = await mocks.fetch(...args)
    return { response, json: await response.json() }
  },
}))

import { POST } from './route'

const options = {
  expected_run_hash: 'a'.repeat(64),
  expected_updated_at: '2026-10-02T06:00:00.000Z',
  language: 'nl',
  include_pdf: true,
}
const pdf = Buffer.from(`%PDF-1.7\n${' '.repeat(600)}`)
const exported = () => ({
  html_report: '<html lang="nl"><body>Indicatieve waarde 0.00 – 150.08 GBP</body></html>',
  report_data: {
    valuation: '150.08',
    valuation_low: '0.00',
    currency: 'GBP',
    raw_equity: '-1000000.00',
  },
  pdf_base64: pdf.toString('base64'),
  report_manifest: {
    report_id: 'report-1',
    valuation_run_hash: options.expected_run_hash,
    report_scope: 'automated_indicative',
    reviewer_requirement: 'none',
    artifact_digests: [
      {
        artifact: 'pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        bytes: pdf.length,
      },
    ],
  },
})
const request = (body: unknown = options) =>
  new NextRequest('https://valuation.example/api/valuations/reports/report-1/indicative-export', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Relationship-Id': 'relationship-1' },
    body: JSON.stringify(body),
  })
const context = { params: Promise.resolve({ reportId: 'report-1' }) }
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
describe('authenticated indicative export BFF', () => {
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.cookies.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=token',
      duplicateAuthCookies: [],
    })
  })
  it('preserves PDF bytes, exact range, currency and negative bridge without pricing', async () => {
    const producer = exported()
    mocks.fetch.mockResolvedValue(response(producer))
    const result = await POST(request(), context)
    expect(result.status).toBe(200)
    expect(await result.json()).toEqual(producer)
    expect(result.headers.get('cache-control')).toContain('no-store')
    expect(mocks.fetch).toHaveBeenCalledWith(
      'https://api.example/api/v2/valuations/reports/report-1/indicative-export',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(options),
        credentials: 'include',
        headers: expect.objectContaining({ Cookie: 'upswitch_access_token=token' }),
      }),
      110000
    )
  })
  it.each([
    401, 403, 402, 409, 422, 503,
  ])('preserves backend refusal %s without legacy generation', async (status) => {
    mocks.fetch.mockResolvedValue(response({ error: 'Reload before exporting' }, status))
    const result = await POST(request(), context)
    expect(result.status).toBe(status)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
  it.each([
    'hash',
    'pdf',
    'digest',
    'scope',
    'duplicate',
  ])('rejects damaged %s export', async (kind) => {
    const data = exported()
    if (kind === 'hash') data.report_manifest.valuation_run_hash = 'b'.repeat(64)
    if (kind === 'pdf') data.pdf_base64 = Buffer.from('not PDF').toString('base64')
    if (kind === 'digest')
      data.report_manifest.artifact_digests = [
        { artifact: 'pdf', sha256: 'c'.repeat(64), bytes: pdf.length },
      ]
    if (kind === 'scope') data.report_manifest.report_scope = 'attested'
    if (kind === 'duplicate')
      data.report_manifest.artifact_digests.push({
        artifact: 'pdf',
        sha256: createHash('sha256').update(pdf).digest('hex'),
        bytes: pdf.length,
      })
    mocks.fetch.mockResolvedValue(response(data))
    expect((await POST(request(), context)).status).toBe(502)
  })
  it('rejects incomplete identity before network', async () => {
    expect((await POST(request({ ...options, expected_updated_at: '' }), context)).status).toBe(400)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('rejects absent or conflicting auth cookies before network', async () => {
    mocks.cookies.mockResolvedValue({ cookieHeader: '', duplicateAuthCookies: [] })
    expect((await POST(request(), context)).status).toBe(401)
    mocks.cookies.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=token',
      duplicateAuthCookies: [{ name: 'upswitch_access_token' }],
    })
    expect((await POST(request(), context)).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
})
