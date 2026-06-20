import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getContextHeaders: vi.fn<() => Record<string, string>>(),
}))

vi.mock('../../stores/clientContext', () => ({
  useClientContext: {
    getState: () => ({
      getContextHeaders: mocks.getContextHeaders,
    }),
  },
}))

import { buildAIChatRequestPayload, getAIChatRequestHeaders } from './AIChatRequestPayload'

describe('buildAIChatRequestPayload', () => {
  beforeEach(() => {
    mocks.getContextHeaders.mockReturnValue({})
  })

  it('builds the canonical non-streaming BFF payload', () => {
    const history = [
      { role: 'user' as const, content: 'What is the company worth?' },
      { role: 'assistant' as const, content: 'I will check the valuation context.' },
    ]

    const payload = buildAIChatRequestPayload(
      {
        message: 'Recover this turn',
        sessionId: 'session-1',
        companyName: 'Acme NV',
        conversationId: 'conversation-1',
        fieldContext: { field: 'ebitda', label: 'EBITDA 2025', value: 120_000 },
        normalizations: [{ id: 'norm-1' }],
        formData: { revenue: 1_000_000 },
        recoverFromStreamTurn: true,
        audience: 'advisor',
        surfaceIntent: 'add_client',
        assistantIntent: 'explain_value',
        locale: 'nl',
        history,
      },
      { stream: false }
    )

    expect(payload).toMatchObject({
      message: 'Recover this turn',
      sessionId: 'session-1',
      reportId: 'session-1',
      companyName: 'Acme NV',
      conversationId: 'conversation-1',
      fieldContext: { field: 'ebitda', label: 'EBITDA 2025', value: 120_000 },
      normalizations: [{ id: 'norm-1' }],
      formData: { revenue: 1_000_000 },
      stream: false,
      recoverFromStreamTurn: true,
      audience: 'advisor',
      surfaceIntent: 'add_client',
      assistantIntent: 'explain_value',
      locale: 'nl',
      history,
    })
  })

  it('does not forward stream-turn recovery on streaming requests', () => {
    const payload = buildAIChatRequestPayload(
      {
        message: 'Stream this turn',
        sessionId: 'session-1',
        reportId: 'report-1',
        recoverFromStreamTurn: true,
      },
      { stream: true }
    )

    expect(payload).toMatchObject({
      message: 'Stream this turn',
      sessionId: 'session-1',
      reportId: 'report-1',
      stream: true,
    })
    expect(payload).not.toHaveProperty('recoverFromStreamTurn')
  })
})

describe('getAIChatRequestHeaders', () => {
  beforeEach(() => {
    mocks.getContextHeaders.mockReturnValue({})
  })

  it('adds correlation, content type, and client context headers by default', () => {
    mocks.getContextHeaders.mockReturnValue({
      'X-Client-User-Id': 'client-1',
      'X-Relationship-Id': 'relationship-1',
    })

    const headers = getAIChatRequestHeaders()

    expect(headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Client-User-Id': 'client-1',
      'X-Relationship-Id': 'relationship-1',
    })
    expect(headers['X-Correlation-ID']).toMatch(/^cid_[a-z0-9]+_[a-f0-9]+$/)
  })

  it('omits content type for history GET requests', () => {
    const headers = getAIChatRequestHeaders(false)

    expect(headers).not.toHaveProperty('Content-Type')
    expect(headers['X-Correlation-ID']).toMatch(/^cid_[a-z0-9]+_[a-f0-9]+$/)
  })
})
