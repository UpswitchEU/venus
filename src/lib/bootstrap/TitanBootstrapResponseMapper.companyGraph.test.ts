import { describe, expect, it } from 'vitest'
import { buildSuccessfulTitanState } from './TitanBootstrapResponseMapper'

const OWNER_GRAPH_CONTEXT = {
  company_node_id: '11111111-1111-4111-8111-111111111111',
  graph_revision: 'a'.repeat(64),
  maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
  ruleset_version: 'company-graph-maturity/v3',
  audience: 'owner',
} as const

function buildState(
  companyGraphContext: unknown,
  identityType: 'authenticated' | 'accountant_for_client' = 'authenticated'
) {
  return buildSuccessfulTitanState(
    {
      identity: { type: identityType },
      report: {
        mode: 'new',
        reportId: 'val-company-graph',
        hasExistingData: false,
        status: 'draft',
      },
      prefill: {
        sources: [],
        confidence: 0,
        fieldsPopulated: [],
        fieldsRemaining: [],
        company_graph_context: companyGraphContext,
      },
      ui: {},
    },
    { url: 'https://valuation.upswitch.app/en/reports/new', locale: 'en' },
    performance.now()
  )
}

describe('Titan bootstrap company graph context boundary', () => {
  it('retains the exact owner context for an authenticated owner', () => {
    const state = buildState(OWNER_GRAPH_CONTEXT)

    expect(state.prefillData.companyGraphContext).toBe(OWNER_GRAPH_CONTEXT)
  })

  it('retains an advisor context only for delegated advisor identity', () => {
    const advisorContext = { ...OWNER_GRAPH_CONTEXT, audience: 'advisor' as const }

    expect(
      buildState(advisorContext, 'accountant_for_client').prefillData.companyGraphContext
    ).toBe(advisorContext)
    expect(
      buildState(advisorContext, 'authenticated').prefillData.companyGraphContext
    ).toBeUndefined()
  })

  it.each([
    'public',
    'buyer',
  ])('drops a %s context from private workspace bootstrap', (audience) => {
    const state = buildState({ ...OWNER_GRAPH_CONTEXT, audience })

    expect(state.prefillData.companyGraphContext).toBeUndefined()
  })

  it('does not accept a camelCase wire alias from Titan', () => {
    const state = buildSuccessfulTitanState(
      {
        identity: { type: 'authenticated' },
        report: {
          mode: 'new',
          reportId: 'val-company-graph',
          hasExistingData: false,
          status: 'draft',
        },
        prefill: {
          sources: [],
          confidence: 0,
          fieldsPopulated: [],
          fieldsRemaining: [],
          companyGraphContext: OWNER_GRAPH_CONTEXT,
        } as never,
        ui: {},
      },
      { url: 'https://valuation.upswitch.app/en/reports/new', locale: 'en' },
      performance.now()
    )

    expect(state.prefillData.companyGraphContext).toBeUndefined()
  })
})
