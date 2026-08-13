import { describe, expect, it } from 'vitest'
import {
  assertOptionalCompanyGraphContext,
  InvalidCompanyGraphContextError,
  parseCompanyGraphContext,
} from './companyGraphContext'

const VALID_CONTEXT = {
  company_node_id: '11111111-1111-4111-8111-111111111111',
  graph_revision: `sha256:${'a'.repeat(64)}`,
  maturity_snapshot_id: '22222222-2222-4222-8222-222222222222',
  ruleset_version: 'company-graph-maturity/v3',
  audience: 'owner',
} as const

describe('CompanyGraphContext', () => {
  it('accepts the strict owner/advisor wire contract without rebuilding it', () => {
    expect(parseCompanyGraphContext(VALID_CONTEXT)).toBe(VALID_CONTEXT)
    expect(assertOptionalCompanyGraphContext(VALID_CONTEXT)).toBe(VALID_CONTEXT)
    expect(
      parseCompanyGraphContext({
        ...VALID_CONTEXT,
        audience: 'advisor',
      })
    ).not.toBeNull()
  })

  it.each([
    { ...VALID_CONTEXT, audience: 'public' },
    { ...VALID_CONTEXT, audience: 'buyer' },
    { ...VALID_CONTEXT, graph_revision: 'revision-123' },
    { ...VALID_CONTEXT, graph_revision: `sha256:${'A'.repeat(64)}` },
    { ...VALID_CONTEXT, card_tier: 'T5' },
  ])('rejects non-workspace, non-content-addressed or extended contexts', (candidate) => {
    expect(parseCompanyGraphContext(candidate)).toBeNull()
    expect(() => assertOptionalCompanyGraphContext(candidate)).toThrow(
      InvalidCompanyGraphContextError
    )
  })

  it('keeps the compatibility field optional', () => {
    expect(assertOptionalCompanyGraphContext(undefined)).toBeUndefined()
    expect(() => assertOptionalCompanyGraphContext(null)).toThrow(InvalidCompanyGraphContextError)
  })
})
