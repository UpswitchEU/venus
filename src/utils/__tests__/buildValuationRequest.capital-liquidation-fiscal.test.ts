import { describe, expect, it } from 'vitest'
import { buildValuationRequest } from '../buildValuationRequest'
import { makeFormData } from './buildValuationRequest.testUtils'

describe('buildValuationRequest capital, liquidation, and fiscal bridges', () => {
  describe('capital history bridge', () => {
    it('omits cap_table and investment_amount_sought when no capital fields are set', () => {
      const result = buildValuationRequest(makeFormData(), [])
      expect(result.cap_table).toBeUndefined()
      expect(result.investment_amount_sought).toBeUndefined()
    })

    it('maps capital_round_amount to top-level investment_amount_sought', () => {
      const result = buildValuationRequest(makeFormData({ capital_round_amount: 750_000 }), [])
      expect(result.investment_amount_sought).toBe(750_000)
      // No `capital_history_enabled` flag ⇒ no cap_table block.
      expect(result.cap_table).toBeUndefined()
    })

    it('builds cap_table with SAFEs + option pool + last-round when enabled', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_round_amount: 500_000,
          capital_option_pool_pct: 12,
          capital_safe_notes: [
            {
              id: 'safe-1',
              amount: 100_000,
              valuation_cap: 5_000_000,
              discount_pct: 20,
              holder_label: 'Angel #1',
            },
            {
              id: 'safe-2',
              amount: 50_000,
            },
          ],
          capital_last_round_amount: 250_000,
          capital_last_round_post_money: 2_500_000,
          capital_last_round_date: '2024-06-15',
        }),
        []
      )

      expect(result.investment_amount_sought).toBe(500_000)
      expect(result.cap_table).toBeDefined()
      expect(result.cap_table?.option_pool_pct).toBe(12)
      expect(result.cap_table?.last_round_amount).toBe(250_000)
      expect(result.cap_table?.last_round_post_money).toBe(2_500_000)
      expect(result.cap_table?.last_round_date).toBe('2024-06-15')
      // SAFE notes: ids stripped, optional fields preserved when present.
      expect(result.cap_table?.safe_notes).toEqual([
        {
          amount: 100_000,
          valuation_cap: 5_000_000,
          discount_pct: 20,
          holder_label: 'Angel #1',
        },
        {
          amount: 50_000,
        },
      ])
    })

    it('drops SAFE notes whose amount is missing (incomplete row guard)', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_option_pool_pct: 10,
          capital_safe_notes: [
            { id: 'safe-1', amount: 100_000 },
            { id: 'safe-2', amount: null }, // user added a row but didn't fill the amount
          ],
        }),
        []
      )
      expect(result.cap_table?.safe_notes).toHaveLength(1)
      expect(result.cap_table?.safe_notes?.[0]).toEqual({ amount: 100_000 })
    })

    it('omits cap_table when capital_history_enabled is false even with SAFEs persisted', () => {
      // The toggle is the gate — a founder who fills in SAFEs and then
      // toggles "no, first round" can keep their inputs in form-store
      // without the engine seeing them.  Same affordance as the deal-
      // structure section.
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: false,
          capital_safe_notes: [{ id: 'safe-1', amount: 100_000 }],
          capital_option_pool_pct: 10,
        }),
        []
      )
      expect(result.cap_table).toBeUndefined()
    })

    it('strips empty holder_label and skips invalid optional fields', () => {
      const result = buildValuationRequest(
        makeFormData({
          capital_history_enabled: true,
          capital_safe_notes: [
            {
              id: 'safe-1',
              amount: 100_000,
              valuation_cap: null,
              discount_pct: null,
              holder_label: '   ',
            },
          ],
        }),
        []
      )
      const note = result.cap_table?.safe_notes?.[0]
      expect(note).toBeDefined()
      expect(note).toEqual({ amount: 100_000 })
    })
  })

  describe('liquidation_inputs (Phase 2-4 advisor overrides)', () => {
    it('omits liquidation_inputs entirely when no liq_* field is set', () => {
      const result = buildValuationRequest(makeFormData(), [])
      // Empty dict would overwrite engine defaults with nothing on the
      // wire; unset is the right default so the valuation-iq orchestrator
      // treats it as "engine defaults" (Graydon/KPMG cohort).
      expect(result.liquidation_inputs).toBeUndefined()
    })

    it('bundles all 4 LiquidationInputsSection essentials + premise override', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 12,
          liq_monthly_rent: 8_500,
          liq_paid_up_capital: 250_000,
          liq_deferred_tax: 35_000,
          liq_premise_override: 'orderly_liquidation',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // Pinned for the audit 2026-05-10 wiring fix: liquidation_inputs
      // must survive the build → Titan Zod → legacy Pydantic → orchestrator
      // chain.  Field-name parity matches `calculate_liquidation_method`
      // kwargs verbatim — DO NOT rename without a coordinated migration.
      expect(result.liquidation_inputs).toEqual({
        headcount: 12,
        monthly_rent: 8_500,
        paid_up_capital: 250_000,
        deferred_tax_liabilities: 35_000,
        owner_premise_override: 'orderly_liquidation',
      })
    })

    it('coerces headcount to a non-negative integer', () => {
      const result = buildValuationRequest(
        makeFormData({
          // Decimal headcount is meaningless — must be floored to integer.
          liq_headcount: 7.8,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(result.liquidation_inputs?.headcount).toBe(7)
    })

    it('drops invalid premise override values silently', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
          // typo / invalid string — must NOT propagate; engine would reject
          // an unknown premise enum.
          liq_premise_override: 'going_concern_typo',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // headcount still emits; premise_override is dropped.
      expect(result.liquidation_inputs?.headcount).toBe(5)
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.owner_premise_override
      ).toBeUndefined()
    })

    it('rejects going_concern as a premise (intentionally not exposed)', () => {
      // Liquidation analysis is in STANDALONE_METHODS — picking
      // going_concern would contradict the report's IVS 104 §80 premise.
      // Even if the form somehow emitted it, the build path must drop it.
      const result = buildValuationRequest(
        makeFormData({
          liq_premise_override: 'going_concern',
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(result.liquidation_inputs).toBeUndefined()
    })

    it('bundles per-tier liability buckets under liability_buckets', () => {
      // Pinned 2026-05-10: supplying explicit buckets is what flips
      // the cascade page from "estimated from jurisdiction defaults"
      // (engine warning) to a real EY/Big-4-grade waterfall.  Keys
      // map verbatim to `CascadeTierCode` on the engine side.
      const result = buildValuationRequest(
        makeFormData({
          liq_lb_estate_costs: 5_000,
          liq_lb_secured: 120_000,
          liq_lb_super_preferent_employees: 45_000,
          liq_lb_preferent_tax: 30_000,
          liq_lb_preferent_other: 10_000,
          liq_lb_unsecured: 200_000,
          liq_lb_subordinated: 25_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs).toBeDefined()
      expect(inputs.liability_buckets).toEqual({
        estate_costs: 5_000,
        secured: 120_000,
        super_preferent_employees: 45_000,
        preferent_tax: 30_000,
        preferent_other: 10_000,
        unsecured: 200_000,
        subordinated: 25_000,
      })
    })

    it('drops zero / negative liability bucket entries', () => {
      // Engine treats a missing tier as 0; a 0 input would still
      // surface the explicit-mode branch with a noisier wire.  Strip
      // them so the dict is minimal.
      const result = buildValuationRequest(
        makeFormData({
          liq_lb_secured: 0,
          liq_lb_unsecured: -100,
          liq_lb_preferent_tax: 50_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const buckets = (result.liquidation_inputs as Record<string, unknown>)
        ?.liability_buckets as Record<string, number>
      expect(buckets).toEqual({ preferent_tax: 50_000 })
    })

    it('omits liability_buckets when no tier is supplied', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      // Engine defaults fire; the wire stays clean.
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.liability_buckets
      ).toBeUndefined()
    })

    it('bundles asset_overrides per class as nested {adjusted_value} dicts', () => {
      // Engine expects asset_overrides keyed by `AssetClass.value`,
      // each entry a dict with optional `adjusted_value` /
      // `orderly_recovery_factor` / etc.  Venus only surfaces
      // `adjusted_value` today.
      const result = buildValuationRequest(
        makeFormData({
          liq_ao_machinery_equipment: 120_000,
          liq_ao_buildings: 500_000,
          liq_ao_intangibles: 25_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs.asset_overrides).toEqual({
        machinery_equipment: { adjusted_value: 120_000 },
        buildings: { adjusted_value: 500_000 },
        intangibles: { adjusted_value: 25_000 },
      })
    })

    it('drops zero / negative asset overrides', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_ao_cash: 0,
          liq_ao_land: -1000,
          liq_ao_vehicles: 15_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.asset_overrides).toEqual({
        vehicles: { adjusted_value: 15_000 },
      })
    })

    it('omits asset_overrides when no class is overridden', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_headcount: 5,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.asset_overrides
      ).toBeUndefined()
    })

    it('forwards realised_capital_gains when positive (BE meerwaarde / NL Vpb-14a base)', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_realised_capital_gains: 150_000,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.realised_capital_gains).toBe(
        150_000
      )
    })

    it('drops realised_capital_gains when zero or negative', () => {
      // Engine treats 0 as "no gains"; emitting 0 explicitly is
      // noise on the wire.
      const result = buildValuationRequest(
        makeFormData({
          liq_realised_capital_gains: 0,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.realised_capital_gains
      ).toBeUndefined()
    })

    it('forwards runway_months_forced + distress_wacc_forced (forced-scenario inputs)', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_runway_months_forced: 4,
          liq_distress_wacc_forced: 0.3,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      const inputs = result.liquidation_inputs as Record<string, unknown>
      expect(inputs.runway_months_forced).toBe(4)
      expect(inputs.distress_wacc_forced).toBe(0.3)
    })

    it('floors runway_months_forced to a positive integer', () => {
      const result = buildValuationRequest(
        makeFormData({
          liq_runway_months_forced: 4.7,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect((result.liquidation_inputs as Record<string, unknown>)?.runway_months_forced).toBe(4)
    })

    it('forwards identifiable_intangibles_uplift_pct as a decimal', () => {
      // Stored as decimal (0.20 = 20%); engine accepts the decimal form.
      const result = buildValuationRequest(
        makeFormData({
          liq_intangibles_uplift_pct: 0.2,
        } as unknown as Partial<ValuationFormData>),
        []
      )
      expect(
        (result.liquidation_inputs as Record<string, unknown>)?.identifiable_intangibles_uplift_pct
      ).toBe(0.2)
    })
  })

  describe('fiscal_inputs (meerwaardebelasting / Art. 90 WIB 92)', () => {
    // The data rail captures only the four amount values for the
    // cedent's 31/12/2025 cost-basis filing. Advisory metadata
    // (peildatum, company role, EBITDA basis, internal-transfer flag,
    // anchors-acknowledged attestation) is auto-derived by the report
    // builder OR set on `request.metadata` via firm/transaction settings
    // — never collected on the data rail. See FiscalInputsSection.tsx
    // header comment for the rail / metadata split.
    type RequestWithFiscal = ReturnType<typeof buildValuationRequest> & {
      fiscal_inputs?: Record<string, unknown>
    }

    it('omits fiscal_inputs entirely when no fiscal_* field is set', () => {
      const result = buildValuationRequest(makeFormData(), []) as RequestWithFiscal
      // Empty dict would be wire noise; unset is the right default so
      // the aggregator treats the run as "engine defaults".
      expect(result.fiscal_inputs).toBeUndefined()
    })

    it('emits the four amount keys when populated', () => {
      const result = buildValuationRequest(
        makeFormData({
          fiscal_acquisition_cost: 850_000,
          fiscal_anchor_2_value: 900_000,
          fiscal_anchor_3_value: 1_100_000,
          fiscal_anchor_4_value: 1_050_000,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs).toEqual({
        acquisition_cost: 850_000,
        anchor_2_value: 900_000,
        anchor_3_value: 1_100_000,
        anchor_4_value: 1_050_000,
      })
    })

    it('emits a partial dict when only some anchors are filled', () => {
      const result = buildValuationRequest(
        makeFormData({
          fiscal_acquisition_cost: 500_000,
          fiscal_anchor_3_value: 600_000,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs).toEqual({
        acquisition_cost: 500_000,
        anchor_3_value: 600_000,
      })
    })

    it('coerces numeric values and skips non-finite ones', () => {
      const result = buildValuationRequest(
        makeFormData({
          // @ts-expect-error — runtime guard against legacy stringly-typed values
          fiscal_anchor_2_value: '750000',
          // @ts-expect-error — NaN should be dropped, not propagated
          fiscal_anchor_3_value: Number.NaN,
          fiscal_anchor_4_value: 0,
        }),
        []
      ) as RequestWithFiscal

      expect(result.fiscal_inputs?.anchor_2_value).toBe(750_000)
      expect(result.fiscal_inputs?.anchor_3_value).toBeUndefined()
      // 0 is a legitimate value (a contract formula can yield zero); preserve it.
      expect(result.fiscal_inputs?.anchor_4_value).toBe(0)
    })
  })
})
