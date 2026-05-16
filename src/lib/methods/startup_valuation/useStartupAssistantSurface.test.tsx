/**
 * useStartupAssistantSurface — behaviour pins for the consolidated startup-
 * assistant surface. Before this extraction, ~80 lines of useMemo + store
 * selectors + sub-hook calls lived inline in `ManualLayout`. The hook is
 * now testable in isolation; `useStartupBenchmark` and `useStudioIssues`
 * are mocked at module scope so we exercise the filter/map/gate logic
 * deterministically.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  StudioIssue,
  StudioIssuesResult,
} from '@/features/startup-studio/hooks/useStudioIssues'
import {
  type UseStartupAssistantSurfaceParams,
  useStartupAssistantSurface,
} from './useStartupAssistantSurface'

vi.mock('@/lib/benchmarks/useStartupBenchmark', () => ({
  useStartupBenchmark: () => ({ benchmark: null }),
}))

const mockStudioIssues = vi.fn<[], StudioIssuesResult>()
vi.mock('@/features/startup-studio/hooks/useStudioIssues', async () => {
  const actual = await vi.importActual<
    typeof import('@/features/startup-studio/hooks/useStudioIssues')
  >('@/features/startup-studio/hooks/useStudioIssues')
  return {
    ...actual,
    useStudioIssues: () => mockStudioIssues(),
  }
})

function issue(partial: Partial<StudioIssue> & { id: string }): StudioIssue {
  return {
    severity: 'warn',
    step: 'profile',
    title: { en: 'EN title', nl: 'NL title' },
    body: { en: 'EN body', nl: 'NL body' },
    action: { en: 'EN action', nl: 'NL action' },
    assistantPrompt: { en: 'EN prompt', nl: 'NL prompt' },
    ...partial,
  } as StudioIssue
}

function makeParams(
  override: Partial<UseStartupAssistantSurfaceParams> = {}
): UseStartupAssistantSurfaceParams {
  return {
    isStartupAssistantRoute: true,
    acknowledgedStartupIssues: new Set<string>(),
    assistantLocale: 'en',
    formatStartupAssistantPrompt: (p) => `wrapped:${p}`,
    ...override,
  }
}

function setIssues(issues: StudioIssue[]) {
  mockStudioIssues.mockReturnValue({
    issues,
    blockers: issues.filter((i) => i.severity === 'block'),
    warnings: issues.filter((i) => i.severity === 'warn'),
    infos: issues.filter((i) => i.severity === 'info'),
  })
}

describe('useStartupAssistantSurface', () => {
  beforeEach(() => {
    mockStudioIssues.mockReset()
    setIssues([])
  })

  describe('route gating', () => {
    it('returns empty arrays + empty map when not on the startup route', () => {
      setIssues([issue({ id: 'a' }), issue({ id: 'b', severity: 'block' })])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ isStartupAssistantRoute: false }))
      )
      expect(result.current.startupIssues).toEqual([])
      expect(result.current.startupLauncherIssues).toEqual([])
      expect(result.current.startupIssueById.size).toBe(0)
    })

    it('returns mapped issues when on the startup route', () => {
      setIssues([issue({ id: 'a' })])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ isStartupAssistantRoute: true }))
      )
      expect(result.current.startupIssues.length).toBe(1)
      expect(result.current.startupIssues[0].id).toBe('a')
    })
  })

  describe('filter behaviour', () => {
    it('drops issues with severity === "info"', () => {
      setIssues([
        issue({ id: 'info-1', severity: 'info' }),
        issue({ id: 'warn-1', severity: 'warn' }),
        issue({ id: 'block-1', severity: 'block' }),
      ])
      const { result } = renderHook(() => useStartupAssistantSurface(makeParams()))
      expect(result.current.startupIssues.map((x) => x.id)).toEqual(['warn-1', 'block-1'])
      expect(result.current.startupLauncherIssues.map((x) => x.id)).toEqual(['warn-1', 'block-1'])
    })

    it('drops issues whose id is in acknowledgedStartupIssues', () => {
      setIssues([issue({ id: 'a' }), issue({ id: 'b' }), issue({ id: 'c' })])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ acknowledgedStartupIssues: new Set(['b']) }))
      )
      expect(result.current.startupIssues.map((x) => x.id)).toEqual(['a', 'c'])
      expect(result.current.startupLauncherIssues.map((x) => x.id)).toEqual(['a', 'c'])
    })
  })

  describe('locale mapping', () => {
    it('uses English copy + "Fix with AI" + "Jump to" labels when locale is "en"', () => {
      setIssues([issue({ id: 'a', step: 'berkus' })])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ assistantLocale: 'en' }))
      )
      const mapped = result.current.startupIssues[0]
      expect(mapped.title).toBe('EN title')
      expect(mapped.body).toBe('EN body')
      expect(mapped.action).toBe('EN action')
      expect(mapped.ctaLabel).toBe('Fix with AI')
      expect(mapped.jumpLabel).toBe('Jump to Risk reduction')
      expect(mapped.ctaPrompt).toBe('wrapped:EN prompt')
    })

    it('uses Dutch copy + "Fix met AI" + "Ga naar" labels when locale is "nl"', () => {
      setIssues([issue({ id: 'a', step: 'traction' })])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ assistantLocale: 'nl' }))
      )
      const mapped = result.current.startupIssues[0]
      expect(mapped.title).toBe('NL title')
      expect(mapped.body).toBe('NL body')
      expect(mapped.action).toBe('NL action')
      expect(mapped.ctaLabel).toBe('Fix met AI')
      expect(mapped.jumpLabel).toBe('Ga naar Tractie')
      expect(mapped.ctaPrompt).toBe('wrapped:NL prompt')
    })

    it('selects the right step label for each StudioStepId', () => {
      const allSteps: StudioIssue['step'][] = [
        'profile',
        'berkus',
        'scorecard',
        'founder_pedigree',
        'traction',
        'exit_story',
        'round_simulator',
      ]
      setIssues(allSteps.map((step) => issue({ id: step, step })))
      const { result } = renderHook(() =>
        useStartupAssistantSurface(makeParams({ assistantLocale: 'en' }))
      )
      const labels = result.current.startupIssues.map((x) => x.jumpLabel)
      expect(labels).toEqual([
        'Jump to Profile',
        'Jump to Risk reduction',
        'Jump to Defensibility',
        'Jump to Team pedigree',
        'Jump to Traction',
        'Jump to Exit story',
        'Jump to Round',
      ])
    })
  })

  describe('issue-by-id map', () => {
    it('exposes every launcher issue keyed by its id', () => {
      setIssues([issue({ id: 'x' }), issue({ id: 'y' }), issue({ id: 'z' })])
      const { result } = renderHook(() => useStartupAssistantSurface(makeParams()))
      expect(result.current.startupIssueById.size).toBe(3)
      expect(result.current.startupIssueById.get('x')?.id).toBe('x')
      expect(result.current.startupIssueById.get('y')?.id).toBe('y')
    })

    it('excludes filtered-out issues from the map', () => {
      setIssues([
        issue({ id: 'kept-warn', severity: 'warn' }),
        issue({ id: 'dropped-info', severity: 'info' }),
        issue({ id: 'dropped-ack' }),
      ])
      const { result } = renderHook(() =>
        useStartupAssistantSurface(
          makeParams({ acknowledgedStartupIssues: new Set(['dropped-ack']) })
        )
      )
      expect(result.current.startupIssueById.has('kept-warn')).toBe(true)
      expect(result.current.startupIssueById.has('dropped-info')).toBe(false)
      expect(result.current.startupIssueById.has('dropped-ack')).toBe(false)
    })
  })
})
