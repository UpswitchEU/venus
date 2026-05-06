import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '../../store/manual/useManualFormStore'
import { useSessionStore } from '../../store/useSessionStore'
import { queueOptionalGapFillFlush } from '../sessionOptionalGapFillFlush'

const mergeOptionalSpy = vi.fn()
const mergeSurfaceSpy = vi.fn((x: unknown) => x)

vi.mock('../../utils/mergeOptionalSessionPrefillFields', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../utils/mergeOptionalSessionPrefillFields')>()
  return {
    ...actual,
    mergeOptionalSessionPrefillFields: (...args: unknown[]) => mergeOptionalSpy(...args),
    mergeSessionSurfaceForOptionalPrefill: (raw: unknown) => mergeSurfaceSpy(raw),
  }
})

async function flushMicrotasks(): Promise<void> {
  await new Promise<void>((resolve) => queueMicrotask(resolve))
}

describe('queueOptionalGapFillFlush', () => {
  beforeEach(() => {
    mergeOptionalSpy.mockReset()
    mergeSurfaceSpy.mockReset()
    mergeOptionalSpy.mockReturnValue({ revenue: 123 })
    useManualFormStore.getState().resetForm()
    useSessionStore.setState({
      restorationComplete: true,
      session: {
        reportId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        sessionData: { company_name: 'Co' },
      } as any,
    })
  })

  it('coalesces multiple synchronous queue calls into one merge + one updateFormData', async () => {
    const updateSpy = vi.spyOn(useManualFormStore.getState(), 'updateFormData')

    queueOptionalGapFillFlush()
    queueOptionalGapFillFlush()
    queueOptionalGapFillFlush()

    await flushMicrotasks()

    expect(mergeOptionalSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledTimes(1)
    expect(updateSpy).toHaveBeenCalledWith({ revenue: 123 })
    updateSpy.mockRestore()
  })

  it('skips when restoration is not complete', async () => {
    useSessionStore.setState({ restorationComplete: false })
    const updateSpy = vi.spyOn(useManualFormStore.getState(), 'updateFormData')

    queueOptionalGapFillFlush()
    await flushMicrotasks()

    expect(mergeOptionalSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    updateSpy.mockRestore()
  })

  it('skips for new report placeholder id', async () => {
    useSessionStore.setState({
      session: {
        reportId: 'new',
        sessionData: {},
      } as any,
    })
    const updateSpy = vi.spyOn(useManualFormStore.getState(), 'updateFormData')

    queueOptionalGapFillFlush()
    await flushMicrotasks()

    expect(mergeOptionalSpy).not.toHaveBeenCalled()
    expect(updateSpy).not.toHaveBeenCalled()
    updateSpy.mockRestore()
  })
})
