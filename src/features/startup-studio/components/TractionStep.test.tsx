/**
 * TractionStep — slider + engagement signal contract.
 *
 * Pins the live-preview affordances added 2026-05-19:
 *   1. The MRR currency input still drives `useStartupValuationStore.mrr`.
 *   2. The new active-users currency input drives `active_users`, the
 *      end-to-end Mercury → Titan → ValuationIQ payload field that feeds
 *      defensibility `_engagement_bump`.
 *   3. The engagement badge tone reflects the user-count band:
 *      - <100 active users → "none" (no credit copy)
 *      - 100–999 active users → "token" (+10% copy)
 *      - 1 000+ active users → "real" (+25% copy)
 *      These thresholds mirror `ENGAGEMENT_USERS_TOKEN_THRESHOLD` and
 *      `ENGAGEMENT_USERS_REAL_THRESHOLD` on the engine so a drift on
 *      either side is caught by the test rather than by an investor.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStartupValuationStore } from '@/store/manual/useStartupValuationStore'
import { TractionStep } from './TractionStep'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, args?: Record<string, unknown>) =>
    args ? `${key}:${JSON.stringify(args)}` : key,
  useLocale: () => 'en',
}))

// The live-valuation hook reads from a benchmark fetcher that hits the
// network; we don't need the actual value for the store-write contracts.
vi.mock('@/lib/benchmarks/useStartupBenchmark', () => ({
  useStartupBenchmark: () => ({
    benchmark: {
      country_code: 'BE',
      stage: 'pre_seed',
      sector: 'saas',
      berkus_max_per_milestone_eur: 500_000,
      average_pre_money_eur: 1_500_000,
      comparable_exit_revenue_multiple: 5,
      default_target_roi_x: 30,
      default_dilution_pct: 60,
      default_yoy_growth_factor: 3,
    },
    loading: false,
    error: null,
  }),
}))

const initialSnapshot = useStartupValuationStore.getState()

describe('TractionStep — engagement signal contract', () => {
  beforeEach(() => {
    useStartupValuationStore.setState(initialSnapshot, true)
  })

  afterEach(() => {
    useStartupValuationStore.setState(initialSnapshot, true)
  })

  it('writes active_users to the store as the founder types', () => {
    render(<TractionStep />)

    const input = screen.getByLabelText(/engagementLabel/) as HTMLInputElement
    fireEvent.change(input, { target: { value: '500' } })

    expect(useStartupValuationStore.getState().active_users).toBe(500)
  })

  it('renders the "no credit" badge below 100 active users', () => {
    useStartupValuationStore.setState(
      { ...initialSnapshot, active_users: 25 },
      true
    )
    render(<TractionStep />)

    expect(screen.getByText('engagementBadgeNone')).toBeTruthy()
  })

  it('renders the "token engagement" badge at 100 – 999 active users', () => {
    useStartupValuationStore.setState(
      { ...initialSnapshot, active_users: 500 },
      true
    )
    render(<TractionStep />)

    expect(screen.getByText('engagementBadgeToken')).toBeTruthy()
  })

  it('renders the "real engagement" badge at 1 000+ active users', () => {
    useStartupValuationStore.setState(
      { ...initialSnapshot, active_users: 2_500 },
      true
    )
    render(<TractionStep />)

    expect(screen.getByText('engagementBadgeReal')).toBeTruthy()
  })

  it('does NOT clear active_users when toggling revenue to "no"', () => {
    // Engagement is independent of recurring-revenue status — a
    // pre-revenue marketplace founder with 500 active accounts must
    // not lose that signal when they pick "No revenue yet".
    useStartupValuationStore.setState(
      {
        ...initialSnapshot,
        active_users: 500,
        mrr: 1_000,
        revenue_status: 'yes',
      },
      true
    )
    render(<TractionStep />)

    const noButton = screen.getByText('noRevenue')
    fireEvent.click(noButton)

    const state = useStartupValuationStore.getState()
    expect(state.mrr).toBeNull()
    expect(state.active_users).toBe(500) // preserved
  })
})
