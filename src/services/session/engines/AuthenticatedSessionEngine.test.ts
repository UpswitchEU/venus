import { beforeEach, describe, expect, it, vi } from 'vitest'

const sessionServiceMocks = vi.hoisted(() => ({
  saveSession: vi.fn(),
}))

vi.mock('../../index', () => ({
  sessionService: {
    saveSession: sessionServiceMocks.saveSession,
  },
}))

vi.mock('../../../utils/logger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../utils/logger')>()
  return {
    ...actual,
    generalLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    },
  }
})

import { AuthenticatedSessionEngine } from './AuthenticatedSessionEngine'

describe('AuthenticatedSessionEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('persists top-level session name through centralized save', async () => {
    const createdAt = new Date('2026-04-05T10:00:00.000Z')
    const updatedSession = {
      reportId: 'val_name_123',
      currentView: 'manual' as const,
      dataSource: 'manual' as const,
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
      partialData: {},
      name: 'Acme BV business valuation',
    }

    sessionServiceMocks.saveSession.mockResolvedValue(updatedSession)

    const engine = new AuthenticatedSessionEngine()
    engine.updateSession({
      reportId: 'val_name_123',
      currentView: 'manual',
      dataSource: 'manual',
      createdAt,
      updatedAt: createdAt,
      sessionData: { company_name: 'Acme BV' },
      partialData: {},
      name: 'Acme BV business valuation',
    })

    await engine.saveSession('autosave')

    expect(sessionServiceMocks.saveSession).toHaveBeenCalledWith(
      'val_name_123',
      expect.objectContaining({
        company_name: 'Acme BV',
        currentView: 'manual',
        name: 'Acme BV business valuation',
      })
    )
    expect(engine.getSession()?.name).toBe('Acme BV business valuation')
  })
})
