import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import unknownBasis from './__fixtures__/partial-assessment.v2.json'
import fixtures from './__fixtures__/partial-assessments.v1.json'
import governed from './__fixtures__/partial-assessments.v3.json'
import producer from './__fixtures__/partial-report.v1.json'
import { savedPartialAssessment, savedPartialExportRequest } from './partialReportExport'

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), cookies: vi.fn() }))
vi.mock('@/utils/getTitanApiUrl', () => ({ getTitanApiUrl: () => 'https://api.example' }))
vi.mock('@/utils/bffAuthProxy', () => ({ getBffCookieHeaderForTitan: () => mocks.cookies() }))
vi.mock('@/utils/fetchWithTimeout', () => ({
  fetchJsonWithTimeout: async (...args: unknown[]) => {
    const response = await mocks.fetch(...args)
    return { response, json: await response.json() }
  },
}))

import {
  POST as calculate,
  GET as load,
} from '../../app/api/valuations/reports/[reportId]/partial-calculation/route'
import { POST } from '../../app/api/valuations/reports/[reportId]/partial-export/route'

const reportId = '11111111-1111-4111-8111-111111111111'
const context = { params: Promise.resolve({ reportId }) }
const report = {
  updated_at: '2026-10-02T06:00:00.000Z',
  valuation_result: { partial_valuation: fixtures[0] },
}
const options = savedPartialExportRequest(report, 'en')
if (!options) throw new Error('Producer fixture has no saved identity')
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const request = (body: unknown = options) =>
  new NextRequest('https://valuation.example/api/reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
describe('partial saved assessment consumer contract', () => {
  it.each(
    governed
  )('keeps source-governed diagnostics outside the published valuation ($assessment_id)', (assessment) => {
    const saved = { ...report, valuation_result: { partial_valuation: assessment } }
    expect(savedPartialAssessment(saved)).toBe(assessment)
    expect(savedPartialExportRequest(saved, 'nl')?.expected_content_sha256).toBe(
      assessment.content_sha256
    )
    expect(
      Object.values(assessment.methods).every(
        (method) => !method.available && method.value === null
      )
    ).toBe(true)
  })
  beforeEach(() => {
    mocks.fetch.mockReset()
    mocks.cookies.mockResolvedValue({
      cookieHeader: 'upswitch_access_token=token',
      duplicateAuthCookies: [],
    })
  })
  it('loads an unknown-basis v2 assessment without projecting a zero result', async () => {
    const saved = { ...report, valuation_result: { partial_valuation: unknownBasis } }
    expect(savedPartialAssessment(saved)).toBe(unknownBasis)
    expect(savedPartialExportRequest(saved, 'fr')?.expected_content_sha256).toBe(
      unknownBasis.content_sha256
    )
    mocks.fetch.mockResolvedValue(response({ report_id: reportId, ...saved }))
    const loaded = await load(new NextRequest('https://valuation.example/api/reports'), context)
    expect(
      (await loaded.json()).valuation_result.partial_valuation.inputs.financials
    ).toMatchObject({ currency: null, fiscal_year: null, revenue: '100.05', ebitda: null })
  })
  it('preserves producer zero bound, absent earnings and control basis', () => {
    expect(savedPartialAssessment(report)).toEqual(fixtures[0])
    expect(fixtures[0].methods.omzet_multiple.enterprise_value_low).toBe('0.00')
    expect(fixtures[0].inputs.financials.ebitda).toBeNull()
    expect(options.expected_content_sha256).toBe(fixtures[0].content_sha256)
    expect(options.expected_updated_at).toBe(report.updated_at)
  })
  it('passes the real producer HTML/PDF and manifest without changing values', async () => {
    mocks.fetch.mockResolvedValue(response(producer))
    const rendered = await POST(request(), context)
    expect(rendered.status).toBe(200)
    expect(await rendered.json()).toEqual(producer)
    expect(rendered.headers.get('cache-control')).toContain('no-store')
    expect(mocks.fetch.mock.calls[0][0]).toContain('/partial-export')
  })
  it.each([
    'hash',
    'html',
    'pdf',
    'language',
    'certification',
    'evidence',
  ])('rejects corrupted %s', async (kind) => {
    const changed = structuredClone(producer)
    if (kind === 'hash') changed.report_manifest.content_sha256 = 'a'.repeat(64)
    if (kind === 'html') changed.html_report += ' repriced'
    if (kind === 'pdf') changed.pdf_base64 = btoa('%PDF-replaced')
    if (kind === 'language') changed.report_manifest.language = 'fr'
    if (kind === 'certification') changed.report_manifest.certification_claim = true as never
    if (kind === 'evidence') changed.report_manifest.evidence_revision_id = 'different source'
    mocks.fetch.mockResolvedValue(response(changed))
    expect((await POST(request(), context)).status).toBe(502)
  })
  it.each([401, 402, 409, 422, 503])('keeps refusal %s without legacy fallback', async (status) => {
    mocks.fetch.mockResolvedValue(response({ error: 'refused' }, status))
    expect((await POST(request(), context)).status).toBe(status)
    expect(mocks.fetch).toHaveBeenCalledTimes(1)
  })
  it('rejects missing saved identity and conflicting cookies before export', async () => {
    expect((await POST(request({ ...options, expected_updated_at: '' }), context)).status).toBe(400)
    mocks.cookies.mockResolvedValue({
      cookieHeader: 'token',
      duplicateAuthCookies: ['upswitch_access_token'],
    })
    expect((await POST(request(), context)).status).toBe(401)
    expect(mocks.fetch).not.toHaveBeenCalled()
  })
  it('does not reinterpret a damaged partial report as a legacy report', () => {
    expect(() => savedPartialAssessment({ valuation_method: 'partial_assessment' })).toThrow()
    expect(() => savedPartialExportRequest({ ...report, updated_at: undefined }, 'en')).toThrow()
  })
  it('forwards exact decimal intake and serves authenticated revision loading', async () => {
    const body = {
      input: fixtures[0].inputs,
      expected_revision_sha256: 'a'.repeat(64),
      expected_updated_at: report.updated_at,
    }
    mocks.fetch.mockImplementation(async () =>
      response({ report_id: reportId, partial_valuation: fixtures[0] })
    )
    expect((await calculate(request(body), context)).status).toBe(200)
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual(body)
    const loaded = await load(new NextRequest('https://valuation.example/api/reports'), context)
    expect(loaded.status).toBe(200)
    expect(mocks.fetch.mock.calls[1][1].cache).toBe('no-store')
  })
})
