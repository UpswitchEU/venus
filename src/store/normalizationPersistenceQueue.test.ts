import { beforeEach, describe, expect, it, vi } from 'vitest'
import { normalizationService } from '../services/ebitdaNormalizationService'
import {
  type NormalizationMutation,
  type NormalizationMutationInput,
  NormalizationPersistenceQueue,
} from './normalizationPersistenceQueue'

const access = vi.hoisted(() => ({ scope: 'user:firm:client', epoch: 0 }))
vi.mock('../utils/reportAccessScope', () => ({
  reportAccessScope: () => access.scope,
  watchReportAccessScope: () => {
    const epoch = access.epoch
    return { isCurrent: () => epoch === access.epoch, dispose: vi.fn() }
  },
}))
vi.mock('../services/ebitdaNormalizationService', () => ({
  normalizationService: { saveNormalization: vi.fn(), deleteNormalization: vi.fn() },
}))
const save = vi.mocked(normalizationService.saveNormalization)
const remove = vi.mocked(normalizationService.deleteNormalization)
const mutation = (
  year: number,
  operation: 'save' | 'delete' = 'save'
): NormalizationMutationInput => ({
  reportId: 'report-123',
  year,
  operation,
  request: { session_id: 'report-123', year, reported_ebitda: year, custom_adjustments: [] },
})
const temporary = {
  status: 503,
  code: 'NORMALIZATION_PERSISTENCE_UNAVAILABLE',
  retryAfterMs: 16000,
}
function harness() {
  let pending: NormalizationMutation[] = []
  const queue = new NormalizationPersistenceQueue((p) => {
    pending = p
  })
  return { queue, pending: () => pending }
}
beforeEach(() => {
  vi.clearAllMocks()
  save.mockReset().mockResolvedValue({} as never)
  remove.mockReset().mockResolvedValue(undefined)
  access.epoch = 0
})
describe('report normalization recovery', () => {
  it('retains every failed year and deletion, then drains the batch after recovery', async () => {
    const h = harness()
    save.mockRejectedValueOnce(temporary)
    expect(
      await h.queue.enqueue([mutation(2025), mutation(2024), mutation(2023, 'delete')])
    ).toMatchObject({ status: 'deferred', failure: { status: 503, retryAfterMs: 16000 } })
    expect(h.pending().map((p) => p.year)).toEqual([2025, 2024, 2023])
    expect(await h.queue.retry('report-123')).toEqual({ status: 'acknowledged' })
    expect(save.mock.calls.map((c) => c[0].year)).toEqual([2025, 2025, 2024])
    expect(remove).toHaveBeenCalledWith('report-123', 2023)
    expect(h.pending()).toEqual([])
  })
  it.each([
    false,
    true,
  ])('an old response cannot clear a newer removal (old failed: %s)', async (rejectOld) => {
    const h = harness()
    let finish!: () => void
    save.mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finish = () => (rejectOld ? reject(temporary) : resolve({} as never))
        })
    )
    const first = h.queue.enqueue([mutation(2025)])
    await Promise.resolve()
    const second = h.queue.enqueue([mutation(2025, 'delete')])
    finish()
    await Promise.all([first, second])
    expect(remove).toHaveBeenCalledTimes(1)
    expect(h.pending()).toEqual([])
  })
  it.each([402, 403, 409, 503])('preserves failed deletions for HTTP %s', async (status) => {
    const h = harness()
    remove.mockRejectedValueOnce({ status })
    expect(await h.queue.enqueue([mutation(2024, 'delete')])).toMatchObject({ status: 'deferred' })
    expect(h.pending()).toHaveLength(1)
  })
  it('acknowledges only already-absent deletion failures', async () => {
    const h = harness()
    remove.mockRejectedValueOnce({ status: 404 })
    expect(await h.queue.enqueue([mutation(2024, 'delete')])).toEqual({ status: 'acknowledged' })
  })
  it('cancels the remaining years when identity changes, even away and back', async () => {
    const h = harness()
    let finish!: () => void
    save.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve({} as never)
        })
    )
    const run = h.queue.enqueue([mutation(2025), mutation(2024)])
    await Promise.resolve()
    access.epoch++
    finish()
    expect(await run).toEqual({ status: 'skipped' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(h.pending()).toHaveLength(2)
  })
})
