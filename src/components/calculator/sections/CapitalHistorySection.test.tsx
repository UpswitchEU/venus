/**
 * CapitalHistorySection — UX + form-store integration contract.
 *
 * Pins the load-bearing behaviours so a regression that quietly drops
 * cap-table inputs on the floor (Wintercircus would never know) is
 * caught at unit-test time:
 *
 *   1. Default state is **expanded** — the section only mounts on the
 *      SaaS valuation path, where most founders have prior rounds to
 *      declare.  Keeping it collapsed-by-default produced "I didn't
 *      know that existed" feedback during early Wintercircus runs.
 *   2. The header label reads "Funding so far" (renamed from the more
 *      paperwork-y "Capital history (optional)" — the wording change
 *      is part of the contract because copy reviewers look for it).
 *   3. The "First round / Raised before" toggle renders without a
 *      click; toggling to "Raised before" reveals the SAFE editor and
 *      option pool / last-round inputs.
 *   4. The SAFE editor's add button writes a new note (with a stable
 *      generated ID) into the form-store.
 *   5. Removing a SAFE clears it from the form-store.
 *
 * The bridge to the canonical request shape is covered by the
 * dedicated bridge tests in `buildValuationRequest.test.ts`; this
 * suite only pins the UI ↔ store contract.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { CapitalHistorySection } from './CapitalHistorySection'

// next-intl is required by the design-system inputs but the section
// itself reads the locale via prop.  Match the SaasMetricsSection test's
// approach: stub useLocale + replace heavy inputs with thin shims so the
// suite stays focused on the cap-table UX contract, not currency
// formatting.
vi.mock('next-intl', () => ({
  useLocale: () => 'en',
  useTranslations: () => (key: string) => key,
}))

vi.mock('@/components/calculator/CurrencyInput', () => ({
  CurrencyInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

vi.mock('@/components/calculator/sections/AdaptivePercentInput', () => ({
  AdaptivePercentInput: ({ label }: { label: string }) => <div>{label}</div>,
}))

const initialFormSnapshot = useManualFormStore.getState()

describe('CapitalHistorySection', () => {
  beforeEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
  })
  afterEach(() => {
    useManualFormStore.setState(initialFormSnapshot, true)
  })

  it('renders the renamed "Funding so far" header (not the legacy label)', () => {
    render(<CapitalHistorySection locale="en" />)
    // New label is the contract; legacy label must be gone so copy
    // reviewers don't see two competing strings during QA.
    expect(screen.getByText('Funding so far')).toBeInTheDocument()
    expect(screen.queryByText('Capital history (optional)')).toBeNull()
  })

  it('starts expanded so first-time founders see the toggle + investment ask without a click', () => {
    render(<CapitalHistorySection locale="en" />)
    // No click required — body controls render on first paint.
    expect(screen.getByText('First round')).toBeInTheDocument()
    expect(screen.getByText('Raised before')).toBeInTheDocument()
    expect(screen.getByText(/Round being raised/i)).toBeInTheDocument()
  })

  it('toggling "Raised before" enables the SAFE editor + option pool inputs', () => {
    render(<CapitalHistorySection locale="en" />)

    // Sanity: SAFE editor not rendered yet on default "First round" —
    // we identify the editor by its unique heading
    // "Outstanding SAFEs / convertibles" rather than the loose substring
    // (the section's own intro paragraph mentions SAFEs in passing).
    expect(screen.queryByRole('heading', { name: /Outstanding SAFEs/i })).toBeNull()

    fireEvent.click(screen.getByText('Raised before'))

    // Form-store now reflects the toggle.
    expect(useManualFormStore.getState().formData.capital_history_enabled).toBe(true)
    // SAFE editor + option pool input + last-round inputs become visible.
    // Match the input labels exactly (the section's intro paragraph also
    // contains "existing option pool" in passing).
    expect(screen.getByRole('heading', { name: /Outstanding SAFEs/i })).toBeInTheDocument()
    expect(screen.getByText('Existing option pool (%)')).toBeInTheDocument()
    expect(screen.getByText(/Last round — amount/i)).toBeInTheDocument()
  })

  it('clicking the SAFE button appends a new note to the form-store', () => {
    render(<CapitalHistorySection locale="en" />)
    fireEvent.click(screen.getByText('Raised before'))

    // Empty state copy visible until a note is added.
    expect(screen.getByText('No SAFEs added yet.')).toBeInTheDocument()

    // The "+ SAFE" add button on the editor.  Exact-match the
    // accessible name to avoid colliding with the section header
    // button (whose long description contains "SAFEs").
    fireEvent.click(screen.getByRole('button', { name: /^SAFE$/ }))

    const notes = useManualFormStore.getState().formData.capital_safe_notes ?? []
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toEqual(expect.any(String))
    expect(notes[0]?.amount).toBeNull()
    expect(notes[0]?.discount_pct).toBe(20)
  })

  it('removing a SAFE drops it from the form-store', () => {
    // Pre-seed the store so we don't depend on the add-then-remove flow.
    useManualFormStore.setState({
      ...initialFormSnapshot,
      formData: {
        ...initialFormSnapshot.formData,
        capital_history_enabled: true,
        capital_safe_notes: [
          { id: 'safe-1', amount: 100_000, holder_label: 'Angel #1' },
          { id: 'safe-2', amount: 50_000 },
        ],
      },
    }, true)

    render(<CapitalHistorySection locale="en" />)
    // Section is auto-expanded because the store has data.
    const removeButtons = screen.getAllByRole('button', { name: /Remove SAFE/i })
    expect(removeButtons).toHaveLength(2)

    fireEvent.click(removeButtons[0])

    const notes = useManualFormStore.getState().formData.capital_safe_notes ?? []
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe('safe-2')
  })
})
