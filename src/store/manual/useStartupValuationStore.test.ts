import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  STARTUP_STAGE_DEFAULT_RAISE,
  useStartupValuationStore,
} from './useStartupValuationStore'

describe('useStartupValuationStore', () => {
  beforeEach(() => {
    useStartupValuationStore.getState().reset()
  })

  afterEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('exposes the canonical Berkus + Scorecard slider defaults', () => {
    const state = useStartupValuationStore.getState()
    expect(state.stage).toBe('seed')
    expect(state.country_code).toBe('BE')
    expect(state.sector).toBe('saas')
    expect(state.management_strength).toBe(50)
    expect(state.cap_table.option_pool_pct).toBe(10)
  })

  it('toRequestPayload threads the founder-picked sector through to Titan', () => {
    useStartupValuationStore.getState().setField('sector', 'fintech')
    const payload = useStartupValuationStore.getState().toRequestPayload()
    expect(payload).toMatchObject({ sector: 'fintech' })
  })

  it('setField updates a single state slice without touching the others', () => {
    useStartupValuationStore.getState().setField('management_strength', 80)
    const next = useStartupValuationStore.getState()
    expect(next.management_strength).toBe(80)
    expect(next.sound_idea).toBe(50)
  })

  it('setCapField targets only cap_table slice', () => {
    useStartupValuationStore.getState().setCapField('option_pool_pct', 15)
    expect(useStartupValuationStore.getState().cap_table.option_pool_pct).toBe(15)
  })

  it('addSafeNote / updateSafeNote / removeSafeNote round-trip', () => {
    useStartupValuationStore.getState().addSafeNote()
    const id = useStartupValuationStore.getState().cap_table.safe_notes[0]!.id
    useStartupValuationStore.getState().updateSafeNote(id, { amount: 100000 })
    expect(useStartupValuationStore.getState().cap_table.safe_notes[0]!.amount).toBe(100000)
    useStartupValuationStore.getState().removeSafeNote(id)
    expect(useStartupValuationStore.getState().cap_table.safe_notes).toHaveLength(0)
  })

  it('toRequestPayload omits null forward-looking metrics but keeps slider defaults', () => {
    const payload = useStartupValuationStore.getState().toRequestPayload()
    expect(payload).toMatchObject({
      stage: 'seed',
      country_code: 'BE',
      sound_idea: 50,
      management_strength: 50,
    })
    expect(payload).not.toHaveProperty('mrr')
    expect(payload).not.toHaveProperty('cac')
    expect(payload).not.toHaveProperty('year5_revenue_projection')
  })

  it('seeds investment_amount_sought with the seed-stage Benelux median', () => {
    // Critical: the cap-table simulator depends on this being non-null
    // on first render, otherwise the founder gets a blank field on
    // Screen 3 and never sees the consortium's "if you raise X you
    // dilute Y%" line until they manually type a value.
    const state = useStartupValuationStore.getState()
    expect(state.investment_amount_sought).toBe(STARTUP_STAGE_DEFAULT_RAISE.seed)
    expect(state.investment_amount_sought).toBe(750_000)
  })

  it('threads investment_amount_sought through to the request payload', () => {
    useStartupValuationStore.getState().setField('investment_amount_sought', 250_000)
    const payload = useStartupValuationStore.getState().toRequestPayload() as {
      investment_amount_sought?: number
    }
    expect(payload.investment_amount_sought).toBe(250_000)
  })

  it('omits investment_amount_sought when the founder clears the field', () => {
    // Defensive: nullable values should drop from the payload so the
    // Python side falls back to its dilution-percentage formula
    // instead of misinterpreting `null` as a 0 ask.
    useStartupValuationStore.getState().setField('investment_amount_sought', null)
    const payload = useStartupValuationStore.getState().toRequestPayload()
    expect(payload).not.toHaveProperty('investment_amount_sought')
  })

  it('toRequestPayload includes provided forward-looking metrics', () => {
    const s = useStartupValuationStore.getState()
    s.setField('mrr', 5000)
    s.setField('mrr_growth_rate_pct', 15)
    s.setField('year5_revenue_projection', 10_000_000)
    s.setField('target_roi_x', 25)

    const payload = useStartupValuationStore.getState().toRequestPayload()
    expect(payload.mrr).toBe(5000)
    expect(payload.mrr_growth_rate_pct).toBe(15)
    expect(payload.year5_revenue_projection).toBe(10_000_000)
    expect(payload.target_roi_x).toBe(25)
  })

  it('toRequestPayload filters SAFE notes without a positive amount', () => {
    const s = useStartupValuationStore.getState()
    s.addSafeNote()
    s.addSafeNote()
    const [first, second] = useStartupValuationStore.getState().cap_table.safe_notes
    s.updateSafeNote(first!.id, { amount: 50000, valuation_cap: 5_000_000 })
    s.updateSafeNote(second!.id, { amount: 0 })

    const payload = useStartupValuationStore.getState().toRequestPayload() as {
      cap_table: { safe_notes: Array<Record<string, unknown>> }
    }
    expect(payload.cap_table.safe_notes).toHaveLength(1)
    expect(payload.cap_table.safe_notes[0]).toMatchObject({
      amount: 50000,
      valuation_cap: 5_000_000,
    })
  })

  it('reset returns the slice to initial defaults', () => {
    const s = useStartupValuationStore.getState()
    s.setField('management_strength', 95)
    s.setCapField('option_pool_pct', 18)
    s.addSafeNote()
    s.reset()
    const after = useStartupValuationStore.getState()
    expect(after.management_strength).toBe(50)
    expect(after.cap_table.option_pool_pct).toBe(10)
    expect(after.cap_table.safe_notes).toHaveLength(0)
  })

  describe('seedSectorFromNaceIfDefault — PLG NACE smart-default', () => {
    it('seeds the sector from a high-confidence NACE prefix', () => {
      // Founder lands on Venus from Mercury with KBO data showing
      // financial-services NACE — we should anchor the VC-method
      // exit multiple defaults to fintech (8x) instead of generic SaaS (6x).
      useStartupValuationStore.getState().seedSectorFromNaceIfDefault('64.19')
      expect(useStartupValuationStore.getState().sector).toBe('fintech')
    })

    it('does NOT override an explicit user choice on a re-seed attempt', () => {
      // User came in with 'fintech' inferred, then deliberately switched
      // to 'consumer'.  A subsequent NACE re-seed (e.g. KBO row swapped)
      // must respect the explicit choice forever — that's why we mark
      // _sectorWasUserSet on every setField('sector', ...).
      const s = useStartupValuationStore.getState()
      s.seedSectorFromNaceIfDefault('64.19')
      expect(useStartupValuationStore.getState().sector).toBe('fintech')

      s.setField('sector', 'consumer')
      s.seedSectorFromNaceIfDefault('62.01') // would normally set 'saas'
      expect(useStartupValuationStore.getState().sector).toBe('consumer')
    })

    it('is a no-op for blank / unmapped NACE codes', () => {
      const s = useStartupValuationStore.getState()
      s.seedSectorFromNaceIfDefault(null)
      s.seedSectorFromNaceIfDefault('')
      s.seedSectorFromNaceIfDefault('41.20') // construction — unmapped
      expect(useStartupValuationStore.getState().sector).toBe('saas')
      expect(useStartupValuationStore.getState()._sectorWasUserSet).toBe(false)
    })

    it('is idempotent when the inferred sector matches the current one', () => {
      // Seeding 'saas' from 62.01 when sector is already 'saas' should
      // not trigger _sectorWasUserSet (it never went through setField).
      const s = useStartupValuationStore.getState()
      s.seedSectorFromNaceIfDefault('62.01')
      expect(useStartupValuationStore.getState().sector).toBe('saas')
      expect(useStartupValuationStore.getState()._sectorWasUserSet).toBe(false)
    })
  })
})
