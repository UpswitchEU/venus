/**
 * In-band mutation-source contract.
 *
 * Every mutation on `useTaxLatencyStore` stamps `state._lastMutationSource`
 * and increments `state._mutationSeq`. Subscribers driving side effects
 * (e.g. the valuation auto-recalc in `ManualLayout`) gate on the source
 * directly — no out-of-band counter, no pre-mount leak window.
 *
 * Replaces the previous suppression-queue contract (`suppressNextLatencyRecalc`
 * / `consumeLatencyRecalcSuppression` / `resetLatencyRecalcSuppression`),
 * which has been deleted.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTaxLatencyStore } from '../useTaxLatencyStore'

describe('tax-latency mutation source contract', () => {
  beforeEach(() => {
    // Bring the store to a known state before every test.
    useTaxLatencyStore.setState({
      items: [],
      candidates: [],
      _lastMutationSource: null,
      _mutationSeq: 0,
    })
  })

  afterEach(() => {
    useTaxLatencyStore.setState({
      items: [],
      candidates: [],
      _lastMutationSource: null,
      _mutationSeq: 0,
    })
  })

  describe('user actions stamp source="user"', () => {
    it('addItem stamps user', () => {
      useTaxLatencyStore.getState().addItem({
        id: 'a',
        type: 'passive',
        description: 'x',
        temporaryDifference: 1000,
        taxRate: 25,
      })
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('user')
      expect(state._mutationSeq).toBe(1)
      expect(state.items.length).toBe(1)
    })

    it('removeItem stamps user', () => {
      useTaxLatencyStore.setState({
        items: [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
        _mutationSeq: 5,
      })
      useTaxLatencyStore.getState().removeItem('a')
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('user')
      expect(state._mutationSeq).toBe(6)
      expect(state.items.length).toBe(0)
    })

    it('updateItem stamps user', () => {
      useTaxLatencyStore.setState({
        items: [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
        _mutationSeq: 5,
      })
      useTaxLatencyStore.getState().updateItem('a', { taxRate: 30 })
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('user')
      expect(state._mutationSeq).toBe(6)
      expect(state.items[0].taxRate).toBe(30)
    })

    it('setItems defaults to user when no options are passed', () => {
      useTaxLatencyStore.getState().setItems([
        {
          id: 'a',
          type: 'passive',
          description: 'x',
          temporaryDifference: 1000,
          taxRate: 25,
        },
      ])
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('user')
      expect(state.items.length).toBe(1)
    })

    it('clear defaults to user when no options are passed', () => {
      useTaxLatencyStore.setState({
        items: [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
      })
      useTaxLatencyStore.getState().clear()
      expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('user')
    })

    it('setCandidates stamps user', () => {
      useTaxLatencyStore.getState().setCandidates([])
      expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('user')
    })

    it('dismissCandidate stamps user', () => {
      useTaxLatencyStore.setState({
        candidates: [
          {
            id: 'c1',
            type: 'passive',
            accountCode: '168',
            accountName: 'x',
            description: 'y',
            suggestedQuestion: '?',
            taxRate: 25,
          },
        ],
      })
      useTaxLatencyStore.getState().dismissCandidate('c1')
      expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('user')
    })
  })

  describe('programmatic mutations stamp source="system"', () => {
    it('setItems with { source: "system" } stamps system', () => {
      useTaxLatencyStore.getState().setItems(
        [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
        { source: 'system' }
      )
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('system')
      expect(state.items.length).toBe(1)
    })

    it('clear with { source: "system" } stamps system', () => {
      useTaxLatencyStore.setState({
        items: [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
      })
      useTaxLatencyStore.getState().clear({ source: 'system' })
      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('system')
      expect(state.items.length).toBe(0)
    })

    it('setCandidates with { source: "system" } stamps system even when auto-promoting', () => {
      useTaxLatencyStore.getState().setCandidates(
        [
          {
            id: 'auto-168',
            type: 'passive',
            accountCode: '168000',
            accountName: 'Uitgestelde belastingen',
            description: 'Auto-applied deferred tax liability',
            suggestedQuestion: 'Apply deferred tax?',
            taxRate: 25,
            temporaryDifference: 10_000,
            autoApply: true,
          },
        ],
        { source: 'system' }
      )

      const state = useTaxLatencyStore.getState()
      expect(state._lastMutationSource).toBe('system')
      expect(state.items).toEqual([
        expect.objectContaining({
          id: 'auto_auto-168',
          accountCode: '168000',
        }),
      ])
      expect(state.candidates).toEqual([])
    })

    it('loadFromSession stamps system', () => {
      useTaxLatencyStore.getState().loadFromSession({
        _taxLatencies: [
          {
            id: 'a',
            type: 'passive',
            description: 'x',
            temporaryDifference: 1000,
            taxRate: 25,
          },
        ],
      })
      expect(useTaxLatencyStore.getState()._lastMutationSource).toBe('system')
    })
  })

  describe('subscriber-side gating', () => {
    it('lets a subscriber distinguish user from system mutations and act only on user', () => {
      const userFires: number[] = []
      const systemFires: number[] = []

      const unsub = useTaxLatencyStore.subscribe((state, prev) => {
        if (state._mutationSeq === prev._mutationSeq) return
        if (state._lastMutationSource === 'user') {
          userFires.push(state._mutationSeq)
        } else {
          systemFires.push(state._mutationSeq)
        }
      })

      try {
        // Programmatic restore — must not register on the user channel.
        useTaxLatencyStore.getState().setItems(
          [
            {
              id: 'a',
              type: 'passive',
              description: 'restored',
              temporaryDifference: 1000,
              taxRate: 25,
            },
          ],
          { source: 'system' }
        )

        // Programmatic clear — also system.
        useTaxLatencyStore.getState().clear({ source: 'system' })

        // User edit — should be the only thing on the user channel.
        useTaxLatencyStore.getState().addItem({
          id: 'b',
          type: 'active',
          description: 'user',
          temporaryDifference: 500,
          taxRate: 20,
        })

        expect(userFires.length).toBe(1)
        expect(systemFires.length).toBe(2)
      } finally {
        unsub()
      }
    })

    it('increments _mutationSeq monotonically across mixed mutations', () => {
      useTaxLatencyStore.getState().addItem({
        id: 'a',
        type: 'passive',
        description: 'x',
        temporaryDifference: 1000,
        taxRate: 25,
      })
      expect(useTaxLatencyStore.getState()._mutationSeq).toBe(1)

      useTaxLatencyStore.getState().setItems([], { source: 'system' })
      expect(useTaxLatencyStore.getState()._mutationSeq).toBe(2)

      useTaxLatencyStore.getState().clear({ source: 'system' })
      expect(useTaxLatencyStore.getState()._mutationSeq).toBe(3)

      useTaxLatencyStore.getState().setCandidates([])
      expect(useTaxLatencyStore.getState()._mutationSeq).toBe(4)
    })

    it("cancelling a pending user debounce on a programmatic mutation is the caller's job", () => {
      // Pin: the store does not own debounce state. A subscriber that owns its
      // own debounce timer can cancel it on observing a system mutation. This
      // test documents the contract — the gating signal is the source field,
      // and what to do with that signal is the subscriber's call.
      let lastObservedSource: string | null = null
      const unsub = useTaxLatencyStore.subscribe((state, prev) => {
        if (state._mutationSeq !== prev._mutationSeq) {
          lastObservedSource = state._lastMutationSource
        }
      })
      try {
        useTaxLatencyStore.getState().addItem({
          id: 'a',
          type: 'passive',
          description: 'x',
          temporaryDifference: 1000,
          taxRate: 25,
        })
        expect(lastObservedSource).toBe('user')

        useTaxLatencyStore.getState().clear({ source: 'system' })
        expect(lastObservedSource).toBe('system')
      } finally {
        unsub()
      }
    })
  })
})
