import { beforeEach, describe, expect, it } from 'vitest'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { applyStartupIssueQuickFix, getStartupIssueQuickFixLabel } from './startupIssueQuickFix'

describe('startupIssueQuickFix', () => {
  beforeEach(() => {
    useStartupValuationStore.getState().reset()
  })

  it('exposes labels only for deterministic quick fixes', () => {
    expect(getStartupIssueQuickFixLabel('missing_investment_ask', 'en')).toBe('Use stage default')
    expect(getStartupIssueQuickFixLabel('recurring_sector_no_arr', 'nl')).toBe(
      'Markeer pre-revenue'
    )
    expect(getStartupIssueQuickFixLabel('missing_company_name', 'en')).toBeUndefined()
  })

  it('restores the stage-default investment ask', () => {
    const store = useStartupValuationStore.getState()
    store.setField('stage', 'series_a')
    store.setField('investment_amount_sought', null)

    expect(
      applyStartupIssueQuickFix('missing_investment_ask', useStartupValuationStore.getState())
    ).toBe(true)
    expect(useStartupValuationStore.getState().investment_amount_sought).toBe(3_000_000)
  })

  it('fills missing exit-story defaults without overwriting founder values', () => {
    const store = useStartupValuationStore.getState()
    store.setField('sector', 'fintech')
    store.setField('country_code', 'BE')
    store.setField('stage', 'seed')
    store.setField('year5_revenue_projection', null)
    store.setField('exit_revenue_multiple', 9)
    store.setField('target_roi_x', 1)

    expect(applyStartupIssueQuickFix('no_exit_story', useStartupValuationStore.getState())).toBe(
      true
    )

    const next = useStartupValuationStore.getState()
    expect(next.year5_revenue_projection).toBe(6_000_000)
    expect(next.exit_revenue_multiple).toBe(9)
    expect(next.target_roi_x).toBe(20)
  })

  it('marks recurring-revenue sectors as explicitly pre-revenue', () => {
    const store = useStartupValuationStore.getState()
    store.setField('revenue_status', 'yes')
    store.setField('mrr', 10_000)
    store.setField('arr', 120_000)
    store.setField('mrr_growth_rate_pct', 8)
    store.setField('monthly_churn_pct', 2)
    store.setField('cac', 900)
    store.setField('ltv', 8_000)

    expect(
      applyStartupIssueQuickFix('recurring_sector_no_arr', useStartupValuationStore.getState())
    ).toBe(true)

    const next = useStartupValuationStore.getState()
    expect(next.revenue_status).toBe('no')
    expect(next.mrr).toBeNull()
    expect(next.arr).toBeNull()
    expect(next.mrr_growth_rate_pct).toBeNull()
    expect(next.monthly_churn_pct).toBeNull()
    expect(next.cac).toBeNull()
    expect(next.ltv).toBeNull()
  })

  it('ignores issue ids that are not deterministic to apply', () => {
    expect(
      applyStartupIssueQuickFix('missing_company_name', useStartupValuationStore.getState())
    ).toBe(false)
  })
})
