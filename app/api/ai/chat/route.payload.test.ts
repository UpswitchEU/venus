/**
 * BFF tests for POST /api/ai/chat (Titan payload).
 *
 * Covers message assembly, audience scoping, and valuation context payloads.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  POST,
  request,
  resetAiChatRouteHarness,
  restoreAiChatRouteHarness,
} from './route.testHarness'

beforeEach(resetAiChatRouteHarness)

afterEach(restoreAiChatRouteHarness)

describe('Titan payload', () => {
  it('concatenates history + current user message', async () => {
    await POST(
      request({
        message: 'follow-up',
        history: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'second' },
      { role: 'user', content: 'follow-up' },
    ])
  })

  it('drops malformed history entries and trims the current message', async () => {
    await POST(
      request({
        message: '   follow-up   ',
        history: [
          { role: 'system', content: 'ignore me' },
          { role: 'user', content: '   ' },
          { role: 'assistant', content: ' keep me ' },
          null,
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.messages).toEqual([
      { role: 'assistant', content: 'keep me' },
      { role: 'user', content: 'follow-up' },
    ])
  })

  it('defaults Titan audience to owner scope', async () => {
    await POST(request({ message: 'hi' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('owner')
  })

  it('forwards an explicit advisor audience claim', async () => {
    await POST(request({ message: 'hi', audience: 'advisor' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('advisor')
  })

  it('coerces invalid audience claims to owner scope', async () => {
    await POST(request({ message: 'hi', audience: 'admin' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.audience).toBe('owner')
  })

  it('derives hasRevenue / hasEbitda from formData', async () => {
    await POST(
      request({
        message: 'check',
        formData: { revenue: 50000, ebitda: 10000 },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.hasRevenue).toBe(true)
    expect(body.context.hasEbitda).toBe(true)
  })

  it('hasOwnerSalary flips true when normalizations contains a `salary` category', async () => {
    await POST(
      request({
        message: 'check',
        normalizations: [
          { category: 'rent', status: 'applied' },
          { category: 'salary', status: 'applied' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.hasOwnerSalary).toBe(true)
  })

  it('needsNormalization flips true when any normalization has status=pending', async () => {
    await POST(
      request({
        message: 'check',
        normalizations: [
          { category: 'rent', status: 'applied' },
          { category: 'salary', status: 'pending' },
        ],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.needsNormalization).toBe(true)
  })

  it('passes conversationId + formData + normalizations through when provided', async () => {
    await POST(
      request({
        message: 'hi',
        conversationId: 'conv-1',
        formData: { revenue: 1000 },
        normalizations: [{ category: 'x' }],
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.conversationId).toBe('conv-1')
    expect(body.formData).toEqual({ revenue: 1000 })
    expect(body.normalizations).toEqual([{ category: 'x' }])
  })

  it('preserves valuation reportId on advisor client-scoped valuation explanation turns', async () => {
    const valuationReportId = '48d52144-1fa9-44e7-b077-8dc22310c2ac'

    await POST(
      request({
        message: 'Leg de waarde uit',
        sessionId: 'client_client-123',
        reportId: valuationReportId,
        companyName: 'Bakkerij Klaas',
        conversationId: 'conv-client-123',
        formData: { revenue: 1000000, ebitda: 100000, industry: 'bakery' },
        normalizations: [{ category: 'owner_salary', status: 'accepted' }],
        audience: 'advisor',
        assistantIntent: 'explain_value',
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)

    expect(body.context).toMatchObject({
      sessionId: 'client_client-123',
      reportId: valuationReportId,
      companyName: 'Bakkerij Klaas',
      assistantIntent: 'explain_value',
      industry: 'bakery',
      hasRevenue: true,
      hasEbitda: true,
    })
    expect(body.conversationId).toBe('conv-client-123')
    expect(body.formData).toMatchObject({ revenue: 1000000, ebitda: 100000 })
    expect(body.normalizations).toEqual([{ category: 'owner_salary', status: 'accepted' }])
    expect(body.audience).toBe('advisor')
  })

  it('falls back reportId → sessionId when no explicit reportId', async () => {
    await POST(request({ message: 'hi', sessionId: 'session-xyz' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.reportId).toBe('session-xyz')
  })

  it('uses country_code from formData when present, else country', async () => {
    await POST(
      request({
        message: 'hi',
        formData: { country: 'fallback-NL' },
      })
    )

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.countryCode).toBe('fallback-NL')
  })

  it('forwards locale into Titan context for localized fallback and prompting', async () => {
    await POST(request({ message: 'hallo', locale: 'nl-BE' }))

    const [, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ]
    const body = JSON.parse(init.body as string)
    expect(body.context.locale).toBe('nl-BE')
  })
})
