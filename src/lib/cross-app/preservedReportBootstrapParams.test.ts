import { describe, expect, it } from 'vitest'
import { buildPreservedReportBootstrapQueryString } from './preservedReportBootstrapParams'

describe('buildPreservedReportBootstrapQueryString', () => {
  it('keeps only non-empty allowlisted keys in array order', () => {
    const q = buildPreservedReportBootstrapQueryString({
      clientId: 'c1',
      session_key: 'val_x',
      source: 'mercury',
      utm_source: 'drop-me',
    })
    expect(q).toBe('?clientId=c1&session_key=val_x&source=mercury')
  })

  it('preserves benchmark_contribution=0 (opt-out)', () => {
    expect(buildPreservedReportBootstrapQueryString({ benchmark_contribution: '0' })).toBe(
      '?benchmark_contribution=0'
    )
  })

  it('preserves waarderen studio=legacy with flow=startup', () => {
    const q = buildPreservedReportBootstrapQueryString({
      flow: 'startup',
      studio: 'legacy',
    })
    expect(q).toBe('?flow=startup&studio=legacy')
  })

  it('preserves prefill_from=landing alongside selected_method=startup_valuation', () => {
    // The anonymous landing → authenticated handoff hinges on this
    // exact param surviving the /[locale]/reports/new redirect.  Drop
    // ``prefill_from`` from the allowlist by accident and the auth
    // bootstrap will never know to consume the localStorage handoff,
    // and the founder lands in a blank wizard.
    const q = buildPreservedReportBootstrapQueryString({
      selected_method: 'startup_valuation',
      prefill_from: 'landing',
    })
    expect(q).toBe('?selected_method=startup_valuation&prefill_from=landing')
  })

  it('preserves blended selected_methods from Mercury advisor handoffs', () => {
    const q = buildPreservedReportBootstrapQueryString({
      selected_method: 'ebitda_multiple',
      selected_methods: 'ebitda_multiple,dcf',
      source: 'mercury',
    })
    expect(q).toBe(
      '?source=mercury&selected_method=ebitda_multiple&selected_methods=ebitda_multiple%2Cdcf'
    )
  })

  it('preserves the Mercury advisor agent_next handoff intent', () => {
    const q = buildPreservedReportBootstrapQueryString({
      drawer: 'open',
      agent_next: 'run_valuation',
      source: 'mercury',
    })
    expect(q).toBe('?source=mercury&drawer=open&agent_next=run_valuation')
  })

  it('preserves the assistant handoff alias used by Titan workflow actions', () => {
    const q = buildPreservedReportBootstrapQueryString({
      drawer: 'open',
      ai_next: 'profileBuyers',
      source: 'mercury',
    })
    expect(q).toBe('?source=mercury&drawer=open&ai_next=profileBuyers')
  })
})
