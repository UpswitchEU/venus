/**
 * MilestoneCard — store-binding contract.
 *
 * Picking a maturity level must:
 *   1. Update `state.maturity[key]` to the chosen level (so the Studio
 *      can highlight the selected pill on next render).
 *   2. Mirror the choice into the legacy 0–100 score field
 *      (`state.<key>`) so the engine payload built by `toRequestPayload`
 *      stays byte-identical to the legacy slider panel.
 *
 * The two-store-paths-in-one-action design is what lets us ship the
 * wizard without touching the Python engine — break this contract and
 * the engine silently sees zeros for the milestone.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MATURITY_TO_SCORE,
  useStartupValuationStore,
} from '@/store/manual/useStartupValuationStore'
import { MilestoneCard } from './MilestoneCard'

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      weight: 'weight',
      whatInvestorsLookFor: 'What investors look for',
      beneluxExamples: 'Benelux examples',
      yourEvidence: 'Your evidence (optional)',
    }
    return map[key] ?? key
  },
  useLocale: () => 'en',
}))

const initialSnapshot = useStartupValuationStore.getState()

describe('MilestoneCard', () => {
  afterEach(() => {
    useStartupValuationStore.setState(initialSnapshot, true)
  })

  it('writes both the maturity bucket and the legacy 0–100 score on pick', () => {
    render(<MilestoneCard milestoneKey="sound_idea" maxPerMilestoneEur={500_000} />)

    // Maturity choices are a `radiogroup` with `role="radio"` children.
    // The current "strong" copy for `sound_idea` ships with the
    // "100–1,000 free users — first paying customers" rung.  Match a
    // distinctive substring so the test survives minor copy edits but
    // still binds to the third option (strong) rather than basic.
    const strongOption = screen
      .getAllByRole('radio')
      .find((btn) => /100[–-]1,?000\s+free\s+users/i.test(btn.textContent ?? ''))
    expect(strongOption, 'expected to find a "strong" maturity radio').toBeDefined()
    if (strongOption) fireEvent.click(strongOption)

    const state = useStartupValuationStore.getState()
    expect(state.maturity.sound_idea).toBe('strong')
    expect(state.sound_idea).toBe(MATURITY_TO_SCORE.strong)
  })

  it('renders the per-option EUR chip when maxPerMilestoneEur is provided', () => {
    render(<MilestoneCard milestoneKey="prototype_status" maxPerMilestoneEur={600_000} />)

    // 600k * 100/100 for "exceptional" → €600k label
    expect(screen.getByText(/€\s*600/i)).toBeInTheDocument()
  })

  it('renders the weight badge when weightPct is supplied (Scorecard cards)', () => {
    render(<MilestoneCard milestoneKey="opportunity_size" weightPct={25} maxPerMilestoneEur={0} />)

    expect(screen.getByText(/25%/)).toBeInTheDocument()
  })

  it('exposes a real radiogroup with keyboard navigation (a11y)', () => {
    render(<MilestoneCard milestoneKey="sound_idea" maxPerMilestoneEur={500_000} />)

    const group = screen.getByRole('radiogroup')
    expect(group).toBeInTheDocument()

    const radios = screen.getAllByRole('radio')
    // Each milestone offers four maturity levels: none / basic / strong
    // / exceptional — see `MATURITY_TO_SCORE`.
    expect(radios).toHaveLength(4)

    // ArrowDown from `none` (default) should land on `basic` — the
    // second option in the maturityOptions list.  The handler lives on
    // the radiogroup so we synthesize the event there rather than on a
    // child radio.
    fireEvent.keyDown(group, { key: 'ArrowDown' })
    expect(useStartupValuationStore.getState().maturity.sound_idea).toBe('basic')

    // End jumps to the last option (`exceptional`).
    fireEvent.keyDown(group, { key: 'End' })
    expect(useStartupValuationStore.getState().maturity.sound_idea).toBe('exceptional')

    // Home jumps back to the first option (`none`).
    fireEvent.keyDown(group, { key: 'Home' })
    expect(useStartupValuationStore.getState().maturity.sound_idea).toBe('none')
  })
})
