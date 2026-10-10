import { normalizationService } from '../services/ebitdaNormalizationService'
import type { CreateNormalizationRequest } from '../types/ebitdaNormalization'
import {
  type PersistenceFailure,
  type PersistenceOutcome,
  persistenceFailure,
} from '../utils/persistenceOutcome'
import { reportAccessScope, watchReportAccessScope } from '../utils/reportAccessScope'

export interface NormalizationMutation {
  reportId: string
  year: number
  operation: 'save' | 'delete'
  request?: CreateNormalizationRequest
  revision: number
  scope: string
  failure?: PersistenceFailure
}
export type NormalizationMutationInput = Omit<
  NormalizationMutation,
  'revision' | 'scope' | 'failure'
>

/** One acknowledged mutation per year; superseded responses never remove newer work. */
export class NormalizationPersistenceQueue {
  private pending = new Map<string, NormalizationMutation>()
  private running = new Map<string, Promise<PersistenceOutcome>>()
  private revision = 0
  private generation = 0

  constructor(
    private readonly changed: (pending: NormalizationMutation[], saving: boolean) => void
  ) {}

  private key(item: Pick<NormalizationMutation, 'reportId' | 'scope' | 'year'>) {
    return JSON.stringify([item.scope, item.reportId, item.year])
  }

  private publish() {
    this.changed([...this.pending.values()], this.running.size > 0)
  }

  clear() {
    this.generation++
    this.running.clear()
    this.pending.clear()
    this.publish()
  }

  restore(inputs: NormalizationMutationInput[]) {
    const scope = reportAccessScope()
    for (const input of inputs) {
      const key = this.key({ ...input, scope })
      if (!this.pending.has(key))
        this.pending.set(key, { ...input, scope, revision: ++this.revision })
    }
    this.publish()
  }

  enqueue(inputs: NormalizationMutationInput[]): Promise<PersistenceOutcome> {
    if (!inputs.length) return Promise.resolve({ status: 'acknowledged' })
    const scope = reportAccessScope()
    for (const input of inputs) {
      const item = { ...input, scope, revision: ++this.revision }
      this.pending.set(this.key(item), item)
    }
    this.publish()
    return this.retry(inputs[0].reportId)
  }

  retry(reportId: string): Promise<PersistenceOutcome> {
    const scope = reportAccessScope()
    const runKey = JSON.stringify([scope, reportId])
    const existing = this.running.get(runKey)
    if (existing) return existing
    const access = watchReportAccessScope()
    const generation = this.generation
    const isCurrent = () => access.isCurrent() && generation === this.generation
    // Start on the next microtask so running is registered before any publication.
    const promise = Promise.resolve()
      .then(async (): Promise<PersistenceOutcome> => {
        while (true) {
          if (!isCurrent()) return { status: 'skipped' }
          const item = [...this.pending.values()].find(
            (p) => p.reportId === reportId && p.scope === scope
          )
          if (!item) return { status: 'acknowledged' }
          const key = this.key(item)
          try {
            if (item.operation === 'delete') {
              try {
                await normalizationService.deleteNormalization(reportId, item.year)
              } catch (error) {
                if (persistenceFailure(error).status !== 404) throw error
              }
            } else if (item.request) {
              await normalizationService.saveNormalization(item.request)
            } else {
              throw new Error('Missing normalization mutation payload')
            }
            if (!isCurrent()) return { status: 'skipped' }
            if (this.pending.get(key)?.revision === item.revision) this.pending.delete(key)
            this.publish()
          } catch (error) {
            if (!isCurrent()) return { status: 'skipped' }
            if (this.pending.get(key)?.revision !== item.revision) continue
            const failure = persistenceFailure(error)
            if (this.pending.get(key)?.revision === item.revision) {
              this.pending.set(key, { ...item, failure })
            }
            this.publish()
            return { status: 'deferred', failure }
          }
        }
      })
      .finally(() => {
        access.dispose()
        if (this.running.get(runKey) === promise) this.running.delete(runKey)
        this.publish()
      })
    this.running.set(runKey, promise)
    this.publish()
    return promise
  }
}
