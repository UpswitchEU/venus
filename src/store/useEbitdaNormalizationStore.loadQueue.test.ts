import { afterEach, describe, expect, it } from 'vitest'
import {
  enqueueEbitdaNormalizationLoad,
  resetEbitdaNormalizationLoadQueueForTests,
} from './useEbitdaNormalizationStore.loadQueue'

describe('enqueueEbitdaNormalizationLoad', () => {
  afterEach(() => {
    resetEbitdaNormalizationLoadQueueForTests()
  })

  it('serializes all normalization loads for the same session', async () => {
    const events: string[] = []
    let releaseFirst: (() => void) | undefined

    const first = enqueueEbitdaNormalizationLoad('session-1', async () => {
      events.push('first:start')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
      events.push('first:end')
    })
    const second = enqueueEbitdaNormalizationLoad('session-1', async () => {
      events.push('second:start')
    })

    await Promise.resolve()
    expect(events).toEqual(['first:start'])

    releaseFirst?.()
    await Promise.all([first, second])

    expect(events).toEqual(['first:start', 'first:end', 'second:start'])
  })
})
