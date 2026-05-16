/**
 * Mirror of the production cap-money sanity bound on
 * ``normalizePreMoneyTarget``.  Kept inline here (rather than imported)
 * because the helper does not export the constant — and we don't want
 * to widen the public surface for what is purely a test-only assertion.
 */
const PRE_MONEY_TARGET_MAX_EUR = 1e15

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  calculatePedigreeMultiplier,
  PEDIGREE_EVIDENCE_MAX_LEN,
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

  it('setCapField normalizes pre_money_target (rejects non-positive, caps huge EUR)', () => {
    const g = () => useStartupValuationStore.getState()
    g().setCapField('pre_money_target', 2_000_000)
    expect(g().cap_table.pre_money_target).toBe(2_000_000)
    g().setCapField('pre_money_target', 0)
    expect(g().cap_table.pre_money_target).toBeNull()
    g().setCapField('pre_money_target', -50)
    expect(g().cap_table.pre_money_target).toBeNull()
    g().setCapField('pre_money_target', PRE_MONEY_TARGET_MAX_EUR + 1000)
    expect(g().cap_table.pre_money_target).toBe(PRE_MONEY_TARGET_MAX_EUR)
  })

  it('addSafeNote / updateSafeNote / removeSafeNote round-trip', () => {
    useStartupValuationStore.getState().addSafeNote()
    const id = useStartupValuationStore.getState().cap_table.safe_notes[0]?.id
    useStartupValuationStore.getState().updateSafeNote(id, { amount: 100000 })
    expect(useStartupValuationStore.getState().cap_table.safe_notes[0]?.amount).toBe(100000)
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
    s.updateSafeNote(first?.id, { amount: 50000, valuation_cap: 5_000_000 })
    s.updateSafeNote(second?.id, { amount: 0 })

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

  it('applyFromSnapshot silently drops legacy tam_sam_som payloads', () => {
    // Older Studio sessions persisted ``tam_sam_som`` either at the top
    // level or under ``studio_v2``.  After the 2026-05-08 removal the
    // store no longer carries the field, so a snapshot containing it
    // must hydrate cleanly without throwing or polluting state.
    expect(() =>
      useStartupValuationStore.getState().applyFromSnapshot({
        tam_sam_som: { tam: 1_000_000, sam: 500_000, som: 100_000 },
        studio_v2: { tam_sam_som: { tam: 99 } },
        description: 'a survivor field',
      })
    ).not.toThrow()
    const after = useStartupValuationStore.getState() as Record<string, unknown>
    expect('tam_sam_som' in after).toBe(false)
    expect((after as { description: string }).description).toBe('a survivor field')
  })

  it('toRequestPayload never emits studio_v2.tam_sam_som', () => {
    // Sanity check on the request envelope: the legacy field must not
    // resurface under ``studio_v2`` even when a session round-trip is
    // simulated end-to-end.
    useStartupValuationStore.getState().applyFromSnapshot({
      tam_sam_som: { tam: 1_000_000, sam: 500_000, som: 100_000 },
    })
    const payload = useStartupValuationStore.getState().toRequestPayload() as {
      studio_v2?: { tam_sam_som?: unknown }
    }
    expect(payload.studio_v2?.tam_sam_som).toBeUndefined()
  })

  describe('applyPreset — one-click smart defaults', () => {
    it('applies the Upswitch demo preset end-to-end', async () => {
      const { UPSWITCH_DEMO_PRESET } = await import('@/features/startup-studio/data/presets')
      useStartupValuationStore.getState().applyPreset(UPSWITCH_DEMO_PRESET)
      const s = useStartupValuationStore.getState()

      expect(s.stage).toBe('pre_seed')
      expect(s.sector).toBe('marketplace')
      expect(s.country_code).toBe('BE')
      // €1.5M pre-seed raise — calibrated to the Atomico Benelux marketplace
      // pre-seed median (€1-2M) and the founder's stated deck target.
      expect(s.investment_amount_sought).toBe(1_500_000)

      // Berkus maturity → 0-100 score derivation
      expect(s.maturity.sound_idea).toBe('exceptional')
      expect(s.sound_idea).toBe(100)
      expect(s.maturity.product_rollout).toBe('basic')
      expect(s.product_rollout).toBe(40)

      // Founder pedigree — veteran team (3 substantiable claims):
      // domain_expert_10y + second_time_founder + has_technical_cofounder
      // → multiplier 1.0 + 0.15 + 0.10 + 0.10 = 1.35×.
      expect(s.founder_pedigree.domain_expert_10y).toBe(true)
      expect(s.founder_pedigree.second_time_founder).toBe(true)
      expect(s.founder_pedigree.has_technical_cofounder).toBe(true)
      expect(s.founder_pedigree.prior_exit).toBe(false)
      expect(s.founder_pedigree.top_unicorn_alumnus).toBe(false)
      expect(s.founder_pedigree.solo_founder).toBe(false)

      // VC method anchors — calibrated to land at €8.5M pre-money /
      // 15% dilution at the €1.5M raise (the deck target).  Engine math
      // (verified in `apps/valuation-iq/scripts/value_upswitch.py`):
      //   VC pre = (€60M × 6 ÷ 12) − €1.5M = €28.5M
      //   Blend × 1.35× veteran pedigree = ~€8.57M  → ~14.9% dilution.
      expect(s.year5_revenue_projection).toBe(60_000_000)
      expect(s.exit_revenue_multiple).toBe(6)
      expect(s.target_roi_x).toBe(12)

      // Sector flag flipped — guards against NACE auto-seed silently
      // overriding the preset on a refresh.
      expect(s._sectorWasUserSet).toBe(true)
    })

    it('preserves existing free-text description on preset re-apply', async () => {
      const { B2B_SAAS_PRESEED_PRESET, UPSWITCH_DEMO_PRESET } = await import(
        '@/features/startup-studio/data/presets'
      )
      // Founder picks a SaaS preset (no description), types their own,
      // then switches to Upswitch demo (which has a description).
      useStartupValuationStore.getState().applyPreset(B2B_SAAS_PRESEED_PRESET)
      useStartupValuationStore.getState().setField('description', 'My custom pitch.')

      useStartupValuationStore.getState().applyPreset(UPSWITCH_DEMO_PRESET)
      // Upswitch preset HAS a description so this one wins — that's the
      // intended behaviour for this preset (it's a self-demo).
      expect(useStartupValuationStore.getState().description).toContain('Upswitch')

      // But going back to a preset without a description preserves the
      // founder's text.
      useStartupValuationStore.getState().setField('description', 'Founder text wins.')
      useStartupValuationStore.getState().applyPreset(B2B_SAAS_PRESEED_PRESET)
      expect(useStartupValuationStore.getState().description).toBe('Founder text wins.')
    })

    it('Upswitch preset lifts the pedigree multiplier to 1.35× (veteran)', async () => {
      const { UPSWITCH_DEMO_PRESET } = await import('@/features/startup-studio/data/presets')
      useStartupValuationStore.getState().applyPreset(UPSWITCH_DEMO_PRESET)
      const flags = useStartupValuationStore.getState().founder_pedigree
      // domain_expert_10y (+0.15) + second_time_founder (+0.10)
      // + has_technical_cofounder (+0.10) = 1.35×
      expect(calculatePedigreeMultiplier(flags)).toBeCloseTo(1.35, 5)
    })
  })

  describe('inception lens overlay', () => {
    it('defaults to milestones_driven (no-op overlay)', () => {
      expect(useStartupValuationStore.getState().inception_lens).toBe('milestones_driven')
    })

    it('omits lens from payload when default', () => {
      // Engine treats absence as `milestones_driven` so a default
      // payload should not include the field — saves a wasteful
      // round-trip and keeps the wire format minimal.
      const payload = useStartupValuationStore.getState().toRequestPayload()
      expect(payload).not.toHaveProperty('inception_lens')
    })

    it('threads non-default lens through to the request payload', () => {
      useStartupValuationStore.getState().setField('inception_lens', 'inception_bet')
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        inception_lens?: string
      }
      expect(payload.inception_lens).toBe('inception_bet')
    })

    it('momentum_driven and inception_bet are valid options', () => {
      const s = useStartupValuationStore.getState()
      s.setField('inception_lens', 'momentum_driven')
      expect(useStartupValuationStore.getState().inception_lens).toBe('momentum_driven')
      s.setField('inception_lens', 'inception_bet')
      expect(useStartupValuationStore.getState().inception_lens).toBe('inception_bet')
    })
  })

  describe('founder pedigree overlay', () => {
    it('defaults to all-false flags so the multiplier is neutral', () => {
      const s = useStartupValuationStore.getState()
      expect(s.founder_pedigree).toEqual({
        prior_exit: false,
        top_unicorn_alumnus: false,
        domain_expert_10y: false,
        second_time_founder: false,
        has_technical_cofounder: false,
        solo_founder: false,
      })
      expect(calculatePedigreeMultiplier(s.founder_pedigree)).toBe(1.0)
    })

    it('omits founder_pedigree from the payload when neutral', () => {
      // Engine treats the absence of the field as "no overlay" — sending
      // an all-false object would be a wasteful round-trip.
      const payload = useStartupValuationStore.getState().toRequestPayload()
      expect(payload).not.toHaveProperty('founder_pedigree')
    })

    it('threads a single flag through to the request payload', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: Record<string, boolean>
      }
      expect(payload.founder_pedigree).toBeDefined()
      expect(payload.founder_pedigree?.prior_exit).toBe(true)
      expect(payload.founder_pedigree?.solo_founder).toBe(false)
    })

    it('mutually excludes solo_founder and has_technical_cofounder', () => {
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('has_technical_cofounder', true)
      s.setPedigreeFlag('solo_founder', true)
      const after = useStartupValuationStore.getState().founder_pedigree
      expect(after.solo_founder).toBe(true)
      expect(after.has_technical_cofounder).toBe(false)

      // And the reverse direction works too
      s.setPedigreeFlag('has_technical_cofounder', true)
      const flipped = useStartupValuationStore.getState().founder_pedigree
      expect(flipped.has_technical_cofounder).toBe(true)
      expect(flipped.solo_founder).toBe(false)
    })

    // -----------------------------------------------------------------
    // Evidence gate (April 2026 hardening) — frontend half of the
    // engine's `pedigree_evidence` contract.
    // -----------------------------------------------------------------

    it('defaults pedigree_evidence to an empty dict', () => {
      const s = useStartupValuationStore.getState()
      expect(s.pedigree_evidence).toEqual({})
    })

    it('threads pedigree_evidence into the request payload alongside the flags', () => {
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('prior_exit', true)
      s.setPedigreeEvidence('prior_exit', 'https://crunchbase.com/exits/example')

      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: Record<string, unknown> & {
          pedigree_evidence?: Record<string, string>
        }
      }
      expect(payload.founder_pedigree).toBeDefined()
      expect(payload.founder_pedigree?.prior_exit).toBe(true)
      expect(payload.founder_pedigree?.pedigree_evidence).toEqual({
        prior_exit: 'https://crunchbase.com/exits/example',
      })
    })

    it('trims pedigree evidence in toRequestPayload while the store keeps raw text', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      useStartupValuationStore
        .getState()
        .setPedigreeEvidence('prior_exit', '  https://example.com/ref  ')
      expect(useStartupValuationStore.getState().pedigree_evidence.prior_exit).toBe(
        '  https://example.com/ref  '
      )
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: { pedigree_evidence?: Record<string, string> }
      }
      expect(payload.founder_pedigree?.pedigree_evidence).toEqual({
        prior_exit: 'https://example.com/ref',
      })
    })

    it('drops pedigree evidence keys that are only whitespace in the payload', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      useStartupValuationStore.getState().setPedigreeFlag('second_time_founder', true)
      useStartupValuationStore.setState({
        pedigree_evidence: {
          prior_exit: 'exit ref',
          second_time_founder: '   ',
        },
      })
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: { pedigree_evidence?: Record<string, string> }
      }
      expect(payload.founder_pedigree?.pedigree_evidence).toEqual({
        prior_exit: 'exit ref',
      })
    })

    it('truncates pedigree evidence to PEDIGREE_EVIDENCE_MAX_LEN in the payload', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      const long = 'a'.repeat(PEDIGREE_EVIDENCE_MAX_LEN + 100)
      useStartupValuationStore.setState({ pedigree_evidence: { prior_exit: long } })
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: { pedigree_evidence?: Record<string, string> }
      }
      expect(payload.founder_pedigree?.pedigree_evidence?.prior_exit).toHaveLength(
        PEDIGREE_EVIDENCE_MAX_LEN
      )
      expect(payload.founder_pedigree?.pedigree_evidence?.prior_exit).toBe(
        'a'.repeat(PEDIGREE_EVIDENCE_MAX_LEN)
      )
    })

    it('omits unknown pedigree_evidence keys from the payload', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      useStartupValuationStore.setState({
        pedigree_evidence: {
          prior_exit: 'ok',
          attacker_injected: 'nope',
        } as Record<string, string>,
      })
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: { pedigree_evidence?: Record<string, string> }
      }
      expect(payload.founder_pedigree?.pedigree_evidence).toEqual({ prior_exit: 'ok' })
    })

    it('strips empty/whitespace-only evidence strings from the persisted dict', () => {
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('domain_expert_10y', true)
      s.setPedigreeEvidence('domain_expert_10y', '12y at IBM')
      s.setPedigreeEvidence('domain_expert_10y', '   ')
      const after = useStartupValuationStore.getState().pedigree_evidence
      expect(after).toEqual({})
    })

    it('preserves trailing spaces while typing (trim only for empty check)', () => {
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('domain_expert_10y', true)
      s.setPedigreeEvidence('domain_expert_10y', '12y M&A ')
      expect(useStartupValuationStore.getState().pedigree_evidence.domain_expert_10y).toBe(
        '12y M&A '
      )
    })

    it('setPedigreeEvidence truncates values longer than PEDIGREE_EVIDENCE_MAX_LEN', () => {
      useStartupValuationStore.getState().setPedigreeFlag('prior_exit', true)
      const suffix = 'END'
      const long = `${'a'.repeat(PEDIGREE_EVIDENCE_MAX_LEN)}${suffix}`
      useStartupValuationStore.getState().setPedigreeEvidence('prior_exit', long)
      expect(useStartupValuationStore.getState().pedigree_evidence.prior_exit).toHaveLength(
        PEDIGREE_EVIDENCE_MAX_LEN
      )
      expect(useStartupValuationStore.getState().pedigree_evidence.prior_exit).toBe(
        'a'.repeat(PEDIGREE_EVIDENCE_MAX_LEN)
      )
    })

    it('applyFromSnapshot normalizes nested pedigree_evidence like the API', () => {
      useStartupValuationStore.getState().applyFromSnapshot({
        founder_pedigree: {
          prior_exit: true,
          top_unicorn_alumnus: false,
          domain_expert_10y: false,
          second_time_founder: false,
          has_technical_cofounder: false,
          solo_founder: false,
          pedigree_evidence: {
            prior_exit: `  ${'b'.repeat(PEDIGREE_EVIDENCE_MAX_LEN + 40)}  `,
            junk_key: 'dropped',
          },
        },
      })
      const ev = useStartupValuationStore.getState().pedigree_evidence
      expect(Object.keys(ev)).toEqual(['prior_exit'])
      expect(ev.prior_exit).toBe('b'.repeat(PEDIGREE_EVIDENCE_MAX_LEN))
    })

    it('clears the evidence string when the founder un-ticks the claim', () => {
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('top_unicorn_alumnus', true)
      s.setPedigreeEvidence('top_unicorn_alumnus', 'Senior PM @ Adyen 2018-2021')
      expect(useStartupValuationStore.getState().pedigree_evidence).toEqual({
        top_unicorn_alumnus: 'Senior PM @ Adyen 2018-2021',
      })

      s.setPedigreeFlag('top_unicorn_alumnus', false)
      expect(useStartupValuationStore.getState().pedigree_evidence).toEqual({})
    })

    it('keeps an empty pedigree_evidence dict in the payload when at least one flag is set', () => {
      // Engine needs to see the contract even when empty — that's how
      // the gate signals "this UI knows about evidence, the founder
      // chose not to provide any" vs "this UI is older and doesn't
      // gate at all".
      const s = useStartupValuationStore.getState()
      s.setPedigreeFlag('prior_exit', true)
      const payload = useStartupValuationStore.getState().toRequestPayload() as {
        founder_pedigree?: Record<string, unknown> & {
          pedigree_evidence?: Record<string, string>
        }
      }
      expect(payload.founder_pedigree?.pedigree_evidence).toEqual({})
    })

    it('calculatePedigreeMultiplier sums active deltas with clamp', () => {
      // 1.0 + 0.30 = 1.30 — single qualification.
      expect(
        calculatePedigreeMultiplier({
          prior_exit: true,
          top_unicorn_alumnus: false,
          domain_expert_10y: false,
          second_time_founder: false,
          has_technical_cofounder: false,
          solo_founder: false,
        })
      ).toBeCloseTo(1.3, 5)

      // Maxed-out case (all positive) clamps at the 1.80 ceiling.
      expect(
        calculatePedigreeMultiplier({
          prior_exit: true,
          top_unicorn_alumnus: true,
          domain_expert_10y: true,
          second_time_founder: true,
          has_technical_cofounder: true,
          solo_founder: false,
        })
      ).toBe(1.8)

      // Solo-only case lands at 0.80 — above the floor.
      expect(
        calculatePedigreeMultiplier({
          prior_exit: false,
          top_unicorn_alumnus: false,
          domain_expert_10y: false,
          second_time_founder: false,
          has_technical_cofounder: false,
          solo_founder: true,
        })
      ).toBeCloseTo(0.8, 5)
    })
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
