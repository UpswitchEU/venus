import { describe, expect, it } from 'vitest'

import { runTitanNormalizationMutationExclusive } from '../normalizationTitanMutationGate'

describe('normalizationTitanMutationGate', () => {
  it('runs only one mutation at a time for the same session id', async () => {
    const key = 'val_session_exclusive'
    let active = 0
    let maxActive = 0
    let release!: () => void
    const barrier = new Promise<void>((resolve) => {
      release = resolve
    })

    const p1 = runTitanNormalizationMutationExclusive(key, async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await barrier
      active -= 1
    })

    await new Promise<void>((r) => setImmediate(r))
    expect(maxActive).toBe(1)

    const p2 = runTitanNormalizationMutationExclusive(key, async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      active -= 1
    })

    for (let i = 0; i < 20; i++) {
      await new Promise<void>((r) => setImmediate(r))
    }
    expect(maxActive).toBe(1)

    release()
    await Promise.all([p1, p2])

    expect(maxActive).toBe(1)
  })

  it('does not serialize different session ids against each other', async () => {
    let active = 0
    let maxConcurrent = 0
    let a!: () => void
    let b!: () => void
    const barA = new Promise<void>((r) => {
      a = r
    })
    const barB = new Promise<void>((r) => {
      b = r
    })

    const p1 = runTitanNormalizationMutationExclusive('sess-a', async () => {
      active += 1
      maxConcurrent = Math.max(maxConcurrent, active)
      await barA
      active -= 1
    })

    const p2 = runTitanNormalizationMutationExclusive('sess-b', async () => {
      active += 1
      maxConcurrent = Math.max(maxConcurrent, active)
      await barB
      active -= 1
    })

    await new Promise<void>((r) => setImmediate(r))
    expect(maxConcurrent).toBe(2)

    a()
    b()
    await Promise.all([p1, p2])
  })

  it('uses the same mutex for ids that only differ in surrounding whitespace', async () => {
    const order: string[] = []
    await runTitanNormalizationMutationExclusive('  my-sess  ', async () => {
      order.push('first')
    })
    await runTitanNormalizationMutationExclusive('my-sess', async () => {
      order.push('second')
    })
    expect(order).toEqual(['first', 'second'])
  })

  it('bypasses the queue when the id is blank', async () => {
    let ran = 0
    await runTitanNormalizationMutationExclusive('   ', async () => {
      ran += 1
    })
    await runTitanNormalizationMutationExclusive(null, async () => {
      ran += 1
    })
    expect(ran).toBe(2)
  })
})
