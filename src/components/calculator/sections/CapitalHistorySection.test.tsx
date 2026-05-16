/**
 * CapitalHistorySection — UX + form-store integration contract.
 *
 * Pins the load-bearing behaviours so a regression that quietly drops
 * cap-table inputs on the floor (Wintercircus would never know) is
 * caught at unit-test time:
 *
 *   1. Default state is **expanded** — the section only mounts on the
 *      SaaS valuation path, where most founders have prior rounds to
 *      declare.
 *   2. The "First round / Raised before" toggle renders without a
 *      click; toggling to "Raised before" reveals the SAFE editor and
 *      option pool / last-round inputs.
 *   3. "Round being raised" lives ABOVE the toggle as the always-
 *      required primary input — the toggle only gates the prior-rounds
 *      disclosure.
 *   4. The SAFE editor's add button writes a new note (with a stable
 *      generated ID) into the form-store.
 *   5. Removing a SAFE clears it from the form-store.
 *
 * Copy assertions go through the i18n key surface (the test mock
 * returns the namespaced key verbatim, e.g. `haveRaisedNo`) so the
 * suite is locale-agnostic; the actual EN/NL strings live in
 * `messages/{en,nl}.json` and are validated by translation linters.
 *
 * The bridge to the canonical request shape is covered by the
 * dedicated bridge tests in `buildValuationRequest.test.ts`; this
 * suite only pins the UI ↔ store contract.
 */

import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useManualFormStore } from '@/store/manual/useManualFormStore'
import { CapitalHistorySection } from './CapitalHistorySection'

// next-intl is required by the design-system inputs and now also by the
// section itself (locale comes from `useTranslations` route locale).
// Mock returns the bare i18n key so assertions can target stable IDs
// rather than copy strings.
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

  it('renders the section header (sectionTitle key) and not the legacy label', () => {
    render(<CapitalHistorySection />)
    expect(screen.getByText('sectionTitle')).toBeInTheDocument()
    // The legacy "Capital history (optional)" copy must not leak back in.
    expect(screen.queryByText('Capital history (optional)')).toBeNull()
  })

  it('starts expanded so first-time founders see the toggle + investment ask without a click', () => {
    render(<CapitalHistorySection />)
    expect(screen.getByText('haveRaisedNo')).toBeInTheDocument()
    expect(screen.getByText('haveRaisedYes')).toBeInTheDocument()
    // The "Round you're raising now" input is mocked as a thin shim
    // that renders its label as plain text.  `roundLabel` is the i18n
    // key returned by the test mock.
    expect(screen.getByText('roundLabel')).toBeInTheDocument()
  })

  it('"Round being raised" sits ABOVE the toggle (always-visible primary input)', () => {
    render(<CapitalHistorySection />)
    const round = screen.getByText('roundLabel')
    const toggleNo = screen.getByText('haveRaisedNo')
    // DocumentPosition: round must come BEFORE toggle in DOM order.
    // 4 = DOCUMENT_POSITION_FOLLOWING (toggleNo follows round).
    expect(round.compareDocumentPosition(toggleNo) & 4).toBe(4)
  })

  it('toggling "Raised before" enables the SAFE editor + option pool inputs', () => {
    render(<CapitalHistorySection />)

    // Sanity: SAFE editor heading not rendered yet on default "First round".
    // The editor passes `title={tSafe('capitalHistoryTitle')}` so under the
    // bare-key mock the heading is the literal "capitalHistoryTitle".
    expect(screen.queryByRole('heading', { name: 'capitalHistoryTitle' })).toBeNull()

    fireEvent.click(screen.getByText('haveRaisedYes'))

    // Form-store now reflects the toggle.
    expect(useManualFormStore.getState().formData.capital_history_enabled).toBe(true)
    expect(screen.getByRole('heading', { name: 'capitalHistoryTitle' })).toBeInTheDocument()
    expect(screen.getByText('optionPoolLabel')).toBeInTheDocument()
    expect(screen.getByText('lastRoundAmountLabel')).toBeInTheDocument()
    // The date input must be wrapped in a labelled block matching its
    // siblings (no raw `<input>` floating in the grid).
    expect(screen.getByText('lastRoundDateLabel')).toBeInTheDocument()
  })

  it('clicking the SAFE add button appends a new note to the form-store', () => {
    render(<CapitalHistorySection />)
    fireEvent.click(screen.getByText('haveRaisedYes'))

    // The SafeNotesEditor's add button is labelled by the bare i18n key
    // 'add' under the test mock.
    fireEvent.click(screen.getByRole('button', { name: 'add' }))

    const notes = useManualFormStore.getState().formData.capital_safe_notes ?? []
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toEqual(expect.any(String))
    expect(notes[0]?.amount).toBeNull()
    expect(notes[0]?.discount_pct).toBe(20)
  })

  it('removing a SAFE drops it from the form-store', () => {
    // Pre-seed the store so we don't depend on the add-then-remove flow.
    useManualFormStore.setState(
      {
        ...initialFormSnapshot,
        formData: {
          ...initialFormSnapshot.formData,
          capital_history_enabled: true,
          capital_safe_notes: [
            { id: 'safe-1', amount: 100_000, holder_label: 'Angel #1' },
            { id: 'safe-2', amount: 50_000 },
          ],
        },
      },
      true
    )

    render(<CapitalHistorySection />)
    // Remove buttons carry `aria-label={t('removeAria')}` — bare key
    // 'removeAria' under the mock.
    const removeButtons = screen.getAllByRole('button', { name: 'removeAria' })
    expect(removeButtons).toHaveLength(2)

    fireEvent.click(removeButtons[0])

    const notes = useManualFormStore.getState().formData.capital_safe_notes ?? []
    expect(notes).toHaveLength(1)
    expect(notes[0]?.id).toBe('safe-2')
  })
})
