import { describe, expect, it, vi } from 'vitest'
import { executeClientSideBootstrapPipeline } from '../ClientSideBootstrapPipeline'
import type { AuthResolver } from '../resolvers/AuthResolver'
import type { PrefillResolver } from '../resolvers/PrefillResolver'
import type { SessionResolver } from '../resolvers/SessionResolver'

function makePipelineDeps() {
  return {
    authResolver: {
      resolve: vi.fn().mockResolvedValue({
        data: { type: 'authenticated', userId: 'user-1' },
      }),
    } as unknown as AuthResolver,
    logger: {
      error: vi.fn(),
      info: vi.fn(),
    },
    prefillResolver: {
      resolve: vi.fn().mockResolvedValue({
        data: {
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
          sources: [],
        },
      }),
    } as unknown as PrefillResolver,
    sessionResolver: {
      resolve: vi.fn().mockResolvedValue({
        data: {
          hasExistingData: false,
          mode: 'new',
          reportId: 'report-1',
          status: 'draft',
        },
      }),
    } as unknown as SessionResolver,
  }
}

describe('ClientSideBootstrapPipeline', () => {
  it('skips auth resolution when requested and still resolves session and prefill state', async () => {
    const deps = makePipelineDeps()

    const result = await executeClientSideBootstrapPipeline({
      ...deps,
      context: { url: 'https://venus.test/nl/reports/new', locale: 'nl' },
      options: { skipAuth: true, timeout: 1000 },
      startTime: performance.now(),
    })

    expect(deps.authResolver.resolve).not.toHaveBeenCalled()
    expect(deps.sessionResolver.resolve).toHaveBeenCalledTimes(1)
    expect(deps.prefillResolver.resolve).toHaveBeenCalledTimes(1)
    expect(result.identity.type).toBe('authenticated')
    expect(result.report.mode).toBe('new')
  })

  it('returns a fallback state when a resolver fails', async () => {
    const deps = makePipelineDeps()
    vi.mocked(deps.authResolver.resolve).mockRejectedValue(new Error('auth unavailable'))

    const result = await executeClientSideBootstrapPipeline({
      ...deps,
      context: { url: 'https://venus.test/nl/reports/new', locale: 'en' },
      options: { timeout: 1000 },
      startTime: performance.now(),
    })

    expect(deps.logger.error).toHaveBeenCalledWith(
      '[Bootstrap] Bootstrap failed:',
      'auth unavailable'
    )
    expect(result.report.mode).toBe('new')
    expect(result.prefillData.confidence).toBe(0)
  })
})
