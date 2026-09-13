import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { VersionAPI } from '../../../services/api/version/VersionAPI'
import { useVersionHistoryStore } from '../../../store/useVersionHistoryStore'
import { useClientContext } from '../../../stores/clientContext'
import type { ValuationVersion } from '../../../types/ValuationVersion'
import type { ValuationReportData } from '../../../components/calculator'
import { useManualVersionNavigation } from './useManualVersionNavigation'

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))
const html = `<html><body>${'Historical report '.repeat(30)}</body></html>`
const version = (n: number, full = false) =>
  ({
    id: `v${n}`,
    reportId: 'report-a',
    versionNumber: n,
    versionLabel: `Version ${n}`,
    formData: {},
    valuationResult: full ? { equity_value_mid: n * 100000, html_report: html } : null,
    htmlReport: full ? html : null,
    createdAt: new Date(),
  }) as unknown as ValuationVersion
const params = () => ({
  reportId: 'report-a',
  report: { valuation: 200000 } as ValuationReportData,
  currentVersionLabel: 'Current',
  selectedMethod: 'upswitch_adaptive',
  onVersionHistoryLocked: vi.fn(),
  setResult: vi.fn(),
  showVersionLoadedToast: vi.fn(),
})

describe('historical report navigation', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    vi.mocked(toast.error).mockClear()
    useClientContext.setState({ isActingAsClient: false, relationshipId: null })
    useVersionHistoryStore.setState({
      versions: { 'report-a': [version(1), version(2, true)] },
      activeVersions: { 'report-a': 2 },
      syncStatus: {},
    })
    vi.spyOn(useVersionHistoryStore.getState(), 'fetchVersions').mockResolvedValue(undefined)
    window.history.replaceState({}, '', '/en/reports/report-a?clientId=client-a&flow=manual')
  })

  it('hydrates cached metadata in the background and never labels it as zero', () => {
    const { result } = renderHook(() => useManualVersionNavigation(params()))
    expect(useVersionHistoryStore.getState().fetchVersions).toHaveBeenCalledWith('report-a')
    expect(result.current.versionHistoryForNav[0].pricesPending).toBe(true)
  })

  it('loads a historical report once before selecting it and retains URL context', async () => {
    let finish!: (value: ValuationVersion) => void
    const read = vi.spyOn(VersionAPI.prototype, 'getVersion').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const p = params()
    const { result } = renderHook(() => useManualVersionNavigation(p))
    const first = result.current.handleSelectVersion('v1')
    const second = result.current.handleSelectVersion('v1')
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1))
    expect(p.setResult).not.toHaveBeenCalled()
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(2)
    await act(async () => {
      finish(version(1, true))
      await Promise.all([first, second])
    })
    expect(p.setResult).toHaveBeenCalledTimes(1)
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(1)
    expect(window.location.search).toContain('version=1')
    expect(window.location.search).toContain('clientId=client-a')
    expect(window.location.search).toContain('flow=manual')
  })

  it('keeps the current report on failure and permits a second selection attempt', async () => {
    const read = vi
      .spyOn(VersionAPI.prototype, 'getVersion')
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(version(1, true))
    const p = params()
    const { result } = renderHook(() => useManualVersionNavigation(p))
    await act(async () => {
      await result.current.handleSelectVersion('v1')
    })
    expect(p.setResult).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('common.states.loadFailed')
    expect(useVersionHistoryStore.getState().activeVersions['report-a']).toBe(2)
    await act(async () => {
      await result.current.handleSelectVersion('v1')
    })
    expect(read).toHaveBeenCalledTimes(2)
    expect(p.setResult).toHaveBeenCalledTimes(1)
  })

  it('ignores a late older selection after a newer selection completes', async () => {
    let finish!: (value: ValuationVersion) => void
    vi.spyOn(VersionAPI.prototype, 'getVersion').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const p = params()
    const { result } = renderHook(() => useManualVersionNavigation(p))
    const first = result.current.handleSelectVersion('v1')
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    await act(async () => {
      await result.current.handleSelectVersion('v2')
    })
    await act(async () => {
      finish(version(1, true))
      await first
    })
    expect(p.setResult).toHaveBeenCalledTimes(1)
    expect(p.setResult).toHaveBeenCalledWith(expect.objectContaining({ equity_value_mid: 200000 }))
    expect(window.location.search).toContain('version=2')
  })

  it('ignores a late version after changing reports', async () => {
    let finish!: (value: ValuationVersion) => void
    vi.spyOn(VersionAPI.prototype, 'getVersion').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const p = params()
    const { result, rerender } = renderHook((props) => useManualVersionNavigation(props), {
      initialProps: p,
    })
    const first = result.current.handleSelectVersion('v1')
    await waitFor(() => expect(finish).toBeTypeOf('function'))
    rerender({ ...p, reportId: 'report-b' })
    await act(async () => {
      finish(version(1, true))
      await first
    })
    expect(p.setResult).not.toHaveBeenCalled()
  })
})
